import { icon } from './icons.js'
import { afterExit } from './ui.js'

/**
 * Historial: cómo estaba la red cada vez que se la escaneó.
 *
 * Un panel flotante con los escaneos guardados de la red elegida, del más
 * reciente al más viejo: cuándo, qué preset, cuántos aparatos, y qué cambió
 * respecto del anterior. Cada fila se despliega para ver quiénes estaban.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const PRESET_LABEL = { who: 'quién está', quick: 'rápido', deep: 'profundo', exposed: 'expuesto' }

function when (ts) {
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const time = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `hoy ${time}`
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `ayer ${time}`
  return `${d.toLocaleDateString('es', { day: 'numeric', month: 'short' })} ${time}`
}

function changes (e) {
  const bits = []
  if (e.added?.length) bits.push({ cls: 'plus', text: `+${e.added.length} ${e.added.length === 1 ? 'nuevo' : 'nuevos'}`, tip: e.added.join(', ') })
  if (e.missing?.length) bits.push({ cls: 'minus', text: `−${e.missing.length} ${e.missing.length === 1 ? 'faltó' : 'faltaron'}`, tip: e.missing.join(', ') })
  if (e.moved?.length) bits.push({ cls: '', text: `${e.moved.length} ${e.moved.length === 1 ? 'cambió de IP' : 'cambiaron de IP'}`, tip: e.moved.join(', ') })
  if (e.openedPorts?.length) bits.push({ cls: 'port', text: `${e.openedPorts.length === 1 ? 'puerto nuevo' : 'puertos nuevos'}`, tip: e.openedPorts.join(' · ') })
  return bits
}

export function installHistory ({ button, bridge, getScope }) {
  let overlay = null
  let closing = false

  function build (scope, data) {
    const el = document.createElement('div')
    el.className = 'overlay'
    const rows = data.history.map((e, i) => `
      <div class="hist-row" style="animation-delay:${Math.min(i * 30, 300)}ms">
        <button class="hist-head" aria-expanded="false">
          <span class="hist-when">${esc(when(e.at))}</span>
          <span class="hist-meta">${esc(PRESET_LABEL[e.preset] || e.preset)} · <b>${e.count}</b> ${e.count === 1 ? 'aparato' : 'aparatos'}</span>
          <span class="hist-changes">${changes(e).map(c => `<span class="hist-chip ${c.cls}" data-tip="${esc(c.tip)}">${esc(c.text)}</span>`).join('') || '<span class="hist-chip quiet">sin novedades</span>'}</span>
          <span class="hist-caret">${icon('back')}</span>
        </button>
        <div class="hist-body"><div>
          ${e.hosts.map(h => `<span class="hist-host"><b class="selectable">${esc(h.name)}</b><span class="mono selectable">${esc(h.ip)}</span>${h.ports ? `<span class="pill">${h.ports}</span>` : ''}</span>`).join('')}
        </div></div>
      </div>`).join('')

    el.innerHTML = `
      <div class="about history" role="dialog" aria-modal="true" aria-labelledby="hist-title" tabindex="-1">
        <header class="about-head">
          <span class="brand">${icon('history')}</span>
          <div class="about-title">
            <b id="hist-title">Historial</b>
            <span class="mono selectable">${esc(scope?.cidr || '')}</span>
          </div>
          <button class="btn-icon" data-tip="Cerrar" data-close>${icon('close')}</button>
        </header>
        ${data.history.length
          ? `<p class="about-blurb">${data.scans} ${data.scans === 1 ? 'escaneo guardado' : 'escaneos guardados'} de esta red; se muestran los últimos ${data.history.length}. Cada fila se despliega para ver quiénes estaban.</p>
             <div class="hist-list scroll-y">${rows}</div>`
          : `<p class="about-blurb">Todavía no hay escaneos guardados de esta red. Escaneá una vez y acá va a quedar cómo estaba.</p>`}
      </div>`

    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-close]')) return close()
      const head = e.target.closest('.hist-head')
      if (head) {
        const open = head.getAttribute('aria-expanded') === 'true'
        head.setAttribute('aria-expanded', String(!open))
        head.parentElement.classList.toggle('open', !open)
      }
    })
    return el
  }

  async function open () {
    if (overlay) return
    const scope = getScope()
    let data = { scans: 0, history: [] }
    try { data = await bridge.history(scope?.cidr) } catch { /* sin memoria, panel vacío */ }
    overlay = build(scope, data)
    document.body.append(overlay)
    void overlay.offsetHeight
    overlay.classList.add('on')
    overlay.querySelector('.about').focus({ preventScroll: true })
  }

  function close () {
    if (!overlay || closing) return
    closing = true
    const node = overlay
    node.classList.add('closing')
    afterExit(node.querySelector('.about'), () => {
      node.remove()
      overlay = null
      closing = false
      button.focus({ preventScroll: true })
    })
  }

  button.addEventListener('click', () => overlay ? close() : open())
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay) { e.stopImmediatePropagation(); close() }
  }, true)

  return { open, close, get isOpen () { return !!overlay } }
}

