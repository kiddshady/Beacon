import { paintIcons, icon } from './icons.js'
import { installTooltips, watchScrollFade, formatMs, tweenNumber } from './ui.js'
import { Radar } from './radar.js'
import { renderList, renderDetail, renderNotice, renderUpdateNotice, renderDiffNotice, dismissNotice, hotCard, matchesFilter, updatePing } from './panel.js'
import { renderCommand } from './command.js'
import { installAbout } from './about.js'
import { installWatch } from './watch.js'

const $ = (sel) => document.querySelector(sel)

const state = {
  scopes: [],
  presets: [],
  nmap: null,
  version: '',
  versions: {},
  scope: null,
  preset: 'who',
  hosts: new Map(),
  /** Los que estaban la última vez y ahora no contestaron (viene del diff). */
  missing: [],
  diff: null,
  selected: null,
  view: 'list',
  /** Cómo se ve la lista: 'list' o 'grid'. Se recuerda entre sesiones. */
  layout: 'list',
  filter: '',
  /** Ping en vivo del host abierto en el detalle. */
  ping: { ip: null, samples: [] },
  running: false,
  startedAt: 0
}

let radar
let about
let watch

/* ── Arranque ──────────────────────────────────────────────────────────── */

async function boot () {
  // Abierto en un navegador común (sin preload de Electron): puente simulado para
  // poder trabajar la interfaz sola. En la app real esto nunca se carga.
  if (!window.beacon) await import('./mock.js')

  paintIcons()
  installTooltips($('#tooltip'))
  watchScrollFade($('#side-body'))

  try { if (localStorage.getItem('beacon.layout') === 'grid') state.layout = 'grid' } catch { /* sin storage, da igual */ }
  paintLayoutToggle()

  radar = new Radar({
    svg: $('#radar'),
    sweep: $('#radar-sweep'),
    empty: $('#radar-empty'),
    onSelect: (host) => selectHost(host.ip),
    onHover: (host) => hotCard($('#side-body'), host?.ip || null)
  })

  const data = await window.beacon.bootstrap()
  state.scopes = data.scopes
  state.presets = data.presets
  state.nmap = data.nmap
  state.version = data.version || ''
  state.versions = data.versions || {}
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
  watch = installWatch({
    button: $('#watch'),
    bridge: window.beacon.watch,
    getScope: () => state.scope
  })
  renderSide()
}

/* ── Actualizaciones ───────────────────────────────────────────────────── */

/**
 * El proceso principal baja la versión nueva solo. Acá se avisa recién cuando ya
 * está lista: buscar y descargar no le importan a nadie, y un error tampoco
 * (la próxima apertura vuelve a intentar).
 */
function watchUpdates () {
  about = installAbout({
    button: $('#about'),
    bridge: window.beacon.update,
    getInfo: () => ({ version: state.version, versions: state.versions, nmap: state.nmap })
  })

  const onState = (u) => {
    about.setUpdate(u)
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

    b.addEventListener('click', () => choosePreset(p.id))
    return b
  }))
}

function choosePreset (id) {
  if (!state.presets.some(p => p.id === id) || state.preset === id) return
  state.preset = id
  renderPresets()
  refreshCommand()
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

  beginScan()
  try {
    await window.beacon.startScan(state.preset, { scope: state.scope })
  } catch (err) {
    renderNotice($('#notices'), `No se pudo escanear: ${err.message}`)
    finish()
  }
}

/**
 * Deja la interfaz en "escaneando": radar barriendo, lista vacía, botón en rojo.
 * Lo hace el botón antes de pedir el escaneo, y también un barrido que arrancó
 * solo (la vigilancia) cuando llega su evento de inicio.
 */
function beginScan () {
  if (state.running) return
  state.running = true
  state.startedAt = Date.now()
  state.hosts.clear()
  state.missing = []
  state.diff = null
  state.selected = null
  if (state.view === 'detail') state.view = 'list'
  stopPing()
  radar.clear()
  radar.startSweep()
  for (const n of $('#notices').querySelectorAll('[data-kind="diff"]')) dismissNotice(n)

  const btn = $('#run')
  btn.classList.add('running')
  btn.querySelector('[data-icon]')?.remove()
  btn.innerHTML = `<span data-icon="stop"></span>Detener`
  paintIcons(btn)

  $('#progress').classList.add('on')
  $('#phase').classList.add('on')
  $('#phase').classList.remove('done')
  $('#side-body').replaceChildren()
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
      // Un barrido de la vigilancia arranca sin que nadie toque el botón.
      if (evt.watch && !state.running) beginScan()
      renderCommand({ lineEl: $('#command-line'), notesEl: $('#command-notes') }, evt.command)
      break

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

    case 'diff':
      state.diff = evt
      state.missing = evt.missing || []
      renderDiffNotice($('#notices'), evt)
      if (state.view === 'list') renderSide()
      break

    case 'done': {
      const d = state.diff
      const quiet = d && !d.first && d.complete && !d.added.length && !d.missing.length && !d.moved.length
      const n = state.hosts.size
      const count = `${n} dispositivo${n === 1 ? '' : 's'}`
      $('#phase').textContent = evt.stopped
        ? `Detenido — ${count}`
        : `Listo — ${count} en ${formatMs(evt.ms)}${quiet ? ' · sin novedades' : ''}`
      $('#stat-time b').textContent = formatMs(evt.ms)
      finish()
      break
    }
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
  // La grilla es de la lista; el detalle ocupa el panel entero. renderList la vuelve a poner.
  body.classList.remove('grid')

  if (state.view === 'detail' && state.selected) {
    const host = state.hosts.get(state.selected)
    if (host) {
      renderDetail(body, host, {
        onBack: leaveDetail,
        onAlias: host.key ? renameHost : null,
        onWake: (h) => window.beacon.wake(h.mac, state.scope),
        onOpen: (url) => window.beacon.openExternal(url),
        onCopy: (text) => window.beacon.copy(text)
      })
      if (state.ping.ip === host.ip) updatePing(body, state.ping.samples)
      return
    }
  }

  const all = [...state.hosts.values()]
  const hosts = all.filter(h => matchesFilter(h, state.filter))
  const missing = state.missing.filter(m => matchesFilter(m, state.filter))

  renderList(body, hosts, {
    selected: state.selected,
    missing,
    layout: state.layout,
    filter: state.filter,
    onSelect: (h) => selectHost(h.ip),
    onHover: (ip) => radar.highlight(ip)
  })
  paintIcons(body)
  renderFilterBar(all.length + state.missing.length, hosts.length + missing.length)
}

/* ── Filtro y vista ────────────────────────────────────────────────────── */

/** La barra aparece recién cuando hay algo que filtrar. */
function renderFilterBar (total, shown) {
  $('#filter-wrap').classList.toggle('on', total > 0 || !!state.filter)
  $('#filter').classList.toggle('active', !!state.filter)
  $('#filter-count').textContent = state.filter ? `${shown}/${total}` : ''
}

function setFilter (value) {
  const next = value.trim()
  if (next === state.filter && $('#filter-input').value === value) return
  state.filter = next
  if ($('#filter-input').value !== value) $('#filter-input').value = value
  if (state.view === 'list') renderSide()
}

function clearFilter () {
  setFilter('')
}

function toggleLayout () {
  state.layout = state.layout === 'grid' ? 'list' : 'grid'
  try { localStorage.setItem('beacon.layout', state.layout) } catch { /* sin storage, da igual */ }
  paintLayoutToggle()
  if (state.view === 'list') renderSide()
}

/** El botón muestra a qué vista se pasaría, no en cuál se está. */
function paintLayoutToggle () {
  const btn = $('#view-toggle')
  const grid = state.layout === 'grid'
  btn.innerHTML = icon(grid ? 'list' : 'grid')
  btn.dataset.tip = grid ? 'Ver como lista (G)' : 'Ver como grilla (G)'
}

/** Guarda el alias y lo refleja en todos lados: tarjeta, detalle y etiqueta del radar. */
async function renameHost (host, alias) {
  try {
    const saved = await window.beacon.setAlias(host.key, alias, host)
    const current = state.hosts.get(host.ip)
    if (current) {
      current.alias = saved
      radar.update(current)
    }
  } catch (err) {
    renderNotice($('#notices'), `No se pudo guardar el nombre: ${err.message}`)
  }
  renderSide()
}

function selectHost (ip) {
  state.selected = ip
  state.view = 'detail'
  radar.select(ip)
  renderSide()
  paintIcons($('#side-body'))
  startPing(state.hosts.get(ip))
}

/** Vuelve a la lista desde el detalle, por el botón, Esc, la vista o el filtro. */
function leaveDetail () {
  state.view = 'list'
  state.selected = null
  radar.select(null)
  stopPing()
  renderSide()
}

/* ── Ping en vivo ──────────────────────────────────────────────────────── */

function startPing (host) {
  if (!host || !window.beacon.ping) return
  state.ping = { ip: host.ip, samples: [] }
  window.beacon.ping.start(host.ip, host.ports?.[0]?.port)
}

function stopPing () {
  if (!state.ping.ip) return
  state.ping = { ip: null, samples: [] }
  window.beacon.ping?.stop()
}

function onPingSample (s) {
  if (s.ip !== state.ping.ip) return
  state.ping.samples.push(s)
  if (state.ping.samples.length > 40) state.ping.samples.shift()
  if (state.view === 'detail' && state.selected === s.ip) updatePing($('#side-body'), state.ping.samples)
}

/* ── Controles ─────────────────────────────────────────────────────────── */

function wireControls () {
  $('#run').addEventListener('click', run)

  $('#view-toggle').addEventListener('click', () => {
    if (state.view === 'detail') leaveDetail()
    toggleLayout()
  })

  $('#filter-input').addEventListener('input', e => setFilter(e.target.value))
  $('#filter-clear').addEventListener('click', () => { clearFilter(); $('#filter-input').focus() })

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
  window.beacon.ping?.onSample(onPingSample)
  // El principal corta el ping cuando la ventana se esconde; al volver se pide de nuevo.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.view === 'detail' && state.selected) startPing(state.hosts.get(state.selected))
  })

  document.addEventListener('keydown', onKey)
}

/**
 * Atajos. Esc hace lo más cercano a lo que estás haciendo: sale del campo de
 * filtro, vuelve del detalle, detiene el escaneo, o limpia el filtro — en ese
 * orden. Las teclas sueltas no actúan mientras se escribe en un campo.
 */
function onKey (e) {
  const mod = e.ctrlKey || e.metaKey
  const typing = e.target.matches?.('input, textarea')

  if (mod && e.key === 'Enter') { e.preventDefault(); run(); return }
  if (mod && e.key === ',') { e.preventDefault(); about?.open(); return }

  if (e.key === 'Escape') {
    if (typing) { e.target.blur(); return }
    if (state.view === 'detail') { leaveDetail(); return }
    if (state.running) { window.beacon.stopScan(); return }
    if (state.filter) clearFilter()
    return
  }

  if (typing || mod || e.altKey) return

  if (e.key === '/') {
    e.preventDefault()
    if (state.view === 'detail') leaveDetail()
    $('#filter-wrap').classList.add('on')
    $('#filter-input').focus()
    $('#filter-input').select()
    return
  }
  if (e.key === 'g' || e.key === 'G') { toggleLayout(); return }
  if (/^[1-9]$/.test(e.key)) {
    const p = state.presets[Number(e.key) - 1]
    if (p) choosePreset(p.id)
  }
}

boot()
