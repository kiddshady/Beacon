/**
 * El inspector: el detalle de un aparato como una hoja de vidrio que flota
 * sobre el radar, del lado contrario a su punto, unida a él por una línea.
 *
 * El radar no se mueve ni se achica para hacerle lugar: la hoja tapa la otra
 * mitad y lo que queda debajo se esmerila. El punto elegido siempre queda a la
 * vista, y la lista de la derecha sigue siendo la lista.
 */

import { afterExit } from './ui.js'

export class Inspector {
  constructor ({ el, body, closeBtn, radar, wrap, onClose }) {
    this.el = el
    this.body = body
    this.radar = radar
    this.wrap = wrap
    this.ip = null
    this.side = null
    /** Cambia con cada apertura: una salida vieja no puede cerrar una apertura nueva. */
    this.turn = 0

    closeBtn.addEventListener('click', () => onClose?.())

    // La línea se recalcula cuando cambia cualquiera de las dos puntas: la hoja
    // crece (llegan puertos) o la ventana cambia de tamaño y el radar con ella.
    const relink = () => this.#link()
    new ResizeObserver(relink).observe(el)
    new ResizeObserver(relink).observe(wrap)
  }

  get isOpen () { return this.ip != null }

  /**
   * Abre (o cambia) el inspector para un aparato. `render` llena el cuerpo.
   * Si el punto nuevo cae del otro lado, la hoja sale y vuelve a entrar allá.
   */
  open (ip, render) {
    const side = this.#sideFor(ip)
    const turn = ++this.turn
    const moving = this.isOpen && side !== this.side
    this.ip = ip

    if (moving) {
      this.el.classList.remove('on')
      this.radar.setLeader(null)
      afterExit(this.el, () => {
        if (turn !== this.turn) return
        this.#enter(side, render)
      }, { event: 'transitionend', property: 'opacity', ms: 260 })
      return
    }

    if (this.isOpen && this.el.classList.contains('on')) {
      render(this.body)
      this.body.scrollTop = 0
      this.#link()
      return
    }
    this.#enter(side, render)
  }

  /** Vuelve a dibujar el contenido sin moverla: datos nuevos del mismo aparato. */
  refresh (render) {
    if (!this.isOpen) return
    const top = this.body.scrollTop
    render(this.body)
    this.body.scrollTop = top
    this.#link()
  }

  close () {
    if (!this.isOpen) return
    const turn = ++this.turn
    this.ip = null
    this.el.classList.remove('on')
    this.radar.setLeader(null)
    afterExit(this.el, () => {
      if (turn !== this.turn) return
      this.el.hidden = true
      this.body.replaceChildren()
    }, { event: 'transitionend', property: 'opacity', ms: 260 })
  }

  #enter (side, render) {
    this.side = side
    this.el.dataset.side = side
    this.el.hidden = false
    render(this.body)
    this.body.scrollTop = 0
    // Un frame con el estado de partida, y recién ahí el de llegada: sin eso
    // la transición no tiene desde dónde salir y la hoja aparece de golpe.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      this.el.classList.add('on')
      this.#link()
    }))
    // Con la ventana oculta no hay frames: que igual quede abierta.
    if (document.hidden) { this.el.classList.add('on'); this.#link() }
  }

  /** Del lado contrario al punto: si está a la izquierda del centro, la hoja va a la derecha. */
  #sideFor (ip) {
    const p = this.radar.pointOf(ip)
    if (!p) return 'right'
    const w = this.wrap.getBoundingClientRect()
    return p.x < w.left + w.width / 2 - 1 ? 'right' : 'left'
  }

  /**
   * La línea del punto al canto de la hoja. Se mide con offset* y no con
   * getBoundingClientRect: la hoja puede estar a mitad de su entrada, con un
   * transform puesto, y la línea tiene que ir a donde va a quedar, no a donde está.
   */
  #link () {
    if (!this.isOpen || this.el.hidden) return
    const app = this.el.offsetParent?.getBoundingClientRect()
    if (!app) return
    const left = app.left + this.el.offsetLeft
    const top = app.top + this.el.offsetTop
    const edgeX = this.side === 'right' ? left : left + this.el.offsetWidth
    this.radar.setLeader(this.ip, {
      x: edgeX,
      top: top + 22,
      bottom: top + this.el.offsetHeight - 22
    })
  }
}
