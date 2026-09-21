import { icon } from './icons.js'
import { afterExit, hostName } from './ui.js'
import { dismissNotice } from './panel.js'

/**
 * Exportar: el escaneo como JSON o CSV, o el radar como imagen.
 *
 * Los archivos se arman acá, en el renderer, que es quien tiene los datos tal
 * como se ven (alias incluidos); el principal solo abre el diálogo de guardar
 * y escribe. El PNG lo captura el principal de la ventana misma: sale tal cual
 * lo que estás viendo, con su CRT y todo.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const KINDS = [
  { kind: 'json', title: 'JSON', blurb: 'Todo lo del escaneo, para procesar con otra cosa.', needsHosts: true },
  { kind: 'csv', title: 'CSV', blurb: 'Una fila por aparato, para abrir en una planilla.', needsHosts: true },
  { kind: 'png', title: 'Imagen del radar', blurb: 'Una foto del radar tal como se ve ahora.', needsHosts: false }
]

function stamp (d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function suggestedName (cidr, ext) {
  const net = (cidr || 'red').replace(/[^0-9a-z.-]/gi, '-')
  return `beacon-${net}-${stamp()}.${ext}`
}

/* ── Formatos ──────────────────────────────────────────────────────────── */

export function toJSON ({ version, scope, preset, startedAt, durationMs, hosts, missing }) {
  return JSON.stringify({
    app: 'Beacon',
    version,
    exportedAt: new Date().toISOString(),
    network: scope?.cidr || null,
    preset,
    scannedAt: startedAt ? new Date(startedAt).toISOString() : null,
    durationMs: durationMs ?? null,
    hosts: hosts.map(h => ({
      ip: h.ip,
      mac: h.mac || null,
      name: hostName(h),
      alias: h.alias || null,
      detected: h.display || null,
      hostname: h.name || null,
      nameSource: h.nameSource || null,
      vendor: h.vendor || null,
      kind: h.kind || 'unknown',
      latencyMs: h.latency ?? null,
      isGateway: !!h.isGateway,
      isSelf: !!h.isSelf,
      os: h.os || null,
      ports: (h.ports || []).map(p => ({
        port: p.port, name: p.name, service: p.service || null, product: p.product || null, risk: p.risk, what: p.what
      })),
      memory: h.memory || null
    })),
    missing: (missing || []).map(m => ({ name: m.name, ip: m.ip, kind: m.kind, vendor: m.vendor, lastSeen: m.lastSeen }))
  }, null, 2)
}

/** Con punto y coma y BOM: así Excel en castellano lo abre en columnas y con acentos. */
export function toCSV ({ hosts }) {
  const cell = (v) => {
    const s = String(v ?? '')
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = [['ip', 'nombre', 'alias', 'nombre_detectado', 'mac', 'fabricante', 'tipo', 'latencia_ms', 'puertos', 'riesgo', 'nuevo']]
  for (const h of hosts) {
    const ports = (h.ports || [])
    rows.push([
      h.ip, hostName(h), h.alias || '', h.display || '', h.mac || '', h.vendor || '', h.kind || 'unknown',
      h.latency ?? '', ports.map(p => p.port).join(' '),
      ports.some(p => p.risk === 'warn') ? 'atención' : ports.some(p => p.risk === 'watch') ? 'mirar' : '',
      h.memory?.isNew ? 'sí' : 'no'
    ])
  }
  return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n'
}

/* ── Popover ───────────────────────────────────────────────────────────── */

export function installExport ({ button, bridge, getData, notices, radarPane }) {
  let pop = null
  let closing = false

  function build () {
    const data = getData()
    const el = document.createElement('div')
    el.className = 'popover export-pop'
    el.setAttribute('role', 'dialog')
    el.innerHTML = `
      <header class="watch-head"><span class="watch-title">Exportar</span></header>
      <div class="export-rows">
        ${KINDS.map(k => `
          <button class="export-row" data-kind="${k.kind}" ${k.needsHosts && !data.hosts.length ? 'disabled' : ''}>
            <span class="export-title">${esc(k.title)}</span>
            <span class="export-blurb">${esc(k.blurb)}${k.needsHosts && !data.hosts.length ? ' Primero escaneá.' : ''}</span>
          </button>`).join('')}
      </div>`
    for (const row of el.querySelectorAll('.export-row')) {
      row.addEventListener('click', () => { close(); save(row.dataset.kind) })
    }
    return el
  }

  async function save (kind) {
    const data = getData()
    const ext = kind
    const req = { kind, suggestedName: suggestedName(data.scope?.cidr, ext) }

    if (kind === 'json') req.data = toJSON(data)
    else if (kind === 'csv') req.data = toCSV(data)
    else if (kind === 'png') {
      const r = radarPane.getBoundingClientRect()
      req.rect = { x: r.left, y: r.top, width: r.width, height: r.height }
    }

    try {
      const res = await bridge.exportSave(req)
      if (res?.canceled) return
      saved(res.path)
    } catch (err) {
      failed(err.message)
    }
  }

  function saved (path) {
    const name = path.split(/[\\/]/).pop()
    const div = document.createElement('div')
    div.className = 'notice diff'
    div.dataset.kind = 'export'
    div.innerHTML =
      `${icon('check')}<span class="selectable">Guardado como <b class="mono">${esc(name)}</b>.</span>` +
      `<button class="btn btn-small" type="button">Mostrar</button>`
    div.querySelector('button').addEventListener('click', () => bridge.showInFolder(path))
    notices.prepend(div)
    setTimeout(() => dismissNotice(div), 9000)
  }

  function failed (message) {
    const div = document.createElement('div')
    div.className = 'notice'
    div.dataset.kind = 'export'
    div.innerHTML = `${icon('alert')}<span class="selectable">No se pudo guardar: ${esc(message)}</span>`
    notices.prepend(div)
    setTimeout(() => dismissNotice(div), 9000)
  }

  function place () {
    if (!pop) return
    const a = button.getBoundingClientRect()
    const p = pop.getBoundingClientRect()
    const x = Math.max(8, Math.min(a.right - p.width, window.innerWidth - p.width - 8))
    pop.style.left = `${Math.round(x)}px`
    pop.style.top = `${Math.round(a.bottom + 8)}px`
  }

  function open () {
    if (pop) return
    pop = build()
    document.body.append(pop)
    place()
    void pop.offsetHeight
    pop.classList.add('on')
    button.setAttribute('aria-expanded', 'true')
    setTimeout(() => document.addEventListener('pointerdown', onOutside), 0)
    window.addEventListener('resize', place)
  }

  function close () {
    if (!pop || closing) return
    closing = true
    const node = pop
    node.classList.add('closing')
    button.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', onOutside)
    window.removeEventListener('resize', place)
    afterExit(node, () => { node.remove(); pop = null; closing = false })
  }

  function onOutside (e) {
    if (pop && !pop.contains(e.target) && !button.contains(e.target)) close()
  }

  button.addEventListener('click', () => pop ? close() : open())
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pop) { e.stopImmediatePropagation(); close() }
  }, true)

  return { open, close, save, get isOpen () { return !!pop } }
}
