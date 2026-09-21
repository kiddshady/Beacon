import dns from 'node:dns'
import { createSocket } from 'node:dgram'

const resolver = new dns.promises.Resolver()
resolver.setServers(dns.getServers())

/* ── DNS inverso ────────────────────────────────────────────────────────── */

export async function reverseDns (ip, timeout = 900) {
  try {
    const names = await Promise.race([
      resolver.reverse(ip),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout))
    ])
    return names?.[0] || null
  } catch {
    return null
  }
}

/* ── NetBIOS (así se presentan las máquinas Windows) ────────────────────── */

/** Consulta NBSTAT: "decime todos los nombres que tenés registrados". */
const NBSTAT_QUERY = Buffer.from([
  0x00, 0x00,             // transaction id
  0x00, 0x10,             // flags: broadcast
  0x00, 0x01,             // 1 pregunta
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x20, 0x43, 0x4b,       // nombre codificado "*" -> CK AA AA...
  ...Array(30).fill(0x41),
  0x00,
  0x00, 0x21,             // tipo NBSTAT
  0x00, 0x01              // clase IN
])

export function netbiosName (ip, timeout = 700) {
  return new Promise(resolve => {
    const sock = createSocket({ type: 'udp4', reuseAddr: true })
    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      try { sock.close() } catch { /* ya cerrado */ }
      resolve(value)
    }

    const timer = setTimeout(() => finish(null), timeout)

    sock.once('error', () => { clearTimeout(timer); finish(null) })

    sock.on('message', (msg) => {
      clearTimeout(timer)
      try {
        // Header 56 bytes + 1 byte con la cantidad de nombres; cada entrada son 18.
        const count = msg[56]
        for (let i = 0; i < count; i++) {
          const off = 57 + i * 18
          const name = msg.toString('ascii', off, off + 15).trim()
          const suffix = msg[off + 15]
          const flags = msg.readUInt16BE(off + 16)
          const isGroup = (flags & 0x8000) !== 0
          // Sufijo 0x00 y no-grupo = el nombre propio de la máquina.
          if (suffix === 0x00 && !isGroup && name) return finish(name)
        }
      } catch { /* respuesta rara, la ignoramos */ }
      finish(null)
    })

    try {
      sock.send(NBSTAT_QUERY, 137, ip, (err) => { if (err) { clearTimeout(timer); finish(null) } })
    } catch {
      clearTimeout(timer)
      finish(null)
    }
  })
}

/* ── mDNS inverso (Chromecast, impresoras, Apple, ESPHome) ──────────────── */

function encodeDnsName (name) {
  const parts = name.split('.').filter(Boolean)
  const bufs = parts.map(p => Buffer.concat([Buffer.from([p.length]), Buffer.from(p, 'ascii')]))
  return Buffer.concat([...bufs, Buffer.from([0])])
}

function decodeDnsName (msg, offset) {
  const labels = []
  let jumped = false
  let safety = 0

  while (safety++ < 128) {
    const len = msg[offset]
    if (len === undefined || len === 0) { if (!jumped) offset++; break }
    // Puntero de compresión: los dos bits altos en 1.
    if ((len & 0xc0) === 0xc0) {
      const ptr = ((len & 0x3f) << 8) | msg[offset + 1]
      if (!jumped) offset += 2
      offset = ptr
      jumped = true
      continue
    }
    labels.push(msg.toString('utf8', offset + 1, offset + 1 + len))
    offset += len + 1
  }
  return labels.join('.')
}

/** Pregunta por multicast "¿quién es esta IP?" y escucha el nombre .local. */
export function mdnsName (ip, timeout = 900) {
  return new Promise(resolve => {
    const qname = `${ip.split('.').reverse().join('.')}.in-addr.arpa`
    const query = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
      encodeDnsName(qname),
      Buffer.from([0x00, 0x0c, 0x00, 0x01]) // PTR, IN
    ])

    const sock = createSocket({ type: 'udp4', reuseAddr: true })
    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      try { sock.close() } catch { /* ya cerrado */ }
      resolve(value)
    }

    const timer = setTimeout(() => finish(null), timeout)
    sock.once('error', () => { clearTimeout(timer); finish(null) })

    sock.on('message', (msg) => {
      try {
        if (msg.readUInt16BE(6) === 0) return // sin respuestas, seguimos escuchando
        let off = 12
        // Saltear la pregunta que nos devuelven de vuelta.
        while (msg[off] !== 0 && (msg[off] & 0xc0) !== 0xc0 && off < msg.length) off += msg[off] + 1
        off += (msg[off] & 0xc0) === 0xc0 ? 2 : 1
        off += 4
        // Y ahora la respuesta: nombre, tipo, clase, ttl, longitud, datos.
        while (msg[off] !== 0 && (msg[off] & 0xc0) !== 0xc0 && off < msg.length) off += msg[off] + 1
        off += (msg[off] & 0xc0) === 0xc0 ? 2 : 1
        const type = msg.readUInt16BE(off)
        off += 8
        const rdlen = msg.readUInt16BE(off)
        off += 2
        if (type === 0x0c && rdlen > 0) {
          const name = decodeDnsName(msg, off)
          if (name) { clearTimeout(timer); return finish(name.replace(/\.$/, '')) }
        }
      } catch { /* paquete que no entendemos */ }
    })

    sock.bind(0, () => {
      try {
        sock.setMulticastTTL(255)
        sock.send(query, 5353, '224.0.0.251', (err) => {
          if (err) { clearTimeout(timer); finish(null) }
        })
      } catch {
        clearTimeout(timer)
        finish(null)
      }
    })
  })
}

/**
 * Muchos routers domésticos responden el PTR con la IP misma ("192.168.1.3"), o
 * con la IP más un dominio pegado. Eso no es un nombre: es ruido que taparía al
 * nombre bueno que sí devolvieron mDNS o NetBIOS.
 */
export function isJunkName (name, ip) {
  if (!name) return true
  const clean = name.trim().replace(/\.$/, '')
  if (!clean || clean === ip) return true
  if (clean.startsWith(`${ip}.`)) return true
  // Sin una sola letra, no es un nombre: es la dirección disfrazada.
  if (!/[a-z]/i.test(clean)) return true
  return false
}

/**
 * El mejor nombre que se pueda conseguir, preguntando por los tres caminos a la vez
 * y quedándose con el primero que sirva de verdad.
 */
export async function resolveName (ip) {
  const [rdns, nb, mdns] = await Promise.all([
    reverseDns(ip).catch(() => null),
    netbiosName(ip).catch(() => null),
    mdnsName(ip).catch(() => null)
  ])

  const candidates = [
    { name: mdns, source: 'mDNS' },
    { name: nb, source: 'NetBIOS' },
    { name: rdns, source: 'DNS' }
  ]

  const hit = candidates.find(c => !isJunkName(c.name, ip))
  if (!hit) return { name: null, nameSource: null }

  return {
    name: hit.name.trim().replace(/\.$/, '').replace(/\.local$/i, ''),
    nameSource: hit.source
  }
}
