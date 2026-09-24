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

/* La baldosa estándar de las apps de Fran (la de Opal, igual que Atlas y
   Pharos): a sangre, sin borde, esquinas al 19 % y relleno plano — el fondo de
   la app con el velo de las hojas (--s1) ya resuelto. Un canto iluminado o una
   placa con margen se ven en Nexus como un bordecito que las demás no tienen. */
const TILE = '#101413'   // #070b0a + blanco al 3.5 %
const TILE_R = 19

/* Cuánto del lienzo ocupa el dibujo, de punta a punta: 62 % en grande y 68 %
   en chico, la misma proporción que el resto de los íconos de la casa. El
   dibujo se diseña en su propia medida (anillo de 36, o 40 en chico) y se
   escala a esto alrededor del centro. */
const SPAN = { big: 0.62, small: 0.68 }
const EDGE = 38        // hacia dónde apunta el filo del barrido
const BLIP = [22, -16]  // el eco: radio y rumbo — adentro de la estela, recién barrido

const rad = (deg) => (deg - 90) * Math.PI / 180
const pt = (r, deg) => [50 + Math.cos(rad(deg)) * r, 50 + Math.sin(rad(deg)) * r]
const f = (n) => n.toFixed(2)

/**
 * La marca sobre su placa. En chico (menos de 64 px) el dibujo se simplifica:
 * un solo anillo gordo, la estela en pocos gajos y sin resplandores — lo que en
 * grande es sutileza, a 16 px es barro.
 */
function mark (side) {
  const small = side < 64
  const R = small ? 40 : 36
  // De punta a punta: el anillo, más lo que asoman las marcas (grande) o medio trazo (chico).
  const reach = R + 3
  const k = ((small ? SPAN.small : SPAN.big) * 50) / reach
  const scaled = `transform="translate(50 50) scale(${f(k)}) translate(-50 -50)"`
  // En chico el trazo tiene un piso en píxeles de verdad, como en Pharos:
  // escalado tal cual, a 16 px el anillo queda en medio píxel y se vuelve barro.
  // En grande el trazo es gordo a propósito: Windows y Nexus achican ESTE master
  // a 32–48 px, y un anillo fino ahí desaparece al lado de los vecinos.
  const stroke = small ? (Math.max(1.1, side * 0.045) * 100) / (side * k) : 6
  const span = small ? 60 : 84
  const peak = small ? .5 : .46
  const [ex, ey] = pt(R, EDGE)
  // En chico el eco se aleja del filo: a 16 px, pegados, se funden en una manchita.
  const [bx, by] = small ? pt(22, -18) : pt(...BLIP)

  const rings = small
    ? `<circle cx="50" cy="50" r="${R}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="${f(stroke)}"/>`
    : `<circle cx="50" cy="50" r="19" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="3"/>
       <circle cx="50" cy="50" r="${R}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="${stroke}"/>`

  // La estela es un conic-gradient de CSS y no gajos de SVG: los gajos dejan
  // costuras donde se tocan. Va entre la placa y el dibujo, recortada al anillo.
  const Rk = R * k
  const tail = `<div style="position:absolute; left:${f(50 - Rk)}%; top:${f(50 - Rk)}%; width:${f(2 * Rk)}%; height:${f(2 * Rk)}%;
    border-radius:50%; background:conic-gradient(from ${EDGE - span}deg,
      rgba(${SIG}, 0) 0deg, rgba(${SIG}, ${f(peak * .22)}) ${f(span * .5)}deg,
      rgba(${SIG}, ${f(peak)}) ${span}deg, transparent ${span}deg)"></div>`

  return `<div style="position:relative; width:100%; height:100%">
  <svg style="position:absolute; inset:0" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${TILE_R}" fill="${TILE}"/>
  </svg>
  ${tail}
  <svg style="position:absolute; inset:0" viewBox="0 0 100 100">
  <defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>
  <g ${scaled}>
  ${rings}
  <line x1="50" y1="50" x2="${f(ex)}" y2="${f(ey)}" stroke="rgb(${SIG})" stroke-width="${f(stroke * 1.15)}" stroke-linecap="round"/>
  ${small ? '' : `<line x1="50" y1="50" x2="${f(ex)}" y2="${f(ey)}" stroke="rgb(${SIG})" stroke-width="9" filter="url(#glow)" opacity=".55"/>
  <circle cx="${f(bx)}" cy="${f(by)}" r="7.5" fill="rgb(${SIG})" filter="url(#glow)" opacity=".7"/>`}
  <circle cx="${f(bx)}" cy="${f(by)}" r="${small ? 6.5 : 6}" fill="rgb(${SIG})"/>
  <circle cx="50" cy="50" r="${small ? 5.5 : 5}" fill="#eef7f3"/>
  </g>
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
<div>${mark(side)}</div>`
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
