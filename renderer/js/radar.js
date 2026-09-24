/**
 * El radar.
 *
 * Dos decisiones que hacen que se sienta un radar y no un gráfico de dispersión:
 *
 * 1. La posición de cada host es DETERMINISTA — el ángulo sale de su IP y el radio
 *    de su latencia. Entre escaneo y escaneo los puntos no bailan: el mismo aparato
 *    vuelve siempre al mismo lugar, y eso te deja memorizar tu propia red de vista.
 *
 * 2. Un host descubierto no aparece cuando lo encontramos, sino cuando el barrido
 *    le pasa por encima. Es una pequeña mentira piadosa de milisegundos que convierte
 *    una lista que se llena en algo que se siente como detectar.
 */

import { hostName } from './ui.js'

const CX = 500
const CY = 500
const R_MIN = 100
const R_MAX = 432
const SWEEP_MS = 3400

/** Cuánto tiene que acercarse otra etiqueta para que consideremos que se pisan. */
const LABEL_GAP_X = 130
const LABEL_GAP_Y = 22

const RINGS = [
  { r: 140, label: '1 ms' },
  { r: 237, label: '10 ms' },
  { r: 334, label: '50 ms' },
  { r: 432, label: '100 ms+' }
]

/**
 * Más allá del último anillo el radar sigue, por debajo del vidrio del HUD: no
 * miden nada, son lo que las hojas esmerilan. Se apagan hacia afuera con un
 * degradé para que el instrumento no termine en un borde.
 */
const FAR_RINGS = [560, 700, 860, 1040, 1240, 1460]
const FAR_R = 1500

/** La escala de rumbo: una marca cada 5°, larga y rotulada cada 30°. */
const BEARING_R = 468

const NS = 'http://www.w3.org/2000/svg'
const el = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

/** Ángulo áureo sobre el último octeto: reparte parejo y siempre igual para la misma IP. */
function angleFor (ip) {
  const last = parseInt(ip.split('.')[3], 10) || 0
  return ((last * 137.508) % 360) * (Math.PI / 180) - Math.PI / 2
}

/**
 * El centro es ESTA máquina: en un radar, el centro es siempre el observador.
 * Todo lo demás se aleja según su latencia, en escala logarítmica para que los
 * pocos milisegundos que separan a los aparatos de la LAN sean distinguibles.
 */
/** En el radar el espacio es escaso: el nombre largo completo vive en el panel. */
function shortLabel (host) {
  const name = hostName(host)
  return name.length > 20 ? `${name.slice(0, 19)}…` : name
}

function radiusFor (host) {
  if (host.isSelf) return 0
  const lat = host.latency ?? 60
  const t = Math.min(1, Math.max(0, Math.log10(lat + 1) / Math.log10(220)))
  return R_MIN + (R_MAX - R_MIN) * t
}

export class Radar {
  constructor ({ svg, sweep, empty, onSelect, onHover }) {
    this.gridG = svg.querySelector('#radar-grid')
    this.hostsG = svg.querySelector('#radar-hosts')
    this.sweepEl = sweep
    this.emptyEl = empty
    this.onSelect = onSelect
    this.onHover = onHover

    this.nodes = new Map()
    this.pending = []
    this.sweeping = false
    this.sweepStart = 0
    this.selected = null

    this.#drawGrid()
  }

  #drawGrid () {
    const fade = el('radialGradient', { id: 'radar-far', gradientUnits: 'userSpaceOnUse', cx: CX, cy: CY, r: FAR_R })
    fade.append(
      el('stop', { class: 'far-stop', offset: R_MAX / FAR_R }),
      el('stop', { class: 'far-stop end', offset: 1 })
    )
    this.gridG.appendChild(el('defs')).appendChild(fade)

    for (const r of FAR_RINGS) {
      this.gridG.appendChild(el('circle', { class: 'ring far', cx: CX, cy: CY, r }))
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      this.gridG.appendChild(el('line', {
        class: 'spoke far',
        x1: CX + Math.cos(a) * R_MAX,
        y1: CY + Math.sin(a) * R_MAX,
        x2: CX + Math.cos(a) * FAR_R,
        y2: CY + Math.sin(a) * FAR_R
      }))
    }

    for (let deg = 0; deg < 360; deg += 5) {
      const major = deg % 30 === 0
      const a = deg * (Math.PI / 180) - Math.PI / 2
      const inner = BEARING_R - (major ? 14 : 6)
      this.gridG.appendChild(el('line', {
        class: major ? 'tick major' : 'tick',
        x1: CX + Math.cos(a) * inner,
        y1: CY + Math.sin(a) * inner,
        x2: CX + Math.cos(a) * BEARING_R,
        y2: CY + Math.sin(a) * BEARING_R
      }))
      if (major) {
        const t = el('text', {
          class: 'bearing',
          x: CX + Math.cos(a) * (BEARING_R + 16),
          y: CY + Math.sin(a) * (BEARING_R + 16)
        })
        t.textContent = String(deg).padStart(3, '0')
        this.gridG.appendChild(t)
      }
    }

    for (const { r, label } of RINGS) {
      this.gridG.appendChild(el('circle', { class: 'ring', cx: CX, cy: CY, r }))
      const t = el('text', { class: 'ring-label', x: CX + 6, y: CY - r + 17 })
      t.textContent = label
      this.gridG.appendChild(t)
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      this.gridG.appendChild(el('line', {
        class: 'spoke',
        x1: CX + Math.cos(a) * R_MIN * 0.35,
        y1: CY + Math.sin(a) * R_MIN * 0.35,
        x2: CX + Math.cos(a) * R_MAX,
        y2: CY + Math.sin(a) * R_MAX
      }))
    }
  }

  /* ── Barrido ───────────────────────────────────────────────────────── */

  startSweep () {
    this.sweeping = true
    this.sweepStart = performance.now()
    this.sweepEl.classList.add('on')
    this.emptyEl.classList.add('gone')

    // Con la ventana minimizada Chromium congela requestAnimationFrame, y los hosts
    // encontrados quedarían esperando un frame que no llega. El intervalo sigue
    // latiendo igual (más lento, pero late), así que la cola siempre se vacía.
    clearInterval(this.timer)
    this.timer = setInterval(this.#tick, 40)
    this.#tick()
  }

  stopSweep () {
    this.sweeping = false
    clearInterval(this.timer)
    this.timer = null
    this.sweepEl.classList.remove('on')
    // Lo que quedó en la cola se muestra igual: nadie se pierde por cortar el barrido.
    for (const host of this.pending.splice(0)) this.#reveal(host)
  }

  #sweepAngle () {
    const t = ((performance.now() - this.sweepStart) % SWEEP_MS) / SWEEP_MS
    return t * Math.PI * 2 - Math.PI / 2
  }

  #tick = () => {
    if (!this.sweeping || !this.pending.length) return

    const norm = (x) => ((x + Math.PI / 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
    const sweepPos = norm(this.#sweepAngle())
    const now = performance.now()

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const host = this.pending[i]
      const hostPos = norm(angleFor(host.ip))
      const delta = (sweepPos - hostPos + Math.PI * 2) % (Math.PI * 2)

      // Lo revelamos cuando el barrido le pasa por encima. El plazo máximo es la red
      // de contención: si el navegador ralentiza los timers (ventana oculta), nadie
      // se queda esperando para siempre.
      const crossed = delta < 0.5
      const waitedTooLong = now - host.queuedAt > SWEEP_MS * 1.5

      if (crossed || waitedTooLong) {
        this.pending.splice(i, 1)
        this.#reveal(host)
      }
    }
  }

  /* ── Hosts ─────────────────────────────────────────────────────────── */

  add (host) {
    if (this.nodes.has(host.ip)) return this.update(host)
    this.emptyEl.classList.add('gone')

    if (this.sweeping) this.pending.push({ ...host, queuedAt: performance.now() })
    else this.#reveal(host)
  }

  update (host) {
    const node = this.nodes.get(host.ip)
    if (!node) {
      const queued = this.pending.find(p => p.ip === host.ip)
      if (queued) Object.assign(queued, host)
      else this.add(host)
      return
    }

    node.host = host
    this.#position(node)
    this.#style(node)
  }

  #reveal (host) {
    const g = el('g', { class: 'host-node appearing' })
    // Dos ondas al aparecer, una detrás de la otra: se lee como "detectado".
    const halo = el('circle', { class: 'halo', r: 13 })
    const halo2 = el('circle', { class: 'halo second', r: 13 })
    // El anillo punteado marca a los que no estaban la última vez.
    const ring = el('circle', { class: 'mark', r: host.isGateway ? 20 : 16 })
    // Y el anillo fino crece con los puertos abiertos: más grande, más expuesto.
    const ports = el('circle', { class: 'ports', r: 0 })
    const dot = el('circle', { class: 'dot', r: host.isGateway ? 13 : 9 })
    const tag = el('text', { class: 'tag' })

    g.append(halo, halo2, ring, ports, dot, tag)
    this.hostsG.appendChild(g)

    const node = { g, halo, halo2, ring, ports, dot, tag, host }
    this.nodes.set(host.ip, node)

    this.#position(node)
    this.#style(node)

    g.addEventListener('click', () => this.onSelect?.(node.host))
    g.addEventListener('mouseenter', (e) => {
      const h = node.host
      const ports = h.ports?.length ? ` · ${h.ports.length} puerto${h.ports.length > 1 ? 's' : ''}` : ''
      window.beaconTip?.show(e.currentTarget, `${hostName(h)} — ${h.ip}${ports}`)
      this.onHover?.(h)
    })
    g.addEventListener('mouseleave', () => {
      window.beaconTip?.hide()
      this.onHover?.(null)
    })

    // Un tick de reloj, no de frame: así también funciona con la ventana en segundo plano.
    setTimeout(() => {
      g.classList.add('shown')
      setTimeout(() => g.classList.remove('appearing'), 1200)
    }, 16)
  }

  #position (node) {
    const { host, halo, halo2, ring, ports, dot, tag } = node
    const a = angleFor(host.ip)
    const r = radiusFor(host)
    const x = CX + Math.cos(a) * r
    const y = CY + Math.sin(a) * r

    node.x = x
    node.y = y

    for (const c of [halo, halo2, ring, ports, dot]) { c.setAttribute('cx', x); c.setAttribute('cy', y) }
    tag.setAttribute('x', x)
    // La etiqueta del centro va arriba; si fuera abajo chocaría con el primer anillo.
    tag.setAttribute('y', host.isSelf ? y - 24 : y + 28)
    tag.textContent = shortLabel(host)

    this.#layoutTags()
  }

  /**
   * Dos IPs pueden caer en ángulos vecinos y sus etiquetas quedarían una encima de
   * la otra, ilegibles las dos. Cuando eso pasa, se bajan en escalones: se pierde
   * un poco de prolijidad y se gana poder leerlas.
   */
  #layoutTags () {
    const placed = []

    for (const node of [...this.nodes.values()].sort((a, b) => a.y - b.y)) {
      const baseY = node.host.isSelf ? node.y - 24 : node.y + 28
      let y = baseY
      let guard = 0

      while (guard++ < 8 && placed.some(p =>
        Math.abs(p.x - node.x) < LABEL_GAP_X && Math.abs(p.y - y) < LABEL_GAP_Y)) {
        y += LABEL_GAP_Y
      }

      node.tag.setAttribute('y', y)
      placed.push({ x: node.x, y })
    }
  }

  #style (node) {
    const { g, host, ports } = node
    // Radio del anillo de puertos: nada con cero, y crece hasta doce puertos.
    const n = (host.ports || []).length
    ports.setAttribute('r', n ? (host.isGateway ? 17 : 13) + Math.min(n, 12) * 1.4 : 0)
    g.classList.toggle('has-ports', n > 0)
    g.classList.toggle('is-self', !!host.isSelf)
    g.classList.toggle('risk-warn', (host.ports || []).some(p => p.risk === 'warn'))
    g.classList.toggle('is-new', !!host.memory?.isNew)
    g.classList.toggle('selected', this.selected === host.ip)
  }

  /** Resalta el punto de un host cuando el mouse pasa por su tarjeta, y al revés. */
  highlight (ip) {
    for (const [hostIp, node] of this.nodes) {
      node.g.classList.toggle('hot', hostIp === ip)
    }
  }

  select (ip) {
    this.selected = ip
    for (const [hostIp, node] of this.nodes) {
      node.g.classList.toggle('selected', hostIp === ip)
    }
  }

  clear () {
    this.hostsG.replaceChildren()
    this.nodes.clear()
    this.pending.length = 0
    this.selected = null
    this.emptyEl.classList.remove('gone')
  }
}
