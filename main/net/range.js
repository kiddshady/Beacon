import { ipToInt, intToIp, hostsOf } from './interfaces.js'

/**
 * Un rango escrito a mano, convertido en un scope que el scanner entiende.
 *
 * Acepta lo que uno escribiría sin pensar:
 *   10.0.0.0/24            una subred
 *   192.168.1.1-50         del .1 al .50 (último octeto)
 *   192.168.1.1-192.168.2.20   de una IP a otra
 *   192.168.1.7            una sola
 *
 * El tope es /20 (4096 direcciones): el barrido toca seis puertos por IP y con
 * más que eso deja de ser "un par de segundos". Si el rango cae adentro de una
 * red local conocida, se hereda su interfaz para que "Esta máquina" y el router
 * se sigan reconociendo.
 */

const MAX_HOSTS = 4096
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IP = `${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}`
const RE_CIDR = new RegExp(`^(${IP})/(\\d{1,2})$`)
const RE_SPAN = new RegExp(`^(${IP})-(${IP})$`)
const RE_LAST = new RegExp(`^(${IP})-(${OCTET})$`)
const RE_ONE = new RegExp(`^(${IP})$`)

export function parseRange (input, localScopes = []) {
  const text = String(input || '').trim().replace(/\s+/g, '')
  if (!text) throw new Error('Escribí una subred (10.0.0.0/24), un rango (192.168.1.1-50) o una IP.')

  let start, end, network = null, prefix = null, label
  let m

  if ((m = RE_CIDR.exec(text))) {
    prefix = Number(m[2])
    if (prefix < 0 || prefix > 32) throw new Error(`El prefijo /${m[2]} no existe: va de /0 a /32.`)
    const net = (ipToInt(m[1]) & (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0)) >>> 0
    network = intToIp(net)
    if (prefix >= 31) { start = net; end = prefix === 32 ? net : (net + 1) >>> 0 } else { start = (net + 1) >>> 0; end = (net + 2 ** (32 - prefix) - 2) >>> 0 }
    label = `${network}/${prefix}`
  } else if ((m = RE_SPAN.exec(text))) {
    start = ipToInt(m[1]); end = ipToInt(m[2])
    label = text
  } else if ((m = RE_LAST.exec(text))) {
    start = ipToInt(m[1])
    end = ((start & 0xffffff00) >>> 0) + Number(m[2])
    label = text
  } else if ((m = RE_ONE.exec(text))) {
    start = end = ipToInt(m[1])
    label = text
  } else {
    throw new Error(`No entiendo «${text}». Probá 10.0.0.0/24, 192.168.1.1-50 o una IP.`)
  }

  if (end < start) throw new Error('El rango está al revés: el final es menor que el inicio.')
  const hostCount = end - start + 1
  if (hostCount > MAX_HOSTS) {
    throw new Error(`Son ${hostCount.toLocaleString('es')} direcciones y el tope es ${MAX_HOSTS.toLocaleString('es')} (un /20). Achicá el rango.`)
  }

  // ¿Cae adentro de una red local? Entonces se hereda la interfaz: así "Esta
  // máquina" y el router se reconocen, y la MAC propia también.
  const home = localScopes.find(s => {
    if (!s.network || s.prefix == null || s.prefix === 0) return false
    const mask = (0xffffffff << (32 - s.prefix)) >>> 0
    const net = (ipToInt(s.network) & mask) >>> 0
    return ((start & mask) >>> 0) === net && ((end & mask) >>> 0) === net
  })

  // Lo que nmap entiende: CIDR tal cual; rango del último octeto tal cual; el
  // resto se le pasa como lista de IPs (para lo que hace falta, ya alcanza).
  const ips = network && prefix != null ? hostsOf(network, prefix) : Array.from({ length: hostCount }, (_, i) => intToIp((start + i) >>> 0))
  const nmapTarget = network ? label : RE_LAST.test(text) || start === end ? label : ips.join(' ')

  return {
    id: `custom::${label}`,
    iface: home ? home.iface : 'A mano',
    label: 'A mano',
    kind: 'custom',
    custom: true,
    text: label,
    address: home?.address || null,
    mac: home?.mac || null,
    netmask: home?.netmask || null,
    prefix,
    network,
    cidr: label,
    nmapTarget,
    range: { start, end },
    ips,
    hostCount,
    gateway: home?.gateway || null,
    sweepable: true
  }
}
