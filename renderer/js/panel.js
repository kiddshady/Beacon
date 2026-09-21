import { icon } from './icons.js'
import { hostName, timeAgo, formatDate, afterExit } from './ui.js'

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

/**
 * Texto contra el que se filtra un host: todo lo que alguien podría recordar
 * de un aparato — cómo lo llama, la IP, la MAC, el fabricante, un puerto.
 */
function haystack (h) {
  return [
    h.alias, h.display, h.name, h.ip, h.mac, h.vendor, h.os?.name,
    ...(h.ports || []).flatMap(p => [String(p.port), p.name, p.service, p.product])
  ].filter(Boolean).join(' ').toLowerCase()
}

/** Cada palabra del filtro tiene que aparecer, en cualquier orden. */
export function matchesFilter (h, filter) {
  const terms = filter.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = haystack(h)
  return terms.every(t => hay.includes(t))
}

export function renderList (container, hosts, { selected, onSelect, onHover, missing = [], layout = 'list', filter = '' } = {}) {
  const sorted = [...hosts].sort(sortHosts)
  container.classList.toggle('grid', layout === 'grid')

  if (!sorted.length && !missing.length) {
    container.innerHTML = filter
      ? `<p class="empty-note">Nada coincide con «${esc(filter)}».</p>`
      : `<p class="empty-note">Todavía no apareció nadie.<br>
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

/**
 * Puertos que suelen tener una web atrás, del más probable al menos. El panel
 * de un router, una impresora o un NAS casi siempre está en uno de estos.
 */
const WEB_PORTS = [
  [443, 'https'], [80, 'http'], [8080, 'http'], [8443, 'https'], [5000, 'http'], [5001, 'https'],
  [8000, 'http'], [8081, 'http'], [81, 'http'], [9000, 'http'], [3000, 'http'], [8123, 'http'], [631, 'http']
]
const WEB_SCHEME = new Map(WEB_PORTS)

export function webUrl (host, port) {
  const scheme = WEB_SCHEME.get(port)
  if (!scheme) return null
  const std = (scheme === 'http' && port === 80) || (scheme === 'https' && port === 443)
  return `${scheme}://${host.ip}${std ? '' : `:${port}`}/`
}

/** El mejor candidato a "panel" de este aparato, o null. */
export function panelUrl (host) {
  const open = new Set((host.ports || []).map(p => p.port))
  const hit = WEB_PORTS.find(([port]) => open.has(port))
  return hit ? webUrl(host, hit[0]) : null
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

export function renderDetail (container, host, { onBack, onAlias, onWake, onOpen, onCopy } = {}) {
  const kind = host.kind || 'unknown'
  const ports = [...(host.ports || [])].sort((a, b) => {
    const rank = { warn: 0, watch: 1, ok: 2 }
    return (rank[a.risk] ?? 3) - (rank[b.risk] ?? 3) || a.port - b.port
  })
  const history = historyLine(host)
  const detected = host.display || host.ip
  const panel = panelUrl(host)

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

    <div class="detail-actions">
      ${panel ? `<button class="btn btn-small" data-open data-tip="${esc(panel)}">${icon('external')}Abrir panel</button>` : ''}
      ${host.mac && !host.isSelf ? `<button class="btn btn-small" data-wake data-tip="Manda el paquete mágico de Wake-on-LAN al broadcast de la red">${icon('power')}Despertar</button>` : ''}
      <button class="btn btn-small" data-copy data-tip="Copiar la IP">${icon('copy')}${esc(host.ip)}</button>
    </div>

    <div class="detail-facts">
      <div class="fact"><span class="label">Dirección IP</span><b class="selectable">${esc(host.ip)}</b></div>
      <div class="fact"><span class="label">MAC</span><b class="selectable">${esc(host.mac || '—')}</b></div>
      <div class="fact"><span class="label">Fabricante</span><b class="selectable">${esc(host.vendor || '—')}</b>
        ${host.vendorNote ? `<span class="fact-note">${esc(host.vendorNote)}</span>` : ''}</div>
      ${host.model || host.upnp?.server ? `<div class="fact">
        <span class="label">${host.model ? 'Modelo' : 'Se presenta como'}</span>
        <b class="selectable">${esc(host.model || host.upnp.server)}</b>
        <span class="fact-note">${host.model ? 'lo dice el aparato, por UPnP' : 'cabecera SERVER de UPnP'}</span></div>` : ''}
      <div class="fact fact-ping">
        <span class="label">Latencia en vivo</span>
        <b data-ping-now>${host.latency != null ? `${host.latency} ms` : '—'}</b>
        <svg class="spark" data-spark viewBox="0 0 120 26" preserveAspectRatio="none" aria-hidden="true"></svg>
        <span class="fact-note" data-ping-note>midiendo…</span>
      </div>
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
      const url = webUrl(host, p.port)
      row.innerHTML = `
        <span class="port-num selectable">${p.port}</span>
        <span>
          <span class="port-name">${esc(p.name)}</span>
          <div class="port-what selectable">${esc(p.what)}</div>
          ${p.product ? `<div class="port-product selectable">${esc(p.product)}</div>` : ''}
        </span>
        ${url ? `<button class="btn-icon port-open" data-tip="Abrir ${esc(url)}">${icon('external')}</button>` : ''}`
      row.querySelector('.port-open')?.addEventListener('click', () => onOpen?.(url))
      return row
    }))
  }

  wrap.querySelector('.back-btn').addEventListener('click', () => onBack?.())
  wrap.querySelector('.edit')?.addEventListener('click', () => editAlias(wrap, host, onAlias))
  wrap.querySelector('[data-open]')?.addEventListener('click', () => onOpen?.(panel))
  wrap.querySelector('[data-copy]')?.addEventListener('click', (e) => {
    onCopy?.(host.ip)
    flash(e.currentTarget, `${icon('check')}Copiada`)
  })
  wrap.querySelector('[data-wake]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget
    btn.disabled = true
    try {
      await onWake?.(host)
      flash(btn, `${icon('check')}Enviado`)
    } catch {
      flash(btn, `${icon('alert')}No salió`)
    }
  })
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
    afterExit(input, () => {
      input.replaceWith(h2)
      name.classList.remove('editing')
    }, { event: 'transitionend', property: 'opacity', ms: 300 })
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
  afterExit(node, () => node.remove())
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

/** Un botón que confirma lo que hizo y vuelve a ser lo que era. */
function flash (btn, html, ms = 1500) {
  const prev = btn.innerHTML
  btn.innerHTML = html
  btn.classList.add('flash')
  setTimeout(() => {
    btn.innerHTML = prev
    btn.classList.remove('flash')
    btn.disabled = false
  }, ms)
}

/**
 * La latencia en vivo del detalle: el último valor, un sparkline con las
 * últimas muestras, y un resumen. Las que no contestaron van como marcas
 * abajo, en ámbar, para que un corte se vea como corte y no como cero.
 */
export function updatePing (container, samples) {
  const now = container.querySelector('[data-ping-now]')
  const spark = container.querySelector('[data-spark]')
  const note = container.querySelector('[data-ping-note]')
  if (!now || !spark) return

  const last = samples[samples.length - 1]
  const ok = samples.filter(s => s.ms != null).map(s => s.ms)
  const lost = samples.length - ok.length

  if (!last) {
    now.textContent = '—'
    note.textContent = 'midiendo…'
    return
  }
  now.textContent = last.ms == null ? 'sin respuesta' : `${last.ms} ms`
  now.classList.toggle('warn', last.ms == null)

  const bits = []
  if (ok.length) {
    const min = Math.min(...ok)
    const max = Math.max(...ok)
    const avg = Math.round(ok.reduce((a, b) => a + b, 0) / ok.length)
    bits.push(`mín ${min} · med ${avg} · máx ${max} ms`)
  }
  if (lost) bits.push(`${lost} sin respuesta`)
  note.textContent = bits.join(' · ') || 'midiendo…'

  // Escala: el máximo visto, nunca menos de 20 ms para que la LAN no sea ruido plano.
  const W = 120
  const H = 26
  const N = 40
  const view = samples.slice(-N)
  const scale = Math.max(20, ...ok)
  const x = (i) => (i / (N - 1)) * W
  const y = (ms) => H - 3 - (Math.min(ms, scale) / scale) * (H - 6)

  let d = ''
  let pen = false
  const misses = []
  view.forEach((s, i) => {
    const xi = x(N - view.length + i)
    if (s.ms == null) { pen = false; misses.push(xi); return }
    d += `${pen ? 'L' : 'M'}${xi.toFixed(1)} ${y(s.ms).toFixed(1)} `
    pen = true
  })

  spark.innerHTML =
    `<path d="${d.trim()}" />` +
    misses.map(xi => `<line class="miss" x1="${xi.toFixed(1)}" y1="${H - 1}" x2="${xi.toFixed(1)}" y2="${H - 6}" />`).join('')
}
