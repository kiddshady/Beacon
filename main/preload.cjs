const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('beacon', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),

  previewCommand: (presetId, target) => ipcRenderer.invoke('scan:preview', { presetId, target }),
  startScan: (presetId, target) => ipcRenderer.invoke('scan:start', { presetId, target }),
  stopScan: () => ipcRenderer.invoke('scan:stop'),

  /** Los hallazgos llegan de a uno, mientras el barrido corre. */
  onScanEvent: (fn) => {
    const handler = (_e, evt) => fn(evt)
    ipcRenderer.on('scan:event', handler)
    return () => ipcRenderer.off('scan:event', handler)
  },

  copy: (text) => ipcRenderer.invoke('clipboard:write', text),

  /** Cómo llamás vos a un aparato. Vacío borra el alias y vuelve el nombre detectado. */
  setAlias: (key, alias, host) => ipcRenderer.invoke('device:alias', { key, alias, host }),

  /** Actualizaciones: estado actual, búsqueda manual, y reiniciar para instalar. */
  update: {
    state: () => ipcRenderer.invoke('update:state'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.send('update:install'),
    onState: (fn) => {
      const handler = (_e, state) => fn(state)
      ipcRenderer.on('update:state', handler)
      return () => ipcRenderer.off('update:state', handler)
    }
  },

  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximize: () => ipcRenderer.invoke('win:maximize'),
    close: () => ipcRenderer.invoke('win:close')
  }
})
