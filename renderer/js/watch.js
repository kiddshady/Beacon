import { icon } from './icons.js'
import { afterExit } from './ui.js'

/**
 * El popover de vigilancia continua: encender, elegir cada cuánto, ver cómo va.
 *
 * Es un panel chico colgado del botón "Vigilar" de la barra. El estado real
 * vive en el proceso principal (que es quien tiene el reloj y la bandeja); acá
 * solo se muestra y se le piden cambios.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const hora = (ts) => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

function inMinutes (ts) {
  const m = Math.max(0, Math.round((ts - Date.now()) / 60000))
  return m === 0 ? 'en menos de un minuto' : m === 1 ? 'en 1 min' : `en ${m} min`
}

function statusLine (w) {
  if (!w.enabled) return { text: 'Apagada. Beacon solo mira cuando vos escaneás.' }
  const net = w.cidr || 'la red'
  if (w.running) return { text: `Barriendo ${net}`, live: true }
  const bits = [`Vigilando ${net}`]
  if (w.lastRun) bits.push(`último ${hora(w.lastRun)}${w.lastCount != null ? ` (${w.lastCount} aparatos)` : ''}`)
  if (w.nextRun) bits.push(`próximo ${inMinutes(w.nextRun)}`)
  return { text: bits.join(' · ') }
}

export function installWatch ({ button, bridge, getScope, getScopes }) {
  let pop = null
  let watch = { enabled: false, intervalMin: 15, intervals: [5, 15, 30, 60] }
  let closing = false
  let ticker = null

  /* ── Botón de la barra ─────────────────────────────────────────────── */

  function paintButton () {
    button.classList.toggle('on', !!watch.enabled)
    button.classList.toggle('busy', !!watch.running)
    button.querySelector('.watch-label').textContent = watch.enabled ? 'Vigilando' : 'Vigilar'
    button.dataset.tip = watch.enabled
      ? `Vigilando ${watch.cidr || 'la red'} cada ${watch.intervalMin} min`
      : 'Vigilancia continua: barre la red cada tanto y avisa si aparece alguien'
  }

  /* ── Popover ───────────────────────────────────────────────────────── */

  function build () {
    const el = document.createElement('div')
    el.className = 'popover watch-pop'
    el.setAttribute('role', 'dialog')
    el.innerHTML = `
      <header class="watch-head">
        <span class="watch-title">Vigilancia continua</span>
        <button class="switch" role="switch" aria-checked="${watch.enabled}" data-toggle><i></i></button>
      </header>
      <div class="watch-row">
        <span class="watch-row-label">Red</span>
        <span class="pills" data-scopes></span>
      </div>
      <div class="watch-row">
        <span class="watch-row-label">Barre la red cada</span>
        <span class="pills" data-intervals></span>
      </div>
      <p class="watch-status" data-status></p>
      <div class="watch-row watch-autostart" data-autostart-row>
        <span class="watch-row-label">Arrancar con Windows, en la bandeja</span>
        <button class="switch small" role="switch" aria-checked="false" data-autostart><i></i></button>
      </div>
      <p class="watch-note">Con la vigilancia activa, cerrar la ventana la manda a la bandeja,
        y te aviso cuando aparece alguien que no estaba.</p>
      <footer class="watch-foot">
        <button class="btn btn-small" data-now>${icon('radar')}Barrer ahora</button>
      </footer>`

    el.querySelector('[data-toggle]').addEventListener('click', () => {
      const enabled = !watch.enabled
      bridge.configure({ enabled, scopeId: enabled ? (getScope()?.id || null) : watch.scopeId }).then(apply)
    })
    el.querySelector('[data-autostart]').addEventListener('click', () => {
      bridge.configure({ autostart: !watch.autostart }).then(apply)
    })
    el.querySelector('[data-now]').addEventListener('click', () => {
      if (!watch.enabled) bridge.configure({ enabled: true, scopeId: getScope()?.id || null }).then(apply)
      else bridge.now().then(apply)
    })
    return el
  }

  function render () {
    if (!pop) return
    const sw = pop.querySelector('[data-toggle]')
    sw.setAttribute('aria-checked', String(!!watch.enabled))

    // Las redes: las detectadas y el rango a mano, si lo hay. La vigilada, marcada.
    const scopes = (getScopes?.() || []).filter(s => s.sweepable)
    const current = watch.enabled ? watch.scopeId : (getScope()?.id || null)
    pop.querySelector('[data-scopes]').replaceChildren(...scopes.map(s => {
      const b = document.createElement('button')
      b.className = 'pill-btn'
      b.type = 'button'
      b.setAttribute('aria-pressed', String(s.id === current))
      b.dataset.tip = s.cidr
      b.textContent = s.custom ? `a mano ${s.cidr}` : s.label
      b.addEventListener('click', () => bridge.configure({ scopeId: s.id }).then(apply))
      return b
    }))

    const auto = pop.querySelector('[data-autostart]')
    auto.setAttribute('aria-checked', String(!!watch.autostart))
    const autoRow = pop.querySelector('[data-autostart-row]')
    autoRow.classList.toggle('off', !watch.enabled)
    autoRow.dataset.tip = watch.autostartAvailable
      ? 'Al iniciar sesión, Beacon arranca escondida en la bandeja y sigue vigilando'
      : 'Solo en la app instalada: en desarrollo no hay .exe que registrar'
    auto.disabled = !watch.enabled || !watch.autostartAvailable

    const pills = pop.querySelector('[data-intervals]')
    pills.replaceChildren(...(watch.intervals || [5, 15, 30, 60]).map(m => {
      const b = document.createElement('button')
      b.className = 'pill-btn'
      b.type = 'button'
      b.setAttribute('aria-pressed', String(watch.intervalMin === m))
      b.textContent = `${m} min`
      b.addEventListener('click', () => bridge.configure({ intervalMin: m }).then(apply))
      return b
    }))

    const s = statusLine(watch)
    const st = pop.querySelector('[data-status]')
    st.textContent = s.text
    st.classList.toggle('live', !!s.live)
    st.classList.toggle('off', !watch.enabled)

    const now = pop.querySelector('[data-now]')
    now.disabled = !!watch.enabled && !!watch.running
    now.innerHTML = `${icon('radar')}${!watch.enabled ? 'Encender y barrer' : watch.running ? 'Barriendo…' : 'Barrer ahora'}`
  }

  function place () {
    if (!pop) return
    const a = button.getBoundingClientRect()
    const p = pop.getBoundingClientRect()
    let x = a.right - p.width
    x = Math.max(8, Math.min(x, window.innerWidth - p.width - 8))
    pop.style.left = `${Math.round(x)}px`
    pop.style.top = `${Math.round(a.bottom + 8)}px`
  }

  function open () {
    if (pop) return
    pop = build()
    document.body.append(pop)
    render()
    place()
    void pop.offsetHeight
    pop.classList.add('on')
    button.setAttribute('aria-expanded', 'true')
    // El "próximo en N min" tiene que envejecer solo.
    ticker = setInterval(render, 20000)
    setTimeout(() => document.addEventListener('pointerdown', onOutside), 0)
    window.addEventListener('resize', place)
  }

  function close () {
    if (!pop || closing) return
    closing = true
    const node = pop
    node.classList.add('closing')
    button.setAttribute('aria-expanded', 'false')
    clearInterval(ticker)
    document.removeEventListener('pointerdown', onOutside)
    window.removeEventListener('resize', place)
    afterExit(node, () => {
      node.remove()
      pop = null
      closing = false
    })
  }

  function onOutside (e) {
    if (pop && !pop.contains(e.target) && !button.contains(e.target)) close()
  }

  function apply (w) {
    if (!w) return
    watch = w
    paintButton()
    render()
  }

  button.addEventListener('click', () => pop ? close() : open())
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pop) { e.stopImmediatePropagation(); close() }
  }, true)

  bridge.onState(apply)
  bridge.state().then(apply)

  return { open, close, apply, get isOpen () { return !!pop }, get state () { return watch } }
}
