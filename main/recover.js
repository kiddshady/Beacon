/**
 * Si se cae la interfaz, vuelve sola.
 *
 * El renderer de la ventana es un proceso aparte, y se puede caer: falta de
 * memoria, un fallo de la GPU, un bug de Chromium. Sin nadie escuchando, la
 * ventana quedaba en blanco y muerta, y la única salida era cerrar Beacon y
 * volver a abrirlo (con la vigilancia en la bandeja, ni eso se notaba). Como lo
 * que importa vive en el proceso principal y en el disco (la memoria de la red,
 * la vigilancia, el escaneo en curso), recargar alcanza.
 *
 * Con tope: si se cae más de `max` veces en `per` ms, algo la está tirando
 * apenas arranca, y recargar sin fin sería un bucle que no deja ni cerrarla.
 * Viene de Opal (src/recover.cjs).
 */
export function keepAlive (win, { max = 3, per = 60_000, delay = 300, onGone } = {}) {
  const wc = win.webContents
  let falls = []
  const gone = (_e, details) => {
    // Cerrar la ventana también termina el proceso: eso no es una caída.
    if (details.reason === 'clean-exit') return
    onGone?.(details)
    const now = Date.now()
    falls = falls.filter(t => now - t < per)
    falls.push(now)
    if (falls.length > max) {
      console.error(`[recover] la interfaz se cayó ${falls.length} veces en ${per / 1000} s: no se recarga más`)
      return
    }
    console.error(`[recover] la interfaz se cayó (${details.reason}): se recarga`)
    setTimeout(() => { if (!win.isDestroyed()) wc.reload() }, delay)
  }
  wc.on('render-process-gone', gone)
  return () => wc.off('render-process-gone', gone)
}
