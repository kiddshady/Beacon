import { icon } from './icons.js'
import { timeAgo, afterExit, claimDialog, releaseDialog } from './ui.js'
import { swap, swapText, roll } from './motion.js'

/**
 * Panel "Acerca de": versión, estado de las actualizaciones y entorno.
 *
 * Es la única superficie donde el updater se deja ver a propósito. En el resto
 * de la app solo aparece cuando ya hay algo listo para instalar; acá se puede
 * preguntar "¿hay algo nuevo?" y ver qué contestó.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const REPO = 'https://github.com/kiddshady/Beacon'

/**
 * La unidad se elige con el valor YA redondeado: justo debajo de un mega,
 * 1.048.575 bytes daban «1024 KB» en vez de «1,0 MB» (lo arregló Opal). Y con
 * coma decimal, como todo lo demás en castellano.
 */
export function formatBytes (n) {
  if (!n) return ''
  if (Math.round(n / 1024) < 1024) return `${Math.round(n / 1024)} KB`
  const mb = n / 1024 / 1024
  return `${mb.toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`
}

/** Traduce la fase del updater a lo que se le dice a una persona. */
function describe (u) {
  const dev = u.reason === 'dev'
  switch (u.phase) {
    case 'checking':
      return { text: 'Buscando…', live: true, action: null }
    case 'up-to-date':
      return { text: 'Estás al día.', sub: u.checkedAt ? `revisado ${timeAgo(u.checkedAt)}` : '', action: 'check' }
    case 'available':
      return { text: `Hay una versión nueva: ${u.next}.`, sub: 'Se está descargando en segundo plano.', live: true, action: null }
    case 'downloading': {
      const pct = Math.round(u.progress || 0)
      const speed = u.speed ? ` · ${formatBytes(u.speed)}/s` : ''
      return { text: `Descargando ${u.next || ''}`.trim(), sub: `${pct} %${speed}`, progress: pct, live: true, action: null }
    }
    case 'ready':
      return { text: `${u.next} lista para instalar.`, sub: 'Se instala sola al cerrar, o ahora si reiniciás.', action: 'install' }
    case 'error':
      return { text: 'No se pudo buscar.', sub: u.error || '', action: 'check', error: true }
    default:
      return dev
        ? { text: 'En desarrollo no se buscan actualizaciones.', action: null }
        : { text: 'Todavía no se buscó.', action: 'check' }
  }
}

export function installAbout ({ button, bridge, getInfo }) {
  let overlay = null
  let update = { phase: 'idle', version: '' }
  let closing = false

  function build () {
    const info = getInfo()
    const v = info.versions || {}
    const nmap = info.nmap
    const nmapLine = nmap?.available
      ? `${esc(nmap.version)} · ${nmap.elevated ? 'con admin' : 'sin admin'}`
      : 'no instalado'

    const el = document.createElement('div')
    el.className = 'overlay'
    el.innerHTML = `
      <div class="about" role="dialog" aria-modal="true" aria-labelledby="about-title" tabindex="-1">
        <header class="about-head">
          <span class="brand">${icon('beacon')}</span>
          <div class="about-title">
            <b id="about-title">Beacon</b>
            <span class="mono selectable">v${esc(info.version)}</span>
          </div>
          <button class="btn-icon" data-tip="Cerrar" data-close>${icon('close')}</button>
        </header>
        <p class="about-blurb selectable">Radar de red. Descubre qué hay conectado a tu LAN y te lo explica en castellano.</p>

        <section class="about-section">
          <h3 class="label">Actualizaciones</h3>
          <div class="about-update" data-update></div>
        </section>

        <section class="about-section">
          <h3 class="label">Entorno</h3>
          <dl class="about-env">
            <dt>nmap</dt><dd class="mono selectable">${nmapLine}</dd>
            <dt>Electron</dt><dd class="mono selectable">${esc(v.electron || '—')}</dd>
            <dt>Chromium</dt><dd class="mono selectable">${esc(v.chrome || '—')}</dd>
            <dt>Node</dt><dd class="mono selectable">${esc(v.node || '—')}</dd>
          </dl>
        </section>

        <section class="about-section">
          <h3 class="label">Atajos</h3>
          <dl class="about-keys">
            <dt><kbd>Ctrl</kbd><kbd>Enter</kbd></dt><dd>Escanear, o detener</dd>
            <dt><kbd>1</kbd>–<kbd>4</kbd></dt><dd>Elegir qué escanear</dd>
            <dt><kbd>/</kbd></dt><dd>Filtrar la lista</dd>
            <dt><kbd>G</kbd></dt><dd>Lista o grilla</dd>
            <dt><kbd>Esc</kbd></dt><dd>Volver · detener · limpiar el filtro</dd>
            <dt><kbd>Ctrl</kbd><kbd>,</kbd></dt><dd>Este panel</dd>
          </dl>
        </section>

        <footer class="about-links">
          <a href="${REPO}" target="_blank" rel="noopener">Repositorio ${icon('external')}</a>
          <a href="${REPO}/releases" target="_blank" rel="noopener">Versiones ${icon('external')}</a>
        </footer>
      </div>`

    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-close]')) close()
    })
    return el
  }

  /**
   * El estado del updater se pone al día en su lugar. Antes se rehacía entero
   * con cada dato: durante una descarga eso era varias veces por segundo, y la
   * barra saltaba (un nodo nuevo no tiene de dónde transicionar) y el
   * porcentaje cambiaba de golpe. Ahora la barra avanza con su transición, el
   * porcentaje corre desde lo que se ve, y el texto y el botón se relevan
   * solo cuando cambia la fase.
   */
  function renderUpdate () {
    if (!overlay) return
    const wrap = overlay.querySelector('[data-update]')
    const d = describe(update)

    let box = wrap.querySelector('.about-status')
    if (!box) {
      box = document.createElement('div')
      box.className = 'about-status'
      box.innerHTML =
        `<div class="about-status-text">` +
        `<span class="about-status-line"><span class="selectable" data-text></span></span>` +
        `<small class="selectable" data-sub></small>` +
        `<div class="progress"><i></i></div>` +
        `</div>` +
        `<button class="btn btn-small swap-row" type="button" data-action></button>`
      box.querySelector('[data-action]').addEventListener('click', (e) => {
        const b = e.currentTarget
        if (b.__action === 'check') bridge.check()
        else if (b.__action === 'install') {
          b.disabled = true
          swap(b, 'Reiniciando…', { size: true })
          bridge.install()
        }
      })
      wrap.replaceChildren(box)
    }
    box.classList.toggle('error', !!d.error)
    box.classList.toggle('live', !!d.live)

    swapText(box.querySelector('[data-text]'), d.text)

    // El porcentaje de una descarga corre; el resto de la línea de abajo se releva.
    const sub = box.querySelector('[data-sub]')
    if (d.progress != null) {
      const speed = (d.sub || '').replace(/^\d+ %/, '')
      if (sub.__mode !== 'progress') { sub.__mode = 'progress'; sub.__roll = null; sub.textContent = '' }
      roll(sub, d.progress, (v) => { sub.textContent = `${Math.round(v)} %${speed}` }, { duration: 500, from: 0 })
    } else {
      if (sub.__mode === 'progress') { cancelAnimationFrame(sub.__roll?.raf); sub.__roll = null }
      sub.__mode = 'text'
      swapText(sub, d.sub || '')
    }
    const bar = box.querySelector('.progress')
    bar.classList.toggle('on', d.progress != null)
    bar.querySelector('i').style.width = `${d.progress ?? 0}%`

    const b = box.querySelector('[data-action]')
    const label = d.action === 'check'
      ? `${icon('refresh')}${update.phase === 'up-to-date' ? 'Buscar de nuevo' : update.phase === 'error' ? 'Reintentar' : 'Buscar'}`
      : d.action === 'install' ? `${icon('update')}Reiniciar` : ''
    b.__action = d.action
    b.classList.toggle('hidden', !d.action)
    if (label && b.__label !== label) { swap(b, label, { size: true }); b.__label = label }
    if (d.action !== 'install') b.disabled = false
  }

  function open () {
    if (overlay) return
    overlay = build()
    if (claimDialog(close)) overlay.classList.add('is-after')
    document.body.append(overlay)
    renderUpdate()
    // Reflow forzado antes de encender: así la transición arranca desde 0 aunque
    // la ventana esté oculta (rAF se pausa ahí y el panel aparecería de golpe).
    void overlay.offsetHeight
    overlay.classList.add('on')
    overlay.querySelector('.about').focus({ preventScroll: true })
  }

  function close () {
    if (!overlay || closing) return
    closing = true
    const node = overlay
    // Si lo relevó otro diálogo, el foco ya es de ese: no vuelve al botón.
    const last = releaseDialog(close)
    node.classList.add('closing')
    afterExit(node.querySelector('.about'), () => {
      node.remove()
      overlay = null
      closing = false
      if (last) button.focus({ preventScroll: true })
    })
  }

  function setUpdate (u) {
    update = u
    button.classList.toggle('dot', u.phase === 'ready')
    renderUpdate()
  }

  button.addEventListener('click', () => overlay ? close() : open())
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay) { e.stopImmediatePropagation(); close() }
  }, true)

  return { open, close, setUpdate, get isOpen () { return !!overlay } }
}
