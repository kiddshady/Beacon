import { createSocket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { XMLParser } from 'fast-xml-parser'

/**
 * SSDP / UPnP: los aparatos que se presentan solos.
 *
 * Un M-SEARCH por multicast y cada tele, reproductor, router, NAS o impresora
 * con UPnP contesta con la URL de su ficha XML. En esa ficha está el nombre que
 * le puso la persona ("Living Room TV", "Chromecast del living") y el modelo,
 * que es mucho más que "Reproductor Google". Los aparatos de Tuya y compañía
 * no hablan UPnP: a esos hay que seguir bautizándolos a mano.
 *
 * Se escucha un par de segundos, se bajan las fichas en paralelo, y se devuelve
 * un mapa por IP. Todo es best-effort: un aparato que no contesta no es un error.
 */

const SSDP_ADDR = '239.255.255.250'
const SSDP_PORT = 1900
const FETCH_TIMEOUT = 1500

const M_SEARCH = [
  'M-SEARCH * HTTP/1.1',
  `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
  'MAN: "ssdp:discover"',
  'MX: 2',
  'ST: ssdp:all',
  '', ''
].join('\r\n')

function parseHeaders (text) {
  const out = {}
  for (const line of text.split(/\r?\n/).slice(1)) {
    const i = line.indexOf(':')
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  }
  return out
}

/** Las direcciones IPv4 propias: el M-SEARCH sale por cada una, no solo por la "default". */
function localAddresses () {
  return Object.values(networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal)
    .map(a => a.address)
}

/**
 * Manda el M-SEARCH y escucha: por IP, la URL de la ficha y el SERVER.
 *
 * Sale por multicast desde cada interfaz (con VirtualBox, WSL o Tailscale
 * dando vueltas, el "default" de Windows puede no ser la LAN) y además por
 * unicast a cada `target`: muchos aparatos contestan un M-SEARCH directo aunque
 * el multicast no les llegue. `port` existe para poder probar con un aparato
 * falso en otro puerto.
 */
export function ssdpSearch ({ timeout = 2500, port = SSDP_PORT, targets = [], ifaces = localAddresses() } = {}) {
  return new Promise(resolve => {
    const found = new Map()
    const socks = []
    let settled = false
    let pending = ifaces.length

    const finish = () => {
      if (settled) return
      settled = true
      for (const s of socks) { try { s.close() } catch { /* ya cerrado */ } }
      resolve(found)
    }
    const timer = setTimeout(finish, timeout)

    const onMessage = (msg, rinfo) => {
      const h = parseHeaders(msg.toString('utf8'))
      if (!h.location) return
      const prev = found.get(rinfo.address)
      // Un aparato contesta varias veces (una por servicio): con una ficha alcanza,
      // y se prefiere la raíz, que es la que tiene el nombre.
      const isRoot = /rootdevice/i.test(h.st || '') || /rootdevice/i.test(h.usn || '')
      if (!prev || (isRoot && !prev.isRoot)) {
        found.set(rinfo.address, { location: h.location, server: h.server || null, usn: h.usn || null, isRoot })
      }
    }

    const oneLess = () => { if (--pending <= 0 && !socks.length) { clearTimeout(timer); finish() } }

    if (!ifaces.length) { clearTimeout(timer); return finish() }

    for (const addr of ifaces) {
      const sock = createSocket({ type: 'udp4', reuseAddr: true })
      sock.on('message', onMessage)
      sock.once('error', () => { try { sock.close() } catch { /* nada */ } oneLess() })
      sock.bind(0, addr, () => {
        socks.push(sock)
        try {
          sock.setMulticastInterface(addr)
          sock.setMulticastTTL(2)
          sock.send(M_SEARCH, port, SSDP_ADDR, () => {})
          for (const t of targets) sock.send(M_SEARCH, port, t, () => {})
        } catch { /* una interfaz que no deja multicast: seguimos con las otras */ }
      })
    }
  })
}

const xml = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true })

/** Baja y lee la ficha: nombre amigable, modelo, fabricante, tipo. */
export async function fetchDescription (location) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
  try {
    const res = await fetch(location, { signal: ctrl.signal, headers: { accept: 'text/xml, application/xml' } })
    if (!res.ok) return null
    const text = await res.text()
    const doc = xml.parse(text)
    // La ficha raíz tiene <root><device>…; a veces el device viene envuelto de más.
    let device = doc?.root?.device || doc?.device || null
    if (!device) return null
    if (Array.isArray(device)) device = device[0]

    const clean = (v) => (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim() : null
    const deviceType = clean(device.deviceType)
    return {
      friendlyName: clean(device.friendlyName),
      modelName: clean(device.modelName),
      modelNumber: clean(device.modelNumber),
      manufacturer: clean(device.manufacturer),
      // "urn:schemas-upnp-org:device:MediaRenderer:1" → "MediaRenderer"
      deviceType: deviceType ? (deviceType.split(':').slice(-2, -1)[0] || deviceType) : null
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Todo junto: busca, baja las fichas en paralelo y devuelve ip → descripción.
 * Los que contestaron SSDP pero no dieron ficha igual figuran, con lo poco que
 * dijeron en el header (SERVER suele nombrar el sistema: "Linux/4.9 UPnP/1.0 …").
 */
export async function discoverUPnP ({ timeout = 2500, targets = [], port, ifaces } = {}) {
  const hits = await ssdpSearch({ timeout, targets, port, ifaces })
  const out = new Map()
  await Promise.all([...hits].map(async ([ip, hit]) => {
    const desc = await fetchDescription(hit.location)
    out.set(ip, { ...(desc || {}), server: hit.server, location: hit.location })
  }))
  return out
}
