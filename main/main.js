import { app, BrowserWindow, ipcMain, shell, clipboard, Notification } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { listScopes } from './net/interfaces.js'
import { Scanner } from './net/scanner.js'
import { nmapInfo, buildCommand } from './net/nmap.js'
import { PRESETS } from './net/presets.js'
import { wake } from './net/wol.js'
import { createPinger } from './net/ping.js'
import * as updater from './updater.js'
import * as memory from './memory.js'
import { createWatcher } from './watch.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5273'
const isDev = !app.isPackaged

/** La base oscura. Electron 40 la usa para teñir el frame que pinta el compositor de
 *  Windows al restaurar; sin esto vuelve el destello blanco. */
const BASE = '#060a07'

let win = null
/** @type {Scanner|null} */
let scanner = null
/** Lo que está corriendo ahora, si algo corre. Se limpia al terminar. */
let activeScan = null

/**
 * Con la vigilancia activa, cerrar la ventana la esconde en la bandeja en vez
 * de cerrar la app. Salir de verdad (menú de la bandeja) marca esto antes.
 */
app.quitting = false

// Una sola instancia: con la ventana escondida en la bandeja, abrir Beacon de
// nuevo tiene que traer la que ya está, no sumar otra con otro ícono.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
}

function createWindow () {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    show: false,
    frame: false,
    backgroundColor: BASE,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.once('ready-to-show', () => win.show())

  if (isDev) win.loadURL(DEV_URL)
  else win.loadFile(join(__dirname, '..', 'dist', 'index.html'))

  // Los links externos no secuestran la ventana.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('close', (e) => {
    if (app.quitting || !watcher.enabled) return
    e.preventDefault()
    win.hide()
  })
  // Escondida no hay quien mire el ping; el renderer lo vuelve a pedir al volver.
  win.on('hide', () => pinger.stop())
  win.on('minimize', () => pinger.stop())
  win.on('closed', () => { win = null; pinger.stop() })

  if (process.env.BEACON_CAPTURE) captureAndExit(win)
}

/**
 * Modo captura: arranca, corre un escaneo real, guarda un PNG y se va.
 * Sirve para revisar cómo quedó la app sin tener que estar mirándola.
 */
async function captureAndExit (win) {
  const { writeFile } = await import('node:fs/promises')
  const wait = (ms) => new Promise(r => setTimeout(r, ms))

  win.webContents.once('did-finish-load', async () => {
    try {
      await wait(1200)

      const preset = process.env.BEACON_CAPTURE_PRESET
      if (preset) {
        await win.webContents.executeJavaScript(
          `[...document.querySelectorAll('.preset')].find(b => b.textContent.includes(${JSON.stringify(preset)}))?.click()`
        )
        await wait(400)
      }

      await win.webContents.executeJavaScript('document.querySelector("#run").click()')
      await wait(parseInt(process.env.BEACON_CAPTURE_WAIT || '9000', 10))

      const shots = (process.env.BEACON_CAPTURE_STEPS || '').split(',').filter(Boolean)
      for (const step of shots) {
        await win.webContents.executeJavaScript(step)
        await wait(900)
      }

      const image = await win.webContents.capturePage()
      await writeFile(process.env.BEACON_CAPTURE, image.toPNG())
      console.log(`captura guardada en ${process.env.BEACON_CAPTURE}`)

      // Volcar lo que el renderer tiene de verdad: la captura muestra cómo se ve,
      // esto muestra con qué datos se dibujó.
      const dump = await win.webContents.executeJavaScript(
        `JSON.stringify([...document.querySelectorAll('.host-card')].map(c => c.textContent))`
      )
      console.log('tarjetas:', dump)
    } catch (err) {
      console.error('captura falló:', err.message)
    }
    app.exit(0)
  })
}

/** Trae la ventana al frente; si se cerró del todo, la vuelve a crear. */
function showWindow () {
  if (!win || win.isDestroyed()) { createWindow(); return }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** Un toast del sistema. Click: abrir Beacon. */
function notify ({ title, body }) {
  if (!Notification.isSupported()) return
  try {
    const n = new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 256) })
    n.on('click', () => showWindow())
    n.show()
  } catch { /* los avisos son lo mejor que se puede, no obligatorios */ }
}

const send = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload) }

const pinger = createPinger((sample) => send('ping:sample', sample))

const watcher = createWatcher({
  startScan,
  isScanning: () => !!activeScan,
  showWindow,
  notify
})

app.whenReady().then(async () => {
  // Windows atribuye los toasts a un AppUserModelID; empaquetada tiene que ser el
  // appId del instalador o el aviso se descarta en silencio. En dev queda el default.
  if (app.isPackaged) { try { app.setAppUserModelId('com.kiddshady.beacon') } catch { /* sin soporte */ } }

  updater.registerIPC()
  createWindow()
  // En dev no busca nada; empaquetada, consulta GitHub unos segundos después de abrir.
  updater.start(() => win)
  await watcher.init((state) => send('watch:state', state))
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => { app.quitting = true })

app.on('window-all-closed', () => {
  scanner?.stop()
  watcher.dispose()
  if (process.platform !== 'darwin') app.quit()
})

/* ── Escaneo ────────────────────────────────────────────────────────────── */

/**
 * Corre un escaneo y lo cuenta al renderer evento por evento. Lo usan el botón
 * (por IPC) y la vigilancia (desde acá). Devuelve los hosts y el diff contra la
 * memoria, que es lo que la vigilancia necesita para saber si avisar.
 */
async function startScan ({ presetId, target, watch = false }) {
  scanner?.stop()
  const preset = PRESETS.find(p => p.id === presetId)
  if (!preset) throw new Error(`preset desconocido: ${presetId}`)

  // La memoria compara contra la foto anterior de esta red. Un escaneo de "esta
  // máquina" sola no es una foto de la red: no se compara ni se guarda.
  const session = preset.scope === 'self' ? null : await memory.openSession(target.scope.cidr)
  // El scanner emite `done` y devuelve sin esperar a nadie; el commit de la
  // memoria es asíncrono. Se guarda su promesa para esperarla antes de contestar,
  // si no el diff llega después de que ya se contestó (y la vigilancia no lo ve).
  let finishing = Promise.resolve(null)

  const current = new Scanner({
    preset,
    target,
    onEvent: (evt) => {
      if (evt.type === 'start' && watch) evt.watch = true
      if (!session) return send('scan:event', evt)

      if (evt.type === 'host' || evt.type === 'host:update') {
        evt.host = session.annotate(evt.host)
      }
      if (evt.type === 'done') {
        evt.hosts = evt.hosts.map(h => session.annotate(h))
        finishing = session.commit(evt.hosts, { preset: preset.id, complete: !evt.stopped })
          .then(diff => { send('scan:event', { type: 'diff', ...diff }); return diff })
          .catch(err => { send('scan:event', { type: 'notice', message: `No se pudo guardar la memoria de la red: ${err.message}` }); return null })
          .finally(() => send('scan:event', evt))
        return
      }
      send('scan:event', evt)
    }
  })

  scanner = current
  activeScan = current.run().finally(() => { if (scanner === current) { scanner = null; activeScan = null } })
  const hosts = await activeScan
  const diff = await finishing
  return { hosts, diff }
}

/* ── IPC ────────────────────────────────────────────────────────────────── */

ipcMain.handle('app:bootstrap', async () => ({
  version: app.getVersion(),
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  scopes: await listScopes(),
  nmap: await nmapInfo(),
  presets: PRESETS.map(({ id, label, blurb, needsNmap, needsAdmin }) => ({
    id, label, blurb, needsNmap, needsAdmin
  }))
}))

ipcMain.handle('scan:preview', (_e, { presetId, target }) =>
  buildCommand(PRESETS.find(p => p.id === presetId), target)
)

ipcMain.handle('scan:start', async (_e, { presetId, target }) => (await startScan({ presetId, target })).hosts)

ipcMain.handle('device:alias', (_e, { key, alias, host }) => memory.setAlias(key, alias, host))

/** Solo http(s) y solo a donde el renderer ya vio un puerto web: nada de file:// ni rarezas. */
ipcMain.handle('shell:open', (_e, url) => {
  let u
  try { u = new URL(String(url)) } catch { throw new Error(`URL inválida: ${url}`) }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`Solo se abren direcciones http(s), no ${u.protocol}`)
  return shell.openExternal(u.toString())
})

ipcMain.handle('device:wake', (_e, { mac, scope }) => wake(mac, { network: scope?.network, prefix: scope?.prefix }))

ipcMain.handle('ping:start', (_e, { ip, port }) => { pinger.start(ip, port); return true })
ipcMain.handle('ping:stop', () => { pinger.stop(); return true })

ipcMain.handle('watch:state', () => watcher.state())
ipcMain.handle('watch:configure', (_e, patch) => watcher.configure(patch))
ipcMain.handle('watch:now', () => watcher.scanNow())

ipcMain.handle('scan:stop', () => { scanner?.stop(); return true })

ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text)); return true })

ipcMain.handle('win:minimize', () => win?.minimize())
ipcMain.handle('win:maximize', () => {
  if (!win) return false
  if (win.isMaximized()) win.unmaximize(); else win.maximize()
  return win.isMaximized()
})
ipcMain.handle('win:close', () => win?.close())
