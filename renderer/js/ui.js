/** Utilidades chicas de interfaz: el tooltip propio y el fade del scroll. */

/* ── Tooltip ───────────────────────────────────────────────────────────── */

/**
 * El tooltip propio. En Beacon aparece en el acto (el radar se recorre con el
 * mouse y la espera larga de Opal ahí estorba), pero con lo que Opal aprendió:
 *
 * - Cada tooltip es su propio nodo, y uno que se va SALE: pasar al botón de al
 *   lado era cambiar texto y lugar de un cuadro al otro. Ahora el viejo se
 *   esfuma y el nuevo entra cuando el viejo casi no se ve (un relevo).
 * - Si su ancla se va del DOM mientras se ve (la lista o el detalle que se
 *   repintan con un dato nuevo, un punto del radar que se redibuja), el
 *   navegador no manda mouseout y el tooltip quedaba clavado. Se mira.
 * - El scroll se lo lleva (su lugar ya no es ese); con el teclado también
 *   aparece (solo con :focus-visible) y Escape lo descarta.
 * - Un botón de solo ícono sin aria-label toma el texto del tooltip como
 *   nombre: para un lector de pantalla deja de ser «botón» a secas.
 */
class Tooltip {
  constructor () {
    this.node = null
    this.anchor = null
    this.timer = null
    this.watch = null
    /** Cuándo empezó a irse el último: el siguiente espera a que casi no se vea. */
    this.left = -Infinity
    /** El que se ve llegó con el teclado: un scroll para acercarlo no lo cancela. */
    this.byKey = false
  }

  show (anchor, text) {
    clearTimeout(this.timer)
    if (!text) { this.hideNow(); return }
    if (this.node && this.anchor === anchor && this.node.textContent === text) return
    if (this.node) this.#leave()
    this.anchor = anchor
    const wait = Math.max(0, 90 - (performance.now() - this.left))
    const go = () => { if (this.anchor === anchor && anchor.isConnected) this.#enter(anchor, text) }
    if (wait) this.timer = setTimeout(go, wait)
    else go()
  }

  /** Al salir del ancla: un respiro corto, por si el mouse ya está entrando al vecino. */
  hide () {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.hideNow(), 40)
  }

  hideNow () {
    clearTimeout(this.timer)
    this.anchor = null
    if (this.node) this.#leave()
  }

  #enter (anchor, text) {
    const el = document.createElement('div')
    el.className = 'tip'
    el.setAttribute('role', 'tooltip')
    el.textContent = text
    document.body.append(el)

    // El tamaño de layout, no el del rectángulo: la entrada lo corre.
    const a = anchor.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    let x = a.left + a.width / 2 - w / 2
    let y = a.top - h - 8
    // Si no entra arriba, va abajo; y nunca se sale por los costados.
    if (y < 6) y = a.bottom + 8
    x = Math.max(6, Math.min(x, window.innerWidth - w - 6))
    el.style.left = `${Math.round(x)}px`
    el.style.top = `${Math.round(y)}px`

    void el.offsetWidth   // el estado de partida, para que la entrada tenga desde dónde salir
    el.classList.add('on')
    this.node = el
    clearInterval(this.watch)
    this.watch = setInterval(() => { if (!this.anchor?.isConnected) this.hideNow() }, 250)
  }

  #leave () {
    const el = this.node
    this.node = null
    this.left = performance.now()
    clearInterval(this.watch)
    el.classList.remove('on')
    el.classList.add('closing')
    afterExit(el, () => el.remove(), { event: 'transitionend', property: 'opacity', ms: 260 })
  }
}

/** El texto del tooltip como nombre de los botones que no tienen otro. */
function nameIconButtons (root) {
  const els = root.querySelectorAll ? [...root.querySelectorAll('[data-tip]')] : []
  if (root.matches?.('[data-tip]')) els.push(root)
  for (const el of els) {
    if (el.textContent.trim()) continue
    if (el.hasAttribute('aria-label') && !el.__tipNamed) continue
    el.setAttribute('aria-label', el.dataset.tip)
    el.__tipNamed = true
  }
}

export function installTooltips () {
  const tip = new Tooltip()
  window.beaconTip = tip

  document.addEventListener('mouseover', e => {
    const target = e.target.closest?.('[data-tip]')
    if (!target) return
    tip.byKey = false
    tip.show(target, target.dataset.tip)
  })
  document.addEventListener('mouseout', e => {
    const target = e.target.closest?.('[data-tip]')
    // Moverse adentro del mismo ancla (del ícono a su texto) no es salir.
    if (target && !target.contains(e.relatedTarget)) tip.hide()
  })

  // Con el teclado: el que llega con Tab a un botón de ícono tiene que poder saber qué hace.
  document.addEventListener('focusin', e => {
    const target = e.target.closest?.('[data-tip]')
    if (!target || !target.matches(':focus-visible')) return
    tip.byKey = true
    tip.show(target, target.dataset.tip)
  })
  document.addEventListener('focusout', e => {
    if (e.target.closest?.('[data-tip]') === tip.anchor) tip.hide()
  })
  // Escape lo descarta sin mover el foco, y sigue de largo: no es suyo.
  document.addEventListener('keydown', e => { if (e.key === 'Escape') tip.hideNow() }, true)

  // Un tooltip flotando sobre un click o un scroll es basura visual.
  document.addEventListener('pointerdown', () => tip.hideNow())
  window.addEventListener('scroll', () => { if (!tip.byKey) tip.hideNow() }, true)
  window.addEventListener('blur', () => tip.hideNow())

  nameIconButtons(document.body)
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'attributes') nameIconButtons(m.target)
      else m.addedNodes.forEach(n => { if (n.nodeType === 1) nameIconButtons(n) })
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tip'] })

  return tip
}

/* ── Fade de scroll ────────────────────────────────────────────────────── */

/**
 * Marca en qué extremo está el scroll para que el degradé de ese lado se retire.
 * Sin esto, el primer y el último elemento se ven esfumados estando quietos.
 * En horizontal (`axis: 'x'`) marca start/end, y la rueda del mouse recorre la
 * fila: nadie va a buscar una barra de scroll en un toolbar.
 */
export function watchScrollFade (node, { axis = 'y' } = {}) {
  const horizontal = axis === 'x'
  const [first, last] = horizontal ? ['start', 'end'] : ['top', 'bottom']

  const update = () => {
    const pos = horizontal ? node.scrollLeft : node.scrollTop
    const size = horizontal ? node.clientWidth : node.clientHeight
    const total = horizontal ? node.scrollWidth : node.scrollHeight
    const atFirst = pos <= 1
    const atLast = pos + size >= total - 1

    node.dataset.at = atFirst && atLast ? 'both' : atFirst ? first : atLast ? last : ''
  }

  node.addEventListener('scroll', update, { passive: true })
  new ResizeObserver(update).observe(node)
  new MutationObserver(update).observe(node, { childList: true, subtree: true })
  update()

  if (horizontal) {
    node.addEventListener('wheel', e => {
      if (e.deltaX || !e.deltaY || node.scrollWidth <= node.clientWidth) return
      e.preventDefault()
      node.scrollBy({ left: e.deltaY, behavior: 'smooth' })
    }, { passive: false })
  }

  return update
}

/* ── Salidas animadas ──────────────────────────────────────────────────── */

/**
 * Corre `fn` cuando termina la animación (o transición) de salida de `node`,
 * o a lo sumo después de `ms`. El plazo no es adorno: con la ventana oculta o
 * minimizada Chromium no avanza las animaciones y `animationend` no llega
 * nunca — sin esto, un panel cerrado en ese momento quedaría pegado para siempre.
 */
export function afterExit (node, fn, { ms = 600, event = 'animationend', property } = {}) {
  let done = false
  const go = (e) => {
    if (done) return
    if (e && e.target !== node) return
    if (e && property && e.propertyName !== property) return
    done = true
    fn()
  }
  node.addEventListener(event, go)
  setTimeout(go, ms)
}

/* ── Un diálogo a la vez ───────────────────────────────────────────────── */

/**
 * Hay un solo diálogo a la vista. El que se abre con otro abierto (Ctrl+, con
 * el historial a la vista) lo releva: el de abajo se va y el nuevo entra
 * cuando ya va por la mitad de su salida. Antes quedaban los dos encimados,
 * cada uno con su velo. Viene de Opal, donde el modal nuevo pisaba al de abajo.
 */
let shownDialog = null

/** El que se abre avisa con su cierre. Devuelve true si relevó a otro. */
export function claimDialog (close) {
  const prev = shownDialog
  shownDialog = close
  if (prev && prev !== close) { prev(); return true }
  return false
}

/** Al cerrarse: si era el que se veía, ya no hay ninguno (y el foco vuelve a su botón). */
export function releaseDialog (close) {
  if (shownDialog !== close) return false
  shownDialog = null
  return true
}

/* ── Varios ────────────────────────────────────────────────────────────── */

/** El nombre que ve la persona: el que le puso ella, si no el detectado, si no la IP. */
export function hostName (host) {
  return host.alias || host.display || host.ip
}

export function timeAgo (ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 45) return 'recién'
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

export function formatDate (ts) {
  return new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/**
 * Con un decimal debajo de 10 s y sin decimales desde ahí, decidido con el
 * valor YA redondeado (9,96 s es «10 s», no «10,0 s»), y con coma decimal.
 * Lo mismo que el formato de Opal.
 */
export function formatMs (ms) {
  if (ms == null) return '—'
  ms = Math.round(ms)
  if (ms < 1000) return `${ms} ms`
  const one = Math.round(ms / 100) / 10
  return one < 10
    ? `${one.toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
    : `${Math.round(ms / 1000)} s`
}

/** Anima un número hacia su nuevo valor en vez de saltar de golpe. */
export function tweenNumber (node, to, duration = 400) {
  const from = parseInt(node.textContent, 10) || 0
  if (from === to) return

  // Sin frames que animar (ventana oculta), el número igual tiene que quedar correcto.
  if (document.hidden) {
    node.textContent = to
    return
  }

  const started = performance.now()
  const step = (now) => {
    const t = Math.min(1, (now - started) / duration)
    const eased = 1 - Math.pow(1 - t, 3)
    node.textContent = Math.round(from + (to - from) * eased)
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)

  const stat = node.closest('.stat')
  if (stat) {
    stat.classList.add('bump')
    setTimeout(() => stat.classList.remove('bump'), 500)
  }
}
