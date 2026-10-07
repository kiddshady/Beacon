/**
 * Movimiento: lo que ya está a la vista no se rehace, se pone al día.
 *
 * Rehacer algo visible con innerHTML o replaceChildren lo corta de un cuadro
 * al otro: lo que estaba se va de golpe y lo nuevo vuelve a entrar entero,
 * aunque sea casi lo mismo. En Beacon eso era la lista de aparatos con cada
 * hallazgo de un escaneo (todas las tarjetas volvían a entrar escalonadas), y
 * con cada letra del filtro. Estos helpers vienen de Opal (que los trajo de
 * Prism 1.8.0), adaptados a los tokens de beacon.css:
 *
 *   reconcile(box, items)   una lista, fila por fila y por clave (FLIP)
 *   swap(el, html)          un valor que cambia en su lugar (texto, ícono, rótulo)
 *   swapText(el, text)      swap() de un texto
 *   roll(el, to, paint)     un número que corre desde lo que se ve AHORA
 *   glideSize(el, from)     de un tamaño al otro, en vez de saltar
 *   exit(el)                la salida animada antes de sacarlo del DOM
 */

/* Las duraciones y las curvas salen de beacon.css, leídas la primera vez que
   hacen falta: si cambiás --t-slow o --ease, lo de acá cambia con todo lo demás. */
let tokens = null
function T () {
  if (tokens) return tokens
  const cs = getComputedStyle(document.documentElement)
  const ms = (name, fallback) => {
    const v = cs.getPropertyValue(name).trim()
    const n = parseFloat(v)
    return Number.isFinite(n) ? (/ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n) : fallback
  }
  const curve = (name, fallback) => cs.getPropertyValue(name).trim() || fallback
  const slow = ms('--t-slow', 320)
  tokens = {
    in: slow, move: slow, size: slow,
    out: ms('--t-out', 150),   // las salidas son más cortas que las entradas
    after: 80,                 // lo nuevo espera a que lo viejo casi no se vea
    step: 14,                  // escalonado de las filas que entran juntas
    ease: curve('--ease', 'cubic-bezier(.16, 1, .3, 1)'),
    both: curve('--ease-both', 'cubic-bezier(.65, 0, .35, 1)')
  }
  return tokens
}

/** Una animación hecha desde JS que, si la ventana no pinta, igual termina. */
function settled (anim, ms, fn) {
  let done = false
  const go = () => { if (!done) { done = true; fn() } }
  anim.finished.then(go, () => {})
  setTimeout(go, ms)
}

/**
 * Marca la salida (data-state="closing", el CSS engancha ahí su animación) y
 * saca el nodo cuando termina, o a lo sumo en `fallback` ms: con la ventana
 * oculta o minimizada Chromium no avanza las animaciones. Sobre algo que ya se
 * está yendo devuelve esa misma salida: nunca lo borra de golpe.
 */
export function exit (el, { fallback = 400 } = {}) {
  if (!el) return Promise.resolve()
  if (el.dataset.state === 'closing') return el.__leaving || Promise.resolve()
  el.dataset.state = 'closing'
  el.__leaving = new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      el.remove()
      resolve()
    }
    el.addEventListener('animationend', (e) => { if (e.target === el) finish() })
    setTimeout(finish, fallback)
  })
  return el.__leaving
}

/* ── Números que corren ─────────────────────────────────────────────────────
   Arranca de lo que se ve AHORA: cada dato nuevo retoma la carrera desde donde
   iba en vez de volver a cero o saltar (un porcentaje que llega de a pedazos).
   `paint` recibe el valor de cada cuadro y escribe. La primera vez escribe sin
   correr, salvo que `from` diga qué número muestra ya el texto. */
export function roll (el, to, paint, { duration = 420, from: start0 } = {}) {
  if (!el) return
  if (!el.__roll && Number.isFinite(start0)) el.__roll = { cur: start0, to: start0, raf: 0 }
  const st = el.__roll
  if (!st) { el.__roll = { cur: to, to, raf: 0 }; paint(to); return }
  if (st.to === to) return
  cancelAnimationFrame(st.raf)
  st.to = to
  const from = st.cur
  // Sin cuadros que animar (ventana oculta), el número igual tiene que quedar bien.
  if (document.hidden) { st.cur = to; paint(to); return }
  const start = performance.now()
  const ease = (t) => 1 - Math.pow(1 - t, 3)
  const frame = (now) => {
    if (!el.isConnected) return
    const k = ease(Math.min(1, (now - start) / duration))
    st.cur = Number.isFinite(from) ? from + (to - from) * k : to
    paint(st.cur)
    if (k < 1) st.raf = requestAnimationFrame(frame)
  }
  st.raf = requestAnimationFrame(frame)
}

/* ── Tamaño que viaja ───────────────────────────────────────────────────────
   Un elemento que cambió de tamaño va del que tenía (`from`, medido antes del
   cambio) al de ahora, en vez de saltar. `ignore` son hijos que se están
   yendo: no cuentan para el destino. Si se ACHICA con algo yéndose adentro,
   primero se va lo de adentro y recién después se pliega la caja: al revés,
   la caja cortaba lo que todavía se veía casi entero. */
export function glideSize (el, from, { ignore = [], width = true, height = true } = {}) {
  if (!el || !from) return
  ignore.forEach((o) => { o.style.display = 'none' })
  const to = { w: el.offsetWidth, h: el.offsetHeight }
  ignore.forEach((o) => { o.style.display = '' })
  const dw = width && Math.abs(to.w - from.w) >= 1
  const dh = height && Math.abs(to.h - from.h) >= 1
  if (!dw && !dh) return
  el.__glide?.cancel()
  const a = {}; const b = {}
  if (dw) { a.width = `${from.w}px`; b.width = `${to.w}px` }
  if (dh) { a.height = `${from.h}px`; b.height = `${to.h}px` }
  const shrinks = ignore.length > 0 && ((dw && to.w < from.w) || (dh && to.h < from.h))
  el.__glide = el.animate([{ ...a, overflow: 'hidden' }, { ...b, overflow: 'hidden' }], shrinks
    ? { duration: T().size - 40, delay: T().out - 50, easing: T().both, fill: 'backwards' }
    : { duration: T().size, easing: T().ease })
}

/* ── Relevo de contenido ────────────────────────────────────────────────────
   Un valor que cambia EN SU LUGAR: el viejo se va y el nuevo entra en la misma
   celda, esperando a que el viejo casi no se vea.
     dir   1 sube, -1 baja: un contador que avanza o retrocede.
     size  la caja va de su tamaño al nuevo en vez de saltar (un botón que
           cambia de rótulo).
   La primera vez adopta lo que el elemento ya tenía, sin animarlo. Uno en
   línea (un número en medio de una oración) sigue en línea. */
export function swap (el, html, { dir = 0, size = false } = {}) {
  if (!el) return null
  let items = [...el.children].filter((c) => c.classList.contains('swap-item'))
  if (!items.length) {
    if (getComputedStyle(el).display.startsWith('inline')) el.classList.add('swap-inline')
    const first = document.createElement('span')
    first.className = 'swap-item is-settled'
    first.append(...el.childNodes)
    el.appendChild(first)
    el.__swap = first.innerHTML
    items = [first]
  }
  el.classList.add('swap')
  if (html === el.__swap) return null
  el.__swap = html
  const live = items.filter((c) => c.dataset.state !== 'closing')
  const from = size ? { w: el.offsetWidth, h: el.offsetHeight } : null
  const d = dir > 0 ? 'up' : dir < 0 ? 'down' : ''
  const next = document.createElement('span')
  next.className = 'swap-item'
  next.innerHTML = html
  if (d) next.dataset.dir = d
  live.forEach((o) => {
    if (d) o.dataset.dir = d; else delete o.dataset.dir
    exit(o, { fallback: 220 })
  })
  // Si no había nada a la vista (un vacío), lo nuevo entra sin esperar.
  if (live.some((o) => o.textContent.trim() || o.querySelector('svg'))) next.classList.add('is-after')
  el.appendChild(next)
  setTimeout(() => next.classList.add('is-settled'), 420)
  if (from) glideSize(el, from, { ignore: live })
  return next
}

/** El texto de un elemento, con relevo si cambió. */
export const swapText = (el, text, opts) => swap(el, esc(text), opts)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/* ── Listas que se ponen al día ─────────────────────────────────────────────
   reconcile() pone una lista al día fila por fila, por clave:
   · las que siguen son el MISMO nodo, y viajan a su lugar nuevo (FLIP);
   · las que ya no están salen desde donde estaban, fuera del flujo;
   · las nuevas entran, y si había algo yéndose, esperan a que casi no se vea.

   items: [{ key, html } | { key, node }]. Con `node` (puede ser un getter:
   se lee solo si la clave es nueva), la fila la arma quien llama, con sus
   listeners, y para una que sigue `update(el, item)` la pone al día en su
   lugar. Con `html`, una fila que sigue y cambió copia los atributos y releva
   su contenido con un parpadeo corto (`created(el, item)` vuelve a cablearla).
     mutate  lo que cambia la forma del contenedor (lista ↔ grilla): corre
             después de medir dónde estaba cada fila, así viajan
     enter   false: las nuevas aparecen sin animar (la primera pintada) */
export function reconcile (box, items, { update, created, mutate, enter = true } = {}) {
  const was = new Map()
  const leaving = []
  for (const el of box.children) {
    if (el.dataset.state === 'closing') continue
    if (el.dataset.key != null && !was.has(el.dataset.key)) was.set(el.dataset.key, el)
    else leaving.push(el)    // lo que no tiene clave (un aviso de lista vacía) también se va
  }
  const keep = new Set(items.map((it) => it.key))
  for (const [k, el] of was) if (!keep.has(k)) leaving.push(el)

  // Dónde estaba cada cosa: todas las lecturas antes de cualquier escritura.
  const box0 = box.getBoundingClientRect()
  const first = new Map()
  for (const el of box.children) if (el.dataset.state !== 'closing') first.set(el, el.getBoundingClientRect())
  for (const el of was.values()) { el.__move?.cancel(); el.__move = null }
  mutate?.()

  if (leaving.length && getComputedStyle(box).position === 'static') box.style.position = 'relative'
  for (const el of leaving) {
    const r = first.get(el)
    Object.assign(el.style, {
      position: 'absolute', margin: '0', boxSizing: 'border-box', pointerEvents: 'none', zIndex: '0',
      top: `${r.top - box0.top - box.clientTop + box.scrollTop}px`,
      left: `${r.left - box0.left - box.clientLeft + box.scrollLeft}px`,
      width: `${r.width}px`, height: `${r.height}px`
    })
    el.dataset.state = 'closing'
    const op = Number(getComputedStyle(el).opacity) || 0
    const anim = el.animate([{ opacity: op }, { opacity: 0 }], { duration: T().out, easing: T().both, fill: 'forwards' })
    settled(anim, T().out + 200, () => el.remove())
  }

  const fresh = []
  let prev = null
  for (const it of items) {
    let el = was.get(it.key)
    const own = 'node' in it
    if (!el) {
      el = own ? it.node : make(it)
      el.dataset.key = it.key
      el.__item = it
      el.__own = own
      fresh.push(el)
    } else if (own) {
      el.__item = it
      update?.(el, it)
    } else if (el.__html !== it.html) {
      morph(el, it, created)
      el.__html = it.html
    }
    // A su lugar, salteando lo que se está yendo (no cuenta para el orden).
    let want = prev ? prev.nextElementSibling : box.firstElementChild
    while (want && want !== el && want.dataset.state === 'closing') want = want.nextElementSibling
    if (want !== el) {
      box.insertBefore(el, want)
      if (!fresh.includes(el)) quiet(el)   // moverlo le reinicia las animaciones de CSS
    }
    prev = el
  }
  for (const el of fresh) { quiet(el); if (!el.__own) created?.(el, el.__item) }

  // Las que siguen viajan de donde estaban a donde quedaron.
  const vh = window.innerHeight
  for (const el of was.values()) {
    if (!keep.has(el.dataset.key)) continue
    const a = first.get(el)
    const b = el.getBoundingClientRect()
    const dx = a.left - b.left
    const dy = a.top - b.top
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
    if ((a.bottom < 0 && b.bottom < 0) || (a.top > vh && b.top > vh)) continue   // afuera: nadie lo ve
    el.__move = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: T().move, easing: T().ease })
  }

  if (enter) {
    const wait = leaving.length ? T().after : 0
    fresh.forEach((el, i) => {
      const a = el.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: T().in, easing: T().ease, delay: wait + Math.min(i, 16) * T().step, fill: 'backwards' })
      // Sin cuadros (ventana oculta) la entrada no avanza: que igual quede a la vista.
      settled(a, T().in + wait + 16 * T().step + 200, () => a.finish())
    })
  }
  return { fresh, leaving }
}

function make (it) {
  const t = document.createElement('template')
  t.innerHTML = it.html.trim()
  const el = t.content.firstElementChild
  el.__html = it.html
  el.__inner = el.innerHTML
  return el
}

/* Sin la entrada propia de la fila (la que tiene en su CSS para cuando la
   lista se pinta entera): de entrar se encarga reconcile(). Cancelada por la
   API, una animación de CSS no vuelve hasta que cambie su nombre, así que la
   salida de [data-state=closing] sigue funcionando. */
function quiet (el) {
  for (const a of el.getAnimations()) if (a instanceof CSSAnimation && a.effect?.getTiming().iterations !== Infinity) a.cancel()
}

/* Una fila que sigue pero cambió: los atributos se copian (las clases nuevas
   corren con sus transiciones), y el contenido, si cambió, se releva con un
   parpadeo corto en vez de cambiar de un cuadro al otro. */
function morph (el, it, created) {
  const t = document.createElement('template')
  t.innerHTML = it.html.trim()
  const nu = t.content.firstElementChild
  for (const { name } of [...el.attributes]) if (name !== 'data-key' && name !== 'data-state' && !nu.hasAttribute(name)) el.removeAttribute(name)
  for (const { name, value } of [...nu.attributes]) if (el.getAttribute(name) !== value) el.setAttribute(name, value)
  el.__item = it
  if (nu.innerHTML === el.__inner) return
  el.__inner = nu.innerHTML
  el.__next = nu
  if (el.__blink) return               // ya hay uno en curso: usa lo último que llegue
  el.__blink = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: T().both, fill: 'forwards' })
  settled(el.__blink, 200, () => {
    const latest = el.__next
    el.__next = null
    el.replaceChildren(...latest.childNodes)
    created?.(el, el.__item)
    el.__blink.cancel()
    el.__blink = null
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T().in - 100, easing: T().ease })
  })
}

/**
 * El contenido de un bloque que cambió, con un parpadeo corto en vez de
 * cambiar de un cuadro al otro: se apaga en 90 ms, se reescribe y vuelve. Si
 * llega otro cambio mientras tanto, se usa el último.
 */
export function blinkTo (el, html) {
  el.__next = html
  if (el.__blink) return
  el.__blink = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: T().both, fill: 'forwards' })
  settled(el.__blink, 200, () => {
    el.innerHTML = el.__next
    el.__next = null
    el.__blink.cancel()
    el.__blink = null
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T().in - 100, easing: T().ease })
  })
}
