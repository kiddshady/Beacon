import { app, BrowserWindow, ipcMain, shell, clipboard } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { listScopes } from './net/interfaces.js'
import { Scanner } from './net/scanner.js'
import { nmapInfo, buildCommand } from './net/nmap.js'
import { PRESETS } from './net/presets.js'
import * as updater from './updater.js'
import * as memory from './memory.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5273'
const isDev = !app.isPackaged

/** La base oscura. Electron 40 la usa para teñir el frame que pinta el compositor de
 *  Windows al restaurar; sin esto vuelve el destello blanco. */
const BASE = '#060a07'

let win = null
/** @type {Scanner|null} */
let scanner = null

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

  win.on('closed', () => { win = null })

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

app.whenReady().then(() => {
  updater.registerIPC()
  createWindow()
  // En dev no busca nada; empaquetada, consulta GitHub unos segundos después de abrir.
  updater.start(() => win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  scanner?.stop()
  if (process.platform !== 'darwin') app.quit()
})

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

ipcMain.handle('scan:start', async (_e, { presetId, target }) => {
  scanner?.stop()
  const preset = PRESETS.find(p => p.id === presetId)
  if (!preset) throw new Error(`preset desconocido: ${presetId}`)

  const send = (evt) => { if (!win?.isDestroyed()) win.webContents.send('scan:event', evt) }

  // La memoria compara contra la foto anterior de esta red. Un escaneo de "esta
  // máquina" sola no es una foto de la red: no se compara ni se guarda.
  const session = preset.scope === 'self' ? null : await memory.openSession(target.scope.cidr)

  scanner = new Scanner({
    preset,
    target,
    onEvent: async (evt) => {
      if (!session) return send(evt)

      if (evt.type === 'host' || evt.type === 'host:update') {
        evt.host = session.annotate(evt.host)
      }
      if (evt.type === 'done') {
        evt.hosts = evt.hosts.map(h => session.annotate(h))
        try {
          const diff = await session.commit(evt.hosts, { preset: preset.id, complete: !evt.stopped })
          send({ type: 'diff', ...diff })
        } catch (err) {
          send({ type: 'notice', message: `No se pudo guardar la memoria de la red: ${err.message}` })
        }
      }
      send(evt)
    }
  })
  return scanner.run()
})

ipcMain.handle('device:alias', (_e, { key, alias, host }) => memory.setAlias(key, alias, host))

ipcMain.handle('scan:stop', () => { scanner?.stop(); return true })

ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text)); return true })

ipcMain.handle('win:minimize', () => win?.minimize())
ipcMain.handle('win:maximize', () => {
  if (!win) return false
  if (win.isMaximized()) win.unmaximize(); else win.maximize()
  return win.isMaximized()
})
ipcMain.handle('win:close', () => win?.close())
