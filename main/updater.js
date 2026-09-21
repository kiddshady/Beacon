/**
 * Actualizaciones automáticas.
 *
 * electron-updater consulta los releases de GitHub declarados en `build.publish`
 * del package.json, baja la versión nueva en segundo plano y la instala cuando
 * la persona decide reiniciar (o sola, al cerrar la app). No hay diálogos del
 * sistema: acá solo hay estado, y el renderer lo presenta con la estética de Beacon.
 *
 * En desarrollo no se busca nada: no existe `app-update.yml` y no tendría sentido.
 *
 * Fases: idle · checking · up-to-date · available · downloading · ready · error
 */

import { app, ipcMain } from 'electron'

const CHANNEL = 'update:state'
/** Buscar en el primer frame compite con el arranque de la ventana y el bootstrap
 *  de red. Se deja respirar la app y recién después se consulta GitHub. */
const INITIAL_DELAY = 6000

let autoUpdater = null
let getWin = () => null
let state = {
  phase: 'idle',
  version: app.getVersion(),
  manual: false,
  reason: app.isPackaged ? 'not-started' : 'dev'
}

function emit (patch) {
  state = { ...state, ...patch, version: app.getVersion() }
  const win = getWin()
  if (win && !win.isDestroyed()) win.webContents.send(CHANNEL, state)
  return state
}

/** Se registra también en desarrollo para que el puente siempre exista. */
export function registerIPC () {
  ipcMain.handle('update:state', () => state)
  ipcMain.handle('update:check', () => check(true))
  ipcMain.on('update:install', () => {
    if (!autoUpdater || state.phase !== 'ready') return
    // Silencioso y con reapertura: NSIS reemplaza la app y la vuelve a mostrar ya nueva.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  })
}

/** Arranca el chequeo real solo dentro de la app empaquetada. */
export async function start (winGetter, { auto = true } = {}) {
  getWin = winGetter
  if (!app.isPackaged) {
    emit({ phase: 'idle', reason: 'dev' })
    return
  }

  try {
    // Import perezoso: en dev no hace falta cargar el módulo para nada.
    const mod = await import('electron-updater')
    autoUpdater = (mod.default || mod).autoUpdater
  } catch (err) {
    emit({ phase: 'error', error: `No cargó electron-updater: ${err.message}` })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => emit({ phase: 'checking' }))
  autoUpdater.on('update-available', (info) => emit({
    phase: 'available',
    next: info.version,
    notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
  }))
  autoUpdater.on('update-not-available', () => emit({ phase: 'up-to-date', checkedAt: Date.now() }))
  autoUpdater.on('download-progress', (p) => emit({
    phase: 'downloading', progress: p.percent, speed: p.bytesPerSecond, total: p.total
  }))
  autoUpdater.on('update-downloaded', (info) => emit({ phase: 'ready', next: info.version, progress: 100 }))
  autoUpdater.on('error', (err) => emit({ phase: 'error', error: err?.message || String(err) }))

  if (auto) setTimeout(() => check(false), INITIAL_DELAY)
}

export async function check (manual = false) {
  if (!autoUpdater) {
    return emit({ phase: 'idle', reason: app.isPackaged ? 'no-updater' : 'dev', manual })
  }
  if (state.phase === 'downloading' || state.phase === 'ready') return emit({ manual })

  emit({ phase: 'checking', manual })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    emit({ phase: 'error', error: err?.message || String(err) })
  }
  return state
}
