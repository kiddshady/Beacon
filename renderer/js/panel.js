import { icon } from './icons.js'

/** Traduce el tipo de aparato a algo que se lee, no a una clave interna. */
const KIND_LABEL = {
  router: 'Router', printer: 'Impresora', camera: 'Cámara IP', nas: 'NAS',
  phone: 'Teléfono', apple: 'Dispositivo Apple', media: 'Reproductor / TV',
  console: 'Consola', iot: 'Domótica', sbc: 'Placa (Pi / SBC)', pc: 'Computadora',
  server: 'Servidor', virtual: 'Máquina virtual', self: 'Esta máquina',
  unknown: 'Sin identificar'
}

const KIND_ICON = {
  router: 'router', printer: 'printer', camera: 'camera', nas: 'nas', phone: 'phone',
  apple: 'apple', media: 'media', console: 'console', iot: 'iot', sbc: 'sbc',
  pc: 'pc', server: 'server', virtual: 'virtual', self: 'self', unknown: 'unknown'
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/**
 * Ordena para que lo importante quede arriba: router, después esta máquina,
 * después lo riesgoso, y el resto por número de IP.
 *
 * El `!!` no es adorno: los hosts que todavía no pasaron por todas las fases
 * traen `isGateway` en undefined, y `undefined !== false` da true — sin
 * normalizar, el comparador deja de ser consistente y el orden sale cualquiera.
 */
function sortHosts (a, b) {
  if (!!a.isGateway !== !!b.isGateway) return a.isGateway ? -1 : 1
  if (!!a.isSelf !== !!b.isSelf) return a.isSelf ? -1 : 1

  const warnA = (a.ports || []).some(p => p.risk === 'warn')
  const warnB = (b.ports || []).some(p => p.risk === 'warn')
  if (warnA !== warnB) return warnA ? -1 : 1

  const oct = ip => parseInt(ip.split('.')[3], 10) || 0
  return oct(a.ip) - oct(b.ip)
}

export function renderList (container, hosts, { selected, onSelect } = {}) {
  const sorted = [...hosts].sort(sortHosts)

  if (!sorted.length) {
    container.innerHTML = `<p class="empty-note">Todavía no apareció nadie.<br>
      Si recién arrancás, tocá <strong>Escanear</strong>.</p>`
    return
  }

  container.replaceChildren(...sorted.map((h, i) => {
    const warn = (h.ports || []).filter(p => p.risk === 'warn')
    const kind = h.kind || 'unknown'

    const card = document.createElement('button')
    card.className = 'host-card'
    if (h.isSelf) card.classList.add('is-self')
    if (warn.length) card.classList.add('has-warn')
    card.setAttribute('aria-pressed', String(selected === h.ip))
    // Escalonar la entrada hace que la lista se sienta llenarse, no parpadear.
    card.style.animationDelay = `${Math.min(i * 22, 300)}ms`

    card.innerHTML = `
      <span class="host-icon">${icon(KIND_ICON[kind])}</span>
      <span class="host-meta">
        <span class="host-name selectable">${esc(h.display || h.ip)}</span>
        <span class="host-sub">
          <span>${esc(h.ip)}</span>
          ${h.vendor ? `<span class="vendor">${esc(h.vendor)}</span>` : ''}
        </span>
      </span>
      <span class="host-right">
        ${h.ports?.length
          ? `<span class="pill ${warn.length ? 'warn' : 'phosphor'}">${h.ports.length}</span>`
          : ''}
        ${h.latency != null ? `<span class="pill">${h.latency}ms</span>` : ''}
      </span>`

    card.addEventListener('click', () => onSelect?.(h))
    return card
  }))
}

export function renderDetail (container, host, { onBack } = {}) {
  const kind = host.kind || 'unknown'
  const ports = [...(host.ports || [])].sort((a, b) => {
    const rank = { warn: 0, watch: 1, ok: 2 }
    return (rank[a.risk] ?? 3) - (rank[b.risk] ?? 3) || a.port - b.port
  })

  const wrap = document.createElement('div')
  wrap.className = 'detail'
  wrap.innerHTML = `
    <button class="back-btn" data-icon="back">Volver a la lista</button>

    <div class="detail-head">
      <span class="host-icon">${icon(KIND_ICON[kind])}</span>
      <span class="detail-title">
        <h2 class="selectable">${esc(host.display || host.ip)}</h2>
        <p>${esc(KIND_LABEL[kind])}${host.nameSource ? ` · nombre vía ${esc(host.nameSource)}` : ''}</p>
      </span>
    </div>

    <div class="detail-facts">
      <div class="fact"><span class="label">Dirección IP</span><b class="selectable">${esc(host.ip)}</b></div>
      <div class="fact"><span class="label">MAC</span><b class="selectable">${esc(host.mac || '—')}</b></div>
      <div class="fact"><span class="label">Fabricante</span><b class="selectable">${esc(host.vendor || '—')}</b>
        ${host.vendorNote ? `<span class="fact-note">${esc(host.vendorNote)}</span>` : ''}</div>
      <div class="fact"><span class="label">Latencia</span><b>${host.latency != null ? `${host.latency} ms` : '—'}</b></div>
      ${host.os ? `<div class="fact" style="grid-column:1/-1">
        <span class="label">Sistema operativo (estimado)</span>
        <b class="selectable">${esc(host.os.name)} · ${host.os.accuracy}% de confianza</b></div>` : ''}
    </div>

    <div class="label" style="padding:0 2px 8px">
      ${ports.length ? `Puertos abiertos (${ports.length})` : 'Puertos'}
    </div>
    <div id="port-list"></div>`

  const list = wrap.querySelector('#port-list')

  if (!ports.length) {
    list.innerHTML = `<p class="empty-note">Ningún puerto abierto entre los que se revisaron.<br>
      Este aparato está callado — que es exactamente lo que uno quiere.</p>`
  } else {
    list.replaceChildren(...ports.map((p, i) => {
      const row = document.createElement('div')
      row.className = `port-row ${p.risk === 'warn' ? 'warn' : ''}`
      row.style.animationDelay = `${Math.min(i * 28, 320)}ms`
      row.innerHTML = `
        <span class="port-num selectable">${p.port}</span>
        <span>
          <span class="port-name">${esc(p.name)}</span>
          <div class="port-what selectable">${esc(p.what)}</div>
          ${p.product ? `<div class="port-product selectable">${esc(p.product)}</div>` : ''}
        </span>`
      return row
    }))
  }

  wrap.querySelector('.back-btn').addEventListener('click', () => onBack?.())
  container.replaceChildren(wrap)
  return wrap
}

export function renderNotice (container, message) {
  // Un mismo aviso repetido no aporta nada y empuja la lista hacia abajo.
  for (const existing of container.querySelectorAll('.notice')) {
    if (existing.dataset.message === message) return
  }

  const div = document.createElement('div')
  div.className = 'notice'
  div.dataset.message = message
  div.innerHTML = `${icon('alert')}<span class="selectable">${esc(message)}</span>`
  container.prepend(div)
}

/**
 * Aviso de que hay una versión nueva ya descargada. Va con el color del fósforo,
 * no del warning: no es un problema, es una buena noticia. Se pinta una sola vez.
 */
export function renderUpdateNotice (container, { next, onInstall }) {
  if (container.querySelector('.notice.update')) return

  const div = document.createElement('div')
  div.className = 'notice update'
  div.innerHTML =
    `${icon('update')}` +
    `<span class="selectable">Beacon <b class="mono">${esc(next)}</b> ya está descargada. ` +
    `Se instala sola al cerrar, o ahora mismo si querés.</span>` +
    `<button class="btn btn-small" type="button">Reiniciar</button>`

  const btn = div.querySelector('button')
  btn.addEventListener('click', () => {
    btn.disabled = true
    btn.textContent = 'Reiniciando…'
    onInstall()
  })
  container.prepend(div)
}
