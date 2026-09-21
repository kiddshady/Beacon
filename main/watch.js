import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, Tray, Menu, Notification, nativeImage, powerMonitor } from 'electron'
import { getSettings, patchSettings } from './settings.js'

/**
 * Vigilancia continua.
 *
 * Cada N minutos hace el barrido liviano (el preset "¿Quién está en mi red?":
 * ARP + knock TCP, dos segundos, sin puertos) sobre la red elegida, y si la
 * memoria dice que apareció alguien que no estaba, avisa con una notificación
 * del sistema. Mientras está activa, cerrar la ventana la manda a la bandeja en
 * vez de cerrar la app: Beacon sigue mirando desde ahí.
 *
 * Los barridos van por el mismo camino que un escaneo a mano — mismos eventos,
 * misma memoria — así que la ventana, si está abierta, los muestra como si los
 * hubieras pedido vos. La única diferencia es la marca `watch: true` en el evento
 * de arranque, para que el renderer no crea que se disparó solo.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const INTERVALS = [5, 15, 30, 60]
const PRESET = 'who'
/** Si hay un escaneo a mano en curso, se vuelve a intentar enseguida. */
const RETRY_MS = 60 * 1000
/** Al volver de suspensión la red suele haber cambiado: se mira pronto. */
const RESUME_MS = 30 * 1000

export function createWatcher ({ startScan, isScanning, showWindow, notify, listScopes }) {
  let cfg = { enabled: false, intervalMin: 15, scopeId: null, autostart: false }
  let tray = null
  let timer = null
  let running = false
  let lastRun = null
  let nextRun = null
  let lastCount = null
  let scope = null
  let onState = () => {}

  function state () {
    return {
      enabled: cfg.enabled,
      intervalMin: cfg.intervalMin,
      intervals: INTERVALS,
      scopeId: scope?.id || cfg.scopeId,
      cidr: scope?.cidr || null,
      autostart: !!cfg.autostart,
      // Registrar el arranque con Windows necesita el .exe instalado; en dev no hay.
      autostartAvailable: app.isPackaged,
      running,
      lastRun,
      nextRun,
      lastCount
    }
  }

  /**
   * Arrancar con Windows, escondida en la bandeja. Solo tiene sentido con la
   * vigilancia activa: sin ella no habría nada que hacer al arrancar.
   */
  function applyAutostart () {
    if (!app.isPackaged) return
    try {
      app.setLoginItemSettings({
        openAtLogin: !!(cfg.autostart && cfg.enabled),
        path: process.execPath,
        args: ['--hidden']
      })
    } catch (err) {
      console.warn(`[watch] no se pudo registrar el arranque con Windows: ${err.message}`)
    }
  }

  function emit () {
    onState(state())
    refreshTray()
  }

  /* ── Red a vigilar ───────────────────────────────────────────────────── */

  async function resolveScope () {
    const scopes = await listScopes()
    scope = scopes.find(s => s.id === cfg.scopeId) ||
      scopes.find(s => s.kind === 'lan' && s.sweepable) ||
      scopes.find(s => s.sweepable) ||
      null
    return scope
  }

  /* ── Reloj ───────────────────────────────────────────────────────────── */

  function schedule (ms = cfg.intervalMin * 60 * 1000) {
    clearTimeout(timer)
    timer = null
    if (!cfg.enabled) { nextRun = null; return }
    nextRun = Date.now() + ms
    timer = setTimeout(tick, ms)
  }

  async function tick () {
    if (!cfg.enabled) return
    if (running) return
    if (isScanning()) { schedule(RETRY_MS); emit(); return }
    if (!scope && !(await resolveScope())) { schedule(RETRY_MS); emit(); return }

    running = true
    nextRun = null
    emit()
    try {
      const { hosts, diff } = await startScan({ presetId: PRESET, target: { scope }, watch: true })
      lastRun = Date.now()
      lastCount = hosts.length
      console.log(`[watch] ${scope.cidr}: ${hosts.length} aparatos, ${diff?.added?.length || 0} nuevos, ${diff?.missing?.length || 0} ausentes, ${diff?.openedPorts?.length || 0} con puertos nuevos`)
      if (diff?.added?.length) announce(diff.added)
      if (diff?.openedPorts?.length) announcePorts(diff.openedPorts)
    } catch (err) {
      console.warn(`[watch] barrido falló: ${err.message}`)
    } finally {
      running = false
      schedule()
      emit()
    }
  }

  /* ── Avisos ──────────────────────────────────────────────────────────── */

  function announce (added) {
    const names = added.map(a => `${a.name} — ${a.ip}`)
    const title = added.length === 1 ? 'Alguien nuevo en la red' : `${added.length} aparatos nuevos en la red`
    const body = names.slice(0, 4).join('\n') + (names.length > 4 ? `\n…y ${names.length - 4} más` : '')
    notify({ title, body })
  }

  function announcePorts (opened) {
    const lines = opened.map(o => `${o.name}: ${o.ports.length === 1 ? 'puerto' : 'puertos'} ${o.ports.join(', ')}`)
    const title = opened.length === 1
      ? `Puerto nuevo en ${opened[0].name}`
      : `Puertos nuevos en ${opened.length} aparatos`
    notify({ title, body: lines.slice(0, 4).join('\n') + (lines.length > 4 ? `\n…y ${lines.length - 4} más` : '') })
  }

  /* ── Bandeja ─────────────────────────────────────────────────────────── */

  function trayIcon () {
    // La misma placa que el ícono de la app, en un .ico con un render por cada
    // escalado de Windows. build/ viaja adentro del asar; nativeImage lo lee igual.
    const img = nativeImage.createFromPath(join(__dirname, '..', 'build', 'tray.ico'))
    return img.isEmpty() ? nativeImage.createFromPath(join(__dirname, '..', 'build', 'icon.png')).resize({ width: 32 }) : img
  }

  function ensureTray () {
    if (tray) return
    try {
      tray = new Tray(trayIcon())
    } catch (err) {
      console.warn(`[watch] sin bandeja: ${err.message}`)
      return
    }
    tray.on('click', () => showWindow())
    tray.on('double-click', () => showWindow())
    refreshTray()
  }

  function dropTray () {
    if (!tray) return
    tray.destroy()
    tray = null
  }

  function hora (ts) {
    return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }

  function refreshTray () {
    if (!tray) return
    const bits = [`Beacon — vigilando ${scope?.cidr || 'la red'}`]
    if (running) bits.push('barriendo…')
    else if (lastRun) bits.push(`último barrido ${hora(lastRun)}${lastCount != null ? ` · ${lastCount} aparatos` : ''}`)
    tray.setToolTip(bits.join('\n'))

    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir Beacon', click: () => showWindow() },
      { type: 'separator' },
      { label: running ? 'Barriendo…' : 'Barrer ahora', enabled: !running, click: () => scanNow() },
      {
        label: 'Cada',
        submenu: INTERVALS.map(m => ({
          label: `${m} min`, type: 'radio', checked: cfg.intervalMin === m, click: () => configure({ intervalMin: m })
        }))
      },
      { type: 'separator' },
      { label: 'Dejar de vigilar', click: () => configure({ enabled: false }) },
      { label: 'Salir de Beacon', click: () => { app.quitting = true; app.quit() } }
    ]))
  }

  /* ── API ─────────────────────────────────────────────────────────────── */

  async function configure (patch) {
    const next = { ...cfg, ...patch }
    if (!INTERVALS.includes(next.intervalMin)) next.intervalMin = 15
    const scopeChanged = next.scopeId !== cfg.scopeId
    const wasEnabled = cfg.enabled
    cfg = await patchSettings('watch', next)

    if (scopeChanged || !scope) await resolveScope()

    if (cfg.enabled) {
      ensureTray()
      // Recién encendida (o cambió de red): un barrido ya, para tener con qué comparar.
      if (!wasEnabled || scopeChanged) schedule(1500)
      else schedule()
    } else {
      schedule()
      dropTray()
    }
    applyAutostart()
    emit()
    return state()
  }

  function scanNow () {
    if (!cfg.enabled || running) return state()
    clearTimeout(timer)
    tick()
    return state()
  }

  async function init (listener) {
    onState = listener
    cfg = (await getSettings()).watch
    if (cfg.enabled) {
      await resolveScope()
      ensureTray()
      schedule(5000)
    }
    powerMonitor.on('resume', () => { if (cfg.enabled && !running) schedule(RESUME_MS) })
    emit()
  }

  return {
    init,
    configure,
    scanNow,
    state,
    get enabled () { return cfg.enabled },
    dispose () { clearTimeout(timer); dropTray() }
  }
}
