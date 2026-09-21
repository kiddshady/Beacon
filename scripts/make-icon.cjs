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

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIDE, height: SIDE, show: false,
    transparent: true, frame: false, backgroundColor: '#00000000',
    useContentSize: true
  })

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML))
  await new Promise(r => setTimeout(r, 700)) // que asiente el layout

  const img = await win.capturePage()
  const { width, height } = img.getSize()
  if (width !== SIDE || height !== SIDE) {
    console.log(`ABORTADO: la captura salió ${width}×${height}, se esperaba ${SIDE}×${SIDE}`)
    app.exit(1)
    return
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, img.toPNG())
  console.log(`  ${OUT}  (${SIDE}×${SIDE})`)

  win.destroy()
  setTimeout(() => app.exit(0), 150)
})

// Sin esto, destruir la ventana termina el proceso antes de tiempo.
app.on('window-all-closed', () => {})
