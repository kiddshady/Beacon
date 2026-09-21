import { paintIcons, icon } from './icons.js'
import { installTooltips, watchScrollFade, formatMs, tweenNumber } from './ui.js'
import { Radar } from './radar.js'
import { renderList, renderDetail, renderNotice, renderUpdateNotice } from './panel.js'
import { renderCommand } from './command.js'

const $ = (sel) => document.querySelector(sel)

const state = {
  scopes: [],
  presets: [],
  nmap: null,
  version: '',
  scope: null,
  preset: 'who',
  hosts: new Map(),
  selected: null,
  view: 'list',
  running: false,
  startedAt: 0
}

let radar

/* ── Arranque ──────────────────────────────────────────────────────────── */

async function boot () {
  // Abierto en un navegador común (sin preload de Electron): puente simulado para
  // poder trabajar la interfaz sola. En la app real esto nunca se carga.
  if (!window.beacon) await import('./mock.js')

  paintIcons()
  installTooltips($('#tooltip'))
  watchScrollFade($('#side-body'))

  radar = new Radar({
    svg: $('#radar'),
    sweep: $('#radar-sweep'),
    empty: $('#radar-empty'),
    onSelect: (host) => selectHost(host.ip)
  })

  const data = await window.beacon.bootstrap()
  state.scopes = data.scopes
  state.presets = data.presets
  state.nmap = data.nmap
  state.version = data.version || ''
  state.scope = data.scopes.find(s => s.kind === 'lan') || data.scopes[0] || null

  renderScopes()
  renderPresets()
  updateBrand()
  await refreshCommand()

  if (state.nmap?.outdated) {
    renderNotice($('#notices'),
      `Tenés nmap ${state.nmap.version}, que ya tiene sus años. Beacon anda igual, ` +
      `pero una versión 7.9x identifica bastante mejor los servicios.`)
  }

  wireControls()
  watchUpdates()
  renderSide()
}

/* ── Actualizaciones ───────────────────────────────────────────────────── */

/**
 * El proceso principal baja la versión nueva solo. Acá se avisa recién cuando ya
 * está lista: buscar y descargar no le importan a nadie, y un error tampoco
 * (la próxima apertura vuelve a intentar).
 */
function watchUpdates () {
  const onState = (u) => {
    if (u.phase !== 'ready') return
    renderUpdateNotice($('#notices'), { next: u.next, onInstall: () => window.beacon.update.install() })
  }
  window.beacon.update.onState(onState)
  window.beacon.update.state().then(onState)
}

function updateBrand () {
  const bits = []
  if (state.version) bits.push(`v${state.version}`)
  if (state.scope) bits.push(state.scope.cidr)
  if (state.nmap?.available) bits.push(`nmap ${state.nmap.version}${state.nmap.elevated ? ' · admin' : ''}`)
  else bits.push('sin nmap')
  $('#brand-sub').textContent = bits.join('  ·  ')
}

/* ── Selector de red ───────────────────────────────────────────────────── */

function renderScopes () {
  const wrap = $('#scope-picker')
  wrap.replaceChildren(...state.scopes.map(s => {
    const b = document.createElement('button')
    b.className = 'scope'
    b.setAttribute('aria-pressed', String(s.id === state.scope?.id))
    b.dataset.tip = s.sweepable
      ? `${s.iface} — ${s.hostCount} direcciones posibles`
      : `${s.iface} — demasiado grande para barrer entera; se muestran los vecinos conocidos`
    if (!s.sweepable && s.kind !== 'mesh') b.disabled = true
    b.innerHTML = `<b>${s.label}</b><span>${s.cidr}</span>`
    b.addEventListener('click', () => {
      state.scope = s
      renderScopes()
      updateBrand()
      refreshCommand()
    })
    return b
  }))
}

/* ── Presets ───────────────────────────────────────────────────────────── */

function renderPresets () {
  const wrap = $('#presets')
  wrap.replaceChildren(...state.presets.map(p => {
    const b = document.createElement('button')
    b.className = 'preset'
    b.setAttribute('aria-pressed', String(p.id === state.preset))
    b.textContent = p.label

    let tip = p.blurb
    if (p.needsNmap && !state.nmap?.available) tip += ' · requiere nmap instalado'
    else if (p.needsAdmin && !state.nmap?.elevated) tip += ' · sin admin se hace la versión reducida'
    b.dataset.tip = tip

    b.addEventListener('click', () => {
      state.preset = p.id
      renderPresets()
      refreshCommand()
    })
    return b
  }))
}

async function refreshCommand () {
  if (!state.scope) return
  const target = state.presets.find(p => p.id === state.preset)?.id === 'exposed'
    ? state.scope.address
    : state.scope.cidr

  const cmd = await window.beacon.previewCommand(state.preset, target)
  renderCommand({ lineEl: $('#command-line'), notesEl: $('#command-notes') }, cmd)
}

/* ── Escaneo ───────────────────────────────────────────────────────────── */

async function run () {
  if (state.running) {
    await window.beacon.stopScan()
    return
  }
  if (!state.scope) return

  state.running = true
  state.startedAt = Date.now()
  state.hosts.clear()
  state.selected = null
  radar.clear()
  radar.startSweep()

  const btn = $('#run')
  btn.classList.add('running')
  btn.querySelector('[data-icon]')?.remove()
  btn.innerHTML = `<span data-icon="stop"></span>Detener`
  paintIcons(btn)

  $('#progress').classList.add('on')
  $('#phase').classList.add('on')
  $('#phase').classList.remove('done')
  $('#side-body').replaceChildren()

  try {
    await window.beacon.startScan(state.preset, { scope: state.scope })
  } catch (err) {
    renderNotice($('#notices'), `No se pudo escanear: ${err.message}`)
    finish()
  }
}

function finish () {
  state.running = false
  radar.stopSweep()

  const btn = $('#run')
  btn.classList.remove('running')
  btn.innerHTML = `<span data-icon="play"></span>Escanear`
  paintIcons(btn)

  $('#progress').classList.remove('on')
  $('#phase').classList.add('done')
}

/* ── Eventos del motor ─────────────────────────────────────────────────── */

function handleEvent (evt) {
  switch (evt.type) {
    case 'start':
    case 'command':
      renderCommand({ lineEl: $('#command-line'), notesEl: $('#command-notes') }, evt.command)
      break

    case 'phase':
      $('#phase').textContent = evt.label
      break

    case 'progress': {
      const pct = evt.total ? (evt.done / evt.total) * 100 : 0
      $('#progress i').style.width = `${pct}%`
      break
    }

    case 'host':
    case 'host:update': {
      const known = state.hosts.get(evt.host.ip)
      state.hosts.set(evt.host.ip, evt.host)

      if (known) radar.update(evt.host)
      else radar.add(evt.host)

      updateStats()
      if (state.view === 'list') renderSide()
      else if (state.selected === evt.host.ip) renderSide()
      break
    }

    case 'notice':
      renderNotice($('#notices'), evt.message)
      break

    case 'error':
      renderNotice($('#notices'), evt.message)
      break

    case 'done':
      $('#phase').textContent = evt.stopped
        ? `Detenido — ${state.hosts.size} dispositivos`
        : `Listo — ${state.hosts.size} dispositivos en ${formatMs(evt.ms)}`
      $('#stat-time b').textContent = formatMs(evt.ms)
      finish()
      break
  }
}

function updateStats () {
  const hosts = [...state.hosts.values()]
  const ports = hosts.reduce((n, h) => n + (h.ports?.length || 0), 0)
  tweenNumber($('#stat-found b'), hosts.length)
  tweenNumber($('#stat-ports b'), ports)
}

/* ── Panel lateral ─────────────────────────────────────────────────────── */

function renderSide () {
  const body = $('#side-body')

  if (state.view === 'detail' && state.selected) {
    const host = state.hosts.get(state.selected)
    if (host) {
      renderDetail(body, host, { onBack: () => { state.view = 'list'; state.selected = null; radar.select(null); renderSide() } })
      return
    }
  }

  renderList(body, [...state.hosts.values()], {
    selected: state.selected,
    onSelect: (h) => selectHost(h.ip)
  })
  paintIcons(body)
}

function selectHost (ip) {
  state.selected = ip
  state.view = 'detail'
  radar.select(ip)
  renderSide()
  paintIcons($('#side-body'))
}

/* ── Controles ─────────────────────────────────────────────────────────── */

function wireControls () {
  $('#run').addEventListener('click', run)

  $('#view-toggle').addEventListener('click', () => {
    state.view = state.view === 'detail' ? 'list' : 'list'
    state.selected = null
    radar.select(null)
    renderSide()
  })

  $('#copy-cmd').addEventListener('click', async () => {
    await window.beacon.copy($('#command-line').textContent)
    const btn = $('#copy-cmd')
    btn.innerHTML = icon('check')
    setTimeout(() => { btn.innerHTML = icon('copy') }, 1300)
  })

  $('#win-min').addEventListener('click', () => window.beacon.win.minimize())
  $('#win-max').addEventListener('click', () => window.beacon.win.maximize())
  $('#win-close').addEventListener('click', () => window.beacon.win.close())

  window.beacon.onScanEvent(handleEvent)

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.view === 'detail') {
      state.view = 'list'
      state.selected = null
      radar.select(null)
      renderSide()
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run()
  })
}

boot()
