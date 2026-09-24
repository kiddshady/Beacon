/**
 * Genera build/icon.png (1024×1024) y build/tray.ico desde la marca de la app.
 *
 * Es el mismo dibujo que `beacon` en renderer/js/icons.js (la marca de la
 * titlebar): el radar con su barrido. Si cambiás la marca allá, cambiala acá
 * también y corré esto de nuevo:
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

/* ── El dibujo ─────────────────────────────────────────────────────────────
   Un radar en su placa de obsidiana: anillos en luz, el barrido verde con su
   filo y su estela, y un eco que el filo acaba de tocar. Es la misma ley que la
   app: el cromo sin color, el verde solo para lo que contesta. Todo en un
   viewBox de 100 con el centro en 50,50; los ángulos son de rumbo (0 = arriba,
   sentido horario). */

const SIG = '70,228,146'
const EDGE = 38        // hacia dónde apunta el filo del barrido
const BLIP = [23, 14]  // el eco: radio y rumbo — adentro de la estela, recién barrido

const rad = (deg) => (deg - 90) * Math.PI / 180
const pt = (r, deg) => [50 + Math.cos(rad(deg)) * r, 50 + Math.sin(rad(deg)) * r]
const f = (n) => n.toFixed(2)

/**
 * La marca sobre su placa. En chico (menos de 64 px) el dibujo se simplifica:
 * un solo anillo gordo, la estela en pocos gajos y sin resplandores — lo que en
 * grande es sutileza, a 16 px es barro.
 */
function mark (small) {
  const R = small ? 40 : 36
  const span = small ? 60 : 84
  const peak = small ? .5 : .46
  const [ex, ey] = pt(R, EDGE)
  // En chico el eco se aleja del filo: a 16 px, pegados, se funden en una manchita.
  const [bx, by] = small ? pt(22, -18) : pt(...BLIP)

  const rings = small
    ? `<circle cx="50" cy="50" r="${R}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="5"/>`
    : `<circle cx="50" cy="50" r="12" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width=".8"/>
       <circle cx="50" cy="50" r="24" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width=".8"/>
       <circle cx="50" cy="50" r="${R}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.1"/>
       <path d="M50 ${50 - R - 3}v5M50 ${50 + R - 2}v5M${50 - R - 3} 50h5M${50 + R - 2} 50h5"
             stroke="#fff" stroke-opacity=".3" stroke-width="1.1" stroke-linecap="round"/>`

  // La estela es un conic-gradient de CSS y no gajos de SVG: los gajos dejan
  // costuras donde se tocan. Va entre la placa y el dibujo, recortada al anillo.
  const tail = `<div style="position:absolute; left:${50 - R}%; top:${50 - R}%; width:${2 * R}%; height:${2 * R}%;
    border-radius:50%; background:conic-gradient(from ${EDGE - span}deg,
      rgba(${SIG}, 0) 0deg, rgba(${SIG}, ${f(peak * .22)}) ${f(span * .5)}deg,
      rgba(${SIG}, ${f(peak)}) ${span}deg, transparent ${span}deg)"></div>`

  return `<div style="position:relative; width:100%; height:100%">
  <svg style="position:absolute; inset:0" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="bg" cx="50%" cy="-10%" r="120%">
      <stop offset="0" stop-color="#1b2422"/><stop offset=".55" stop-color="#0b100f"/><stop offset="1" stop-color="#060908"/>
    </radialGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".35" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".03"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="98" height="98" rx="22" fill="url(#bg)"/>
  <rect x="1.5" y="1.5" width="97" height="97" rx="21.5" fill="none" stroke="url(#edge)" stroke-width="${small ? 2 : 1}"/>
  </svg>
  ${tail}
  <svg style="position:absolute; inset:0" viewBox="0 0 100 100">
  <defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>
  ${rings}
  <line x1="50" y1="50" x2="${f(ex)}" y2="${f(ey)}" stroke="rgb(${SIG})" stroke-width="${small ? 5 : 1.6}" stroke-linecap="round"/>
  ${small ? '' : `<line x1="50" y1="50" x2="${f(ex)}" y2="${f(ey)}" stroke="rgb(${SIG})" stroke-width="3" filter="url(#glow)" opacity=".8"/>
  <circle cx="${f(bx)}" cy="${f(by)}" r="7" fill="none" stroke="rgb(${SIG})" stroke-opacity=".35" stroke-width="1"/>
  <circle cx="${f(bx)}" cy="${f(by)}" r="4.5" fill="rgb(${SIG})" filter="url(#glow)" opacity=".9"/>`}
  <circle cx="${f(bx)}" cy="${f(by)}" r="${small ? 6.5 : 3.6}" fill="rgb(${SIG})"/>
  <circle cx="50" cy="50" r="${small ? 5.5 : 2.6}" fill="#eef7f3"/>
  </svg>
</div>`
}

function plate (side) {
  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${side}px; height: ${side}px; background: transparent; overflow: hidden; }
  body > div { width: ${side}px; height: ${side}px; }
  svg { display: block; width: 100%; height: 100%; }
</style>
<div>${mark(side < 64)}</div>`
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
