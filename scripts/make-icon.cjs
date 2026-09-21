/**
 * Genera build/icon.png (1024×1024) desde la marca de la app.
 *
 * Es el MISMO dibujo que `beacon` en renderer/js/icons.js: un punto, cuatro
 * marcas cardinales y dos anillos, en fósforo sobre la base oscura. Si cambiás
 * la marca allá, corré esto de nuevo:
 *
 *   npm run icon
 *
 * Se renderiza con Electron y no con una librería de imágenes porque Electron ya
 * está instalado, y porque así el ícono sale del mismo motor que dibuja la app.
 */

const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const SIDE = 1024
const OUT = path.join(__dirname, '..', 'build', 'icon.png')

/** El de la bandeja: chico, sin placa, trazo más grueso para que a 16 px siga
 *  siendo una mira y no una mancha. */
const TRAY = 32
const TRAY_OUT = path.join(__dirname, '..', 'build', 'tray.png')

const HTML = `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${SIDE}px; height: ${SIDE}px; background: transparent; }
  .plate {
    width: ${SIDE}px; height: ${SIDE}px;
    box-sizing: border-box;
    background: #060a07;
    border-radius: ${Math.round(SIDE * 0.18)}px;
    display: grid; place-items: center;
  }
  svg { width: ${Math.round(SIDE * 0.66)}px; height: ${Math.round(SIDE * 0.66)}px;
        stroke: #3dfb7d; color: #3dfb7d; fill: none;
        stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;
        filter: drop-shadow(0 0 ${Math.round(SIDE * 0.02)}px rgba(61, 251, 125, .45)); }
</style>
<div class="plate">
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>
    <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22"/>
    <circle cx="12" cy="12" r="6.5" opacity=".55"/>
    <circle cx="12" cy="12" r="10" opacity=".28"/>
  </svg>
</div>`

const TRAY_HTML = `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${TRAY}px; height: ${TRAY}px; background: transparent; overflow: hidden; }
  svg { display: block; width: ${TRAY}px; height: ${TRAY}px;
        stroke: #3dfb7d; color: #3dfb7d; fill: none;
        stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
</style>
<svg viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>
  <path d="M12 2.5v3.5M12 18v3.5M2.5 12h3.5M18 12h3.5"/>
  <circle cx="12" cy="12" r="6.5" opacity=".8"/>
</svg>`

async function render (html, side, out) {
  const win = new BrowserWindow({
    width: side, height: side, show: false,
    transparent: true, frame: false, backgroundColor: '#00000000',
    useContentSize: true
  })

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise(r => setTimeout(r, 700)) // que asiente el layout

  const img = await win.capturePage()
  const { width, height } = img.getSize()
  if (width !== side || height !== side) {
    console.log(`ABORTADO: la captura salió ${width}×${height}, se esperaba ${side}×${side}`)
    app.exit(1)
    return
  }

  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, img.toPNG())
  console.log(`  ${out}  (${side}×${side})`)
  win.destroy()
}

app.whenReady().then(async () => {
  await render(HTML, SIDE, OUT)
  await render(TRAY_HTML, TRAY, TRAY_OUT)
  setTimeout(() => app.exit(0), 150)
})

// Sin esto, destruir la ventana termina el proceso antes de tiempo.
app.on('window-all-closed', () => {})
