import { icon } from './icons.js'
import { hostName, timeAgo, formatDate } from './ui.js'

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

export function renderList (container, hosts, { selected, onSelect, onHover, missing = [] } = {}) {
  const sorted = [...hosts].sort(sortHosts)

  if (!sorted.length && !missing.length) {
    container.innerHTML = `<p class="empty-note">Todavía no apareció nadie.<br>
      Si recién arrancás, tocá <strong>Escanear</strong>.</p>`
    return
  }

  const cards = sorted.map((h, i) => {
    const warn = (h.ports || []).filter(p => p.risk === 'warn')
    const kind = h.kind || 'unknown'

    const card = document.createElement('button')
    card.className = 'host-card'
    card.dataset.ip = h.ip
    if (h.isSelf) card.classList.add('is-self')
    if (warn.length) card.classList.add('has-warn')
    if (h.memory?.isNew) card.classList.add('is-new')
    card.setAttribute('aria-pressed', String(selected === h.ip))
    // Escalonar la entrada hace que la lista se sienta llenarse, no parpadear.
    card.style.animationDelay = `${Math.min(i * 22, 300)}ms`

    card.innerHTML = `
      <span class="host-icon">${icon(KIND_ICON[kind])}</span>
      <span class="host-meta">
        <span class="host-name selectable">${esc(hostName(h))}</span>
        <span class="host-sub">
          <span>${esc(h.ip)}</span>
          ${h.vendor ? `<span class="vendor">${esc(h.vendor)}</span>` : ''}
        </span>
      </span>
      <span class="host-right">
        ${h.memory?.isNew ? '<span class="pill new">nuevo</span>' : ''}
        ${h.ports?.length
          ? `<span class="pill ${warn.length ? 'warn' : 'phosphor'}">${h.ports.length}</span>`
          : ''}
        ${h.latency != null ? `<span class="pill">${h.latency}ms</span>` : ''}
      </span>`

    card.addEventListener('click', () => onSelect?.(h))
    card.addEventListener('mouseenter', () => onHover?.(h.ip))
    card.addEventListener('mouseleave', () => onHover?.(null))
    return card
  })

  // Los que estaban la última vez y ahora no contestaron: se muestran apagados,
  // al final, con lo que se recuerda de ellos. No son botones: no hay nada que abrir.
  if (missing.length) {
    const head = document.createElement('div')
    head.className = 'ghost-head label'
    head.textContent = `No contestaron esta vez (${missing.length})`
    cards.push(head)

    for (const [i, m] of missing.entries()) {
      const ghost = document.createElement('div')
      ghost.className = 'host-card ghost'
      ghost.style.animationDelay = `${Math.min((sorted.length + i) * 22, 300)}ms`
      ghost.innerHTML = `
        <span class="host-icon">${icon(KIND_ICON[m.kind] || 'unknown')}</span>
        <span class="host-meta">
          <span class="host-name selectable">${esc(m.name)}</span>
          <span class="host-sub">
            <span>${esc(m.ip)}</span>
            ${m.vendor ? `<span class="vendor">${esc(m.vendor)}</span>` : ''}
          </span>
        </span>
        <span class="host-right">
          ${m.lastSeen ? `<span class="pill">visto ${esc(timeAgo(m.lastSeen))}</span>` : ''}
        </span>`
      cards.push(ghost)
    }
  }

  container.replaceChildren(...cards)
}

/** Marca la tarjeta cuyo punto está bajo el mouse en el radar (o ninguna). */
export function hotCard (container, ip) {
  for (const card of container.querySelectorAll('.host-card.hot')) card.classList.remove('hot')
  if (!ip) return
  const card = container.querySelector(`.host-card[data-ip="${CSS.escape(ip)}"]`)
  if (!card) return
  card.classList.add('hot')
  // Solo si está fuera de vista: barrer el radar no tiene que sacudir la lista.
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

/** Lo que la memoria sabe de este aparato, dicho en una línea. */
function historyLine (host) {
  const m = host.memory
  if (!m) return null
  if (m.isNew) return 'Primera vez que aparece en esta red.'
  if (!m.seenBefore) return 'Primer escaneo de esta red: todavía no hay con qué comparar.'

  const bits = []
  if (m.firstSeen) bits.push(`conocido desde el ${formatDate(m.firstSeen)}`)
  if (m.seenCount) bits.push(`visto ${m.seenCount} ${m.seenCount === 1 ? 'vez' : 'veces'}`)
  if (m.previousIp) bits.push(`antes en ${m.previousIp}`)
  const line = bits.join(' · ')
  return line ? line[0].toUpperCase() + line.slice(1) + '.' : null
}

export function renderDetail (container, host, { onBack, onAlias } = {}) {
  const kind = host.kind || 'unknown'
  const ports = [...(host.ports || [])].sort((a, b) => {
    const rank = { warn: 0, watch: 1, ok: 2 }
    return (rank[a.risk] ?? 3) - (rank[b.risk] ?? 3) || a.port - b.port
  })
  const history = historyLine(host)
  const detected = host.display || host.ip

  const wrap = document.createElement('div')
  wrap.className = 'detail'
  wrap.innerHTML = `
    <button class="back-btn">${icon('back')}Volver a la lista</button>

    <div class="detail-head">
      <span class="host-icon">${icon(KIND_ICON[kind])}</span>
      <span class="detail-title">
        <span class="detail-name">
          <h2 class="selectable">${esc(hostName(host))}</h2>
          ${onAlias ? `<button class="btn-icon edit" data-tip="Cambiar el nombre">${icon('edit')}</button>` : ''}
        </span>
        <p>${host.alias ? `detectado como ${esc(detected)} · ` : ''}${esc(KIND_LABEL[kind])}${host.nameSource ? ` · nombre vía ${esc(host.nameSource)}` : ''}</p>
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
      ${history ? `<div class="fact" style="grid-column:1/-1">
        <span class="label">Historial</span>
        <span class="fact-note selectable" style="margin-top:0">${esc(history)}</span></div>` : ''}
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
  wrap.querySelector('.edit')?.addEventListener('click', () => editAlias(wrap, host, onAlias))
  container.replaceChildren(wrap)
  return wrap
}

/**
 * El título se vuelve un campo. Enter guarda, Esc cancela, y salir del campo
 * también guarda: nadie quiere perder lo que escribió por un click afuera.
 * Vacío borra el alias y vuelve el nombre detectado.
 */
function editAlias (wrap, host, onAlias) {
  const name = wrap.querySelector('.detail-name')
  const h2 = name.querySelector('h2')
  if (name.querySelector('input')) return

  const input = document.createElement('input')
  input.className = 'alias-input'
  input.type = 'text'
  input.maxLength = 48
  input.spellcheck = false
  input.value = host.alias || ''
  input.placeholder = host.display || host.ip

  let done = false
  const finish = (save) => {
    if (done) return
    done = true
    const value = input.value.trim()
    input.classList.add('closing')
    input.addEventListener('transitionend', () => {
      input.replaceWith(h2)
      name.classList.remove('editing')
    }, { once: true })
    if (save && value !== (host.alias || '')) onAlias(host, value)
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finish(true)
    else if (e.key === 'Escape') { e.stopPropagation(); finish(false) }
  })
  input.addEventListener('blur', () => finish(true))

  name.classList.add('editing')
  h2.replaceWith(input)
  input.focus()
  input.select()
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

/** Quita un aviso animando su salida, en vez de arrancarlo del DOM. */
export function dismissNotice (node) {
  if (!node || node.classList.contains('closing')) return
  node.classList.add('closing')
  node.addEventListener('animationend', () => node.remove(), { once: true })
}

/**
 * El diff contra el escaneo anterior de esta red. Si no cambió nada no se dice
 * nada acá (lo dice la línea de fase, en chiquito): un aviso que aparece siempre
 * deja de leerse.
 */
export function renderDiffNotice (container, diff) {
  const names = (list, n = 3) => {
    const shown = list.slice(0, n).map(x => x.name)
    const rest = list.length - shown.length
    return shown.join(', ') + (rest > 0 ? ` y ${rest} más` : '')
  }

  let message
  if (diff.first) {
    message = 'Primer escaneo de esta red guardado. De acá en más te aviso quién aparece y quién falta.'
  } else {
    const parts = []
    if (diff.added.length) parts.push(`${diff.added.length === 1 ? 'nuevo' : 'nuevos'}: ${names(diff.added)}`)
    if (diff.missing.length) parts.push(`${diff.missing.length === 1 ? 'no contestó' : 'no contestaron'}: ${names(diff.missing)}`)
    if (diff.moved.length) parts.push(`${diff.moved.length === 1 ? 'cambió de IP' : 'cambiaron de IP'}: ${diff.moved.map(m => `${m.name} (${m.from} → ${m.to})`).join(', ')}`)
    if (!parts.length) return
    message = parts.map(p => p[0].toUpperCase() + p.slice(1)).join(' · ')
  }

  const div = document.createElement('div')
  div.className = 'notice diff'
  div.dataset.kind = 'diff'
  div.innerHTML = `${icon('radar')}<span class="selectable">${esc(message)}</span>`
  container.prepend(div)
}
