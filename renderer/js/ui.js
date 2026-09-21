/** Utilidades chicas de interfaz: el tooltip propio y el fade del scroll. */

/* ── Tooltip ───────────────────────────────────────────────────────────── */

class Tooltip {
  constructor (node) {
    this.node = node
    this.timer = null
  }

  show (anchor, text) {
    clearTimeout(this.timer)
    if (!text) return

    this.node.textContent = text
    this.node.classList.add('on')

    const a = anchor.getBoundingClientRect()
    const t = this.node.getBoundingClientRect()
    let x = a.left + a.width / 2 - t.width / 2
    let y = a.top - t.height - 8

    // Si no entra arriba, va abajo; y nunca se sale por los costados.
    if (y < 6) y = a.bottom + 8
    x = Math.max(6, Math.min(x, window.innerWidth - t.width - 6))

    this.node.style.left = `${Math.round(x)}px`
    this.node.style.top = `${Math.round(y)}px`
  }

  hide () {
    this.timer = setTimeout(() => this.node.classList.remove('on'), 40)
  }
}

export function installTooltips (node) {
  const tip = new Tooltip(node)
  window.beaconTip = tip

  document.addEventListener('mouseover', e => {
    const target = e.target.closest?.('[data-tip]')
    if (target) tip.show(target, target.dataset.tip)
  })
  document.addEventListener('mouseout', e => {
    if (e.target.closest?.('[data-tip]')) tip.hide()
  })
  // Un click no debe dejar el tooltip colgado sobre lo que acaba de cambiar.
  document.addEventListener('click', () => tip.hide())

  return tip
}

/* ── Fade de scroll ────────────────────────────────────────────────────── */

/**
 * Marca en qué extremo está el scroll para que el degradé de ese lado se retire.
 * Sin esto, el primer y el último elemento se ven esfumados estando quietos.
 */
export function watchScrollFade (node) {
  const update = () => {
    const atTop = node.scrollTop <= 1
    const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1

    node.dataset.at = atTop && atBottom ? 'both' : atTop ? 'top' : atBottom ? 'bottom' : ''
  }

  node.addEventListener('scroll', update, { passive: true })
  new ResizeObserver(update).observe(node)
  new MutationObserver(update).observe(node, { childList: true, subtree: true })
  update()

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

export function formatMs (ms) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
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
