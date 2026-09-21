import { networkInterfaces } from 'node:os'

/** Un /22 son 1024 hosts: más que eso no se barre entero, se mira lo que ya se conoce. */
const SWEEPABLE_MIN_PREFIX = 22

/** Nombres humanos para las interfaces que uno reconoce de vista. */
function humanize (name, cidr) {
  const n = name.toLowerCase()
  if (n.includes('tailscale')) return { label: 'Tailscale', kind: 'mesh' }
  if (n.includes('wsl') || n.includes('hyper-v')) return { label: 'WSL', kind: 'virtual' }
  if (n.includes('virtualbox') || cidr.startsWith('192.168.56.')) return { label: 'VirtualBox', kind: 'virtual' }
  if (n.includes('vmware')) return { label: 'VMware', kind: 'virtual' }
  if (n.includes('npcap') || n.includes('loopback')) return { label: 'Loopback', kind: 'virtual' }
  if (n.includes('wi-fi') || n.includes('wifi') || n.includes('wlan')) return { label: 'Wi-Fi', kind: 'lan' }
  if (n.includes('ethernet') || n.includes('eth')) return { label: 'Ethernet', kind: 'lan' }
  return { label: name, kind: 'other' }
}

function prefixFromMask (mask) {
  return mask.split('.')
    .map(o => (parseInt(o, 10) >>> 0).toString(2).replace(/0/g, '').length)
    .reduce((a, b) => a + b, 0)
}

export function ipToInt (ip) {
  return ip.split('.').reduce((acc, o) => ((acc << 8) + parseInt(o, 10)) >>> 0, 0) >>> 0
}

export function intToIp (n) {
  return [24, 16, 8, 0].map(s => (n >>> s) & 255).join('.')
}

/** Todas las IPs utilizables de la subred, sin la de red ni la de broadcast. */
export function hostsOf (network, prefix) {
  const base = ipToInt(network) & (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0)
  const count = 2 ** (32 - prefix)
  const out = []
  // /31 y /32 son punto a punto: la única dirección es un host válido.
  const [from, to] = prefix >= 31 ? [0, count - 1] : [1, count - 2]
  for (let i = from; i <= to; i++) out.push(intToIp((base + i) >>> 0))
  return out
}

/**
 * Las redes que Beacon puede mirar, ya ordenadas: primero la LAN de verdad.
 * `sweepable: false` marca las que son demasiado grandes (o punto a punto) para
 * barrer host por host — de esas solo mostramos los vecinos ya conocidos.
 */
export async function listScopes () {
  const scopes = []

  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue

      const prefix = prefixFromMask(a.netmask)
      const netInt = ipToInt(a.address) & ((0xffffffff << (32 - prefix)) >>> 0)
      const network = intToIp(netInt >>> 0)
      const { label, kind } = humanize(name, a.address)

      scopes.push({
        id: `${name}::${a.address}`,
        iface: name,
        label,
        kind,
        address: a.address,
        mac: a.mac && a.mac !== '00:00:00:00:00:00' ? a.mac.toUpperCase() : null,
        netmask: a.netmask,
        prefix,
        network,
        cidr: `${network}/${prefix}`,
        hostCount: prefix >= 31 ? 1 : 2 ** (32 - prefix) - 2,
        gateway: prefix < 31 ? intToIp((netInt + 1) >>> 0) : null,
        sweepable: prefix >= SWEEPABLE_MIN_PREFIX && prefix < 31
      })
    }
  }

  const rank = { lan: 0, mesh: 1, virtual: 2, other: 3 }
  return scopes.sort((a, b) =>
    (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) || a.prefix - b.prefix
  )
}
