import { icon } from './icons.js'
import { timeAgo, afterExit } from './ui.js'

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

function formatBytes (n) {
  if (!n) return ''
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
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

  function renderUpdate () {
    if (!overlay) return
    const wrap = overlay.querySelector('[data-update]')
    const d = describe(update)

    const box = document.createElement('div')
    box.className = 'about-status' + (d.error ? ' error' : '') + (d.live ? ' live' : '')
    box.innerHTML =
      `<div class="about-status-text">` +
      `<span class="selectable">${esc(d.text)}</span>` +
      (d.sub ? `<small class="selectable">${esc(d.sub)}</small>` : '') +
      (d.progress != null ? `<div class="progress on"><i style="width:${d.progress}%"></i></div>` : '') +
      `</div>`

    if (d.action === 'check') {
      const b = document.createElement('button')
      b.className = 'btn btn-small'
      b.innerHTML = `${icon('refresh')}${update.phase === 'up-to-date' ? 'Buscar de nuevo' : update.phase === 'error' ? 'Reintentar' : 'Buscar'}`
      b.addEventListener('click', () => bridge.check())
      box.append(b)
    } else if (d.action === 'install') {
      const b = document.createElement('button')
      b.className = 'btn btn-small'
      b.innerHTML = `${icon('update')}Reiniciar`
      b.addEventListener('click', () => {
        b.disabled = true
        b.textContent = 'Reiniciando…'
        bridge.install()
      })
      box.append(b)
    }

    // Se reemplaza el nodo entero para que la entrada se anime en cada cambio de fase.
    wrap.replaceChildren(box)
  }

  function open () {
    if (overlay) return
    overlay = build()
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
    node.classList.add('closing')
    afterExit(node.querySelector('.about'), () => {
      node.remove()
      overlay = null
      closing = false
      button.focus({ preventScroll: true })
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
