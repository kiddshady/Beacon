import { paintIcons, icon } from './icons.js'
import { installTooltips, watchScrollFade, formatMs, tweenNumber, afterExit, hostName } from './ui.js'
import { Radar } from './radar.js'
import { renderList, renderDetail, renderNotice, renderUpdateNotice, renderDiffNotice, dismissNotice, hotCard, matchesFilter, updatePing } from './panel.js'
import { renderCommand } from './command.js'
import { installAbout } from './about.js'
import { installWatch } from './watch.js'
import { installExport } from './export.js'
import { installHistory } from './history.js'

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
  /** IP que se está profundizando (escaneo de uno solo), o null. */
  single: null,
  running: false,
  startedAt: 0,
  durationMs: null
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
  watchScrollFade($('#scope-picker'), { axis: 'x' })

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
    getScope: () => state.scope,
    getScopes: () => state.scopes
  })
  installHistory({
    button: $('#history'),
    bridge: window.beacon,
    getScope: () => state.scope
  })
  installExport({
    button: $('#export'),
    bridge: window.beacon,
    notices: $('#notices'),
    radarPane: document.querySelector('.radar-pane'),
    getData: () => ({
      version: state.version,
      scope: state.scope,
      preset: state.preset,
      startedAt: state.startedAt,
      durationMs: state.durationMs,
      hosts: [...state.hosts.values()],
      missing: state.missing
    })
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
  const chips = state.scopes.map(s => {
    const b = document.createElement('button')
    b.className = 'scope'
    if (s.custom) b.classList.add('custom')
    b.setAttribute('aria-pressed', String(s.id === state.scope?.id))
    b.dataset.tip = s.custom
      ? `Rango a mano — ${s.hostCount} direcciones${s.iface !== 'A mano' ? ` · dentro de ${s.iface}` : ''}`
      : s.sweepable
        ? `${s.iface} — ${s.hostCount} direcciones posibles`
        : `${s.iface} — demasiado grande para barrer entera; se muestran los vecinos conocidos`
    if (!s.sweepable && s.kind !== 'mesh') b.disabled = true
    b.innerHTML = `<b>${s.label}</b><span>${s.cidr}</span>`
    b.addEventListener('click', () => chooseScope(s))
    return b
  })

  // El último chip abre un campo para escribir una subred o un rango.
  const add = document.createElement('button')
  add.className = 'scope scope-add'
  add.dataset.tip = 'Escaneá otra red: una subred (10.0.0.0/24), un rango (192.168.1.1-50) o una IP'
  add.innerHTML = `<b>${icon('edit')}Otro rango</b><span>a mano</span>`
  add.addEventListener('click', () => editScope(add))
  chips.push(add)

  wrap.replaceChildren(...chips)
  // Con muchas interfaces la fila scrollea: la elegida siempre queda a la vista.
  wrap.querySelector('[aria-pressed="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
}

function chooseScope (s) {
  state.scope = s
  renderScopes()
  updateBrand()
  refreshCommand()
}

/**
 * El chip "Otro rango" se vuelve un campo. Enter valida en el principal y, si
 * está bien, el rango entra como una red más (reemplaza al anterior a mano) y
 * queda elegido. Esc o salir del campo lo cancelan.
 */
function editScope (chip) {
  const current = state.scopes.find(s => s.custom)
  const wrap = document.createElement('div')
  wrap.className = 'scope scope-input'
  wrap.innerHTML = `<input type="text" spellcheck="false" autocomplete="off" placeholder="10.0.0.0/24 · 192.168.1.1-50" maxlength="40">`
  const input = wrap.querySelector('input')
  input.value = current?.text || ''

  let done = false
  const finish = () => {
    if (done) return
    done = true
    window.beaconTip?.hide()
    wrap.classList.add('closing')
    afterExit(wrap, () => wrap.replaceWith(chip), { event: 'transitionend', property: 'opacity', ms: 300 })
  }

  input.addEventListener('keydown', async e => {
    if (e.key === 'Escape') { e.stopPropagation(); finish(); return }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const text = input.value.trim()
    if (!text) { finish(); return }
    try {
      const scope = await window.beacon.customScope(text)
      state.scopes = [...state.scopes.filter(s => !s.custom), scope]
      done = true
      chooseScope(scope)
    } catch (err) {
      input.classList.add('invalid')
      input.dataset.tip = err.message
      window.beaconTip?.show(input, err.message)
      setTimeout(() => input.classList.remove('invalid'), 600)
    }
  })
  input.addEventListener('input', () => { input.classList.remove('invalid'); delete input.dataset.tip; window.beaconTip?.hide() })
  input.addEventListener('blur', () => setTimeout(finish, 120))

  chip.replaceWith(wrap)
  void wrap.offsetHeight
  wrap.classList.add('on')
  wrap.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  input.focus()
  input.select()
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
  state.single = null
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
  if (evt.single) return handleSingleEvent(evt)

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
      renderLegend()
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
      state.durationMs = evt.ms
      finish()
      break
    }
  }
}

/** La leyenda aparece con el primer aparato, y solo dice lo que hay en pantalla. */
function renderLegend () {
  const hosts = [...state.hosts.values()]
  if (!hosts.length) return
  const items = [['', 'contesta']]
  if (hosts.some(h => (h.ports || []).length)) items.push(['ring', 'anillo: puertos abiertos'])
  if (hosts.some(h => (h.ports || []).some(p => p.risk === 'warn'))) items.push(['warn', 'puerto riesgoso'])
  if (hosts.some(h => h.memory?.isNew)) items.push(['new', 'nuevo en la red'])
  if (hosts.some(h => h.isSelf)) items.push(['self', 'esta máquina'])

  const legend = $('#radar-legend')
  const key = items.map(i => i[0]).join('|')
  if (legend.dataset.key === key) return
  legend.dataset.key = key
  legend.replaceChildren(...items.map(([cls, text], i) => {
    const span = document.createElement('span')
    span.className = `legend-item ${cls}`
    span.style.animationDelay = `${i * 60}ms`
    span.innerHTML = `<i></i>${text}`
    return span
  }))
}

/* ── Profundizar en uno solo ───────────────────────────────────────────── */

/**
 * Escaneo profundo de un solo aparato, desde su detalle. No borra nada: los
 * hallazgos se funden en el host que ya está y el detalle se va actualizando.
 */
async function deepen (host) {
  if (state.running || state.single) return
  state.single = host.ip
  renderSide()
  try {
    await window.beacon.deepen(host.ip, state.scope?.cidr)
  } catch (err) {
    renderNotice($('#notices'), `No se pudo profundizar: ${err.message}`)
    state.single = null
    renderSide()
  }
}

/** Los eventos de un escaneo de uno solo: mismo host, misma tarjeta, sin tocar el resto. */
function handleSingleEvent (evt) {
  switch (evt.type) {
    case 'start':
      state.single = evt.single
      $('#progress').classList.add('on')
      $('#phase').classList.add('on')
      $('#phase').classList.remove('done')
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
      // Solo se funde lo del aparato que ya estaba: un escaneo de uno no suma otros.
      if (!state.hosts.has(evt.host.ip)) break
      state.hosts.set(evt.host.ip, evt.host)
      radar.update(evt.host)
      updateStats()
      renderLegend()
      renderSide()
      break
    }

    case 'notice':
    case 'error':
      renderNotice($('#notices'), evt.message)
      break

    case 'done': {
      const host = state.hosts.get(evt.single)
      const n = host?.ports?.length || 0
      $('#phase').textContent = evt.stopped
        ? `Profundización detenida — ${hostName(host || { ip: evt.single })}`
        : `Listo — ${hostName(host || { ip: evt.single })}: ${n} puerto${n === 1 ? '' : 's'} en ${formatMs(evt.ms)}`
      $('#phase').classList.add('done')
      $('#progress').classList.remove('on')
      state.single = null
      renderSide()
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
        onCopy: (text) => window.beacon.copy(text),
        onDeepen: window.beacon.deepen && !state.running ? deepen : null,
        deepening: state.single === host.ip
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
