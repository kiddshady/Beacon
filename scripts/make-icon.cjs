/**
 * Genera build/icon.png (1024×1024) y build/tray.ico desde la marca de la app.
 *
 * Es el MISMO dibujo que `beacon` en renderer/js/icons.js: un punto, cuatro
 * marcas cardinales y dos anillos, en fósforo sobre la placa oscura. Si cambiás
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

/** El de la bandeja: la misma placa y el mismo dibujo, renderizado a cada tamaño
 *  que usa Windows según el escalado (16 a 100 %, 20 a 125 %, 24 a 150 %, 32 a
 *  200 %) y empaquetado en un .ico, para que en ninguno salga borroso. */
const TRAY_SIZES = [16, 20, 24, 32]
const TRAY_OUT = path.join(__dirname, '..', 'build', 'tray.ico')

/**
 * La marca sobre su placa, a un tamaño dado. En chico el dibujo ocupa más de la
 * placa, el trazo engorda y los anillos suben de opacidad: lo que en grande es
 * sutileza, a 16 px es invisible.
 */
function plate (side) {
  const small = side < 64
  const glyph = Math.round(side * (small ? .84 : .66))
  const glow = small ? 'none' : `drop-shadow(0 0 ${Math.round(side * 0.02)}px rgba(61, 251, 125, .45))`
  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${side}px; height: ${side}px; background: transparent; overflow: hidden; }
  .plate {
    width: ${side}px; height: ${side}px;
    box-sizing: border-box;
    background: #060a07;
    border-radius: ${Math.round(side * 0.18)}px;
    display: grid; place-items: center;
  }
  svg { width: ${glyph}px; height: ${glyph}px;
        stroke: #3dfb7d; color: #3dfb7d; fill: none;
        stroke-width: ${small ? 2.1 : 1.6}; stroke-linecap: round; stroke-linejoin: round;
        filter: ${glow}; }
</style>
<div class="plate">
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="${small ? 2.6 : 2.2}" fill="currentColor" stroke="none"/>
    <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22"/>
    <circle cx="12" cy="12" r="6.5" opacity="${small ? .8 : .55}"/>
    <circle cx="12" cy="12" r="10" opacity="${small ? .5 : .28}"/>
  </svg>
</div>`
}

/**
 * Empaqueta PNGs en un .ico (Windows los acepta adentro desde Vista): cabecera,
 * una entrada de 16 bytes por imagen y los PNG uno atrás del otro.
 */
function ico (images) {
  const head = Buffer.alloc(6)
  head.writeUInt16LE(0, 0)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(images.length, 4)

  const entries = []
  let offset = 6 + 16 * images.length
  for (const { side, png } of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(side % 256, 0)   // 256 se escribe como 0
    e.writeUInt8(side % 256, 1)
    e.writeUInt16LE(1, 4)         // planos
    e.writeUInt16LE(32, 6)        // bits por pixel
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += png.length
  }
  return Buffer.concat([head, ...entries, ...images.map(i => i.png)])
}

/** Renderiza la placa a `side` px y devuelve el PNG. */
async function render (side) {
  const win = new BrowserWindow({
    width: side, height: side, show: false,
    transparent: true, frame: false, backgroundColor: '#00000000',
    useContentSize: true
  })

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(plate(side)))
  await new Promise(r => setTimeout(r, 700)) // que asiente el layout

  const img = await win.capturePage()
  const { width, height } = img.getSize()
  if (width !== side || height !== side) {
    console.log(`ABORTADO: la captura salió ${width}×${height}, se esperaba ${side}×${side}`)
    app.exit(1)
  }
  win.destroy()
  return img.toPNG()
}

app.whenReady().then(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })

  fs.writeFileSync(OUT, await render(SIDE))
  console.log(`  ${OUT}  (${SIDE}×${SIDE})`)

  const images = []
  for (const side of TRAY_SIZES) images.push({ side, png: await render(side) })
  fs.writeFileSync(TRAY_OUT, ico(images))
  console.log(`  ${TRAY_OUT}  (${TRAY_SIZES.join(', ')})`)

  setTimeout(() => app.exit(0), 150)
})

// Sin esto, destruir la ventana termina el proceso antes de tiempo.
app.on('window-all-closed', () => {})
