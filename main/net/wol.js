import { createSocket } from 'node:dgram'

/**
 * Wake-on-LAN: el "paquete mágico".
 *
 * Seis bytes 0xFF y después la MAC del aparato dieciséis veces, por UDP a la
 * dirección de broadcast. La placa de red lo reconoce aunque la máquina esté
 * apagada (si el BIOS y la placa tienen WoL habilitado — eso ya no depende de
 * nosotros). Se manda al broadcast de la subred y al general, porque según el
 * router uno de los dos no llega.
 */

const PORT = 9

export function parseMac (mac) {
  const hex = String(mac || '').replace(/[^0-9a-f]/gi, '')
  if (hex.length !== 12) throw new Error(`MAC inválida: ${mac}`)
  return Buffer.from(hex, 'hex')
}

export function magicPacket (mac) {
  const bytes = parseMac(mac)
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => bytes)])
}

/** El broadcast de una subred: la red con los bits de host en 1. */
export function broadcastOf (network, prefix) {
  const n = network.split('.').reduce((a, o) => ((a << 8) + (+o)) >>> 0, 0) >>> 0
  const hostBits = 32 - prefix
  const b = (n | ((2 ** hostBits) - 1)) >>> 0
  return [24, 16, 8, 0].map(s => (b >>> s) & 255).join('.')
}

export function wake (mac, { network, prefix } = {}) {
  const packet = magicPacket(mac)
  const targets = ['255.255.255.255']
  if (network && prefix != null && prefix < 31) targets.unshift(broadcastOf(network, prefix))

  return new Promise((resolve, reject) => {
    const sock = createSocket('udp4')
    sock.once('error', (err) => { sock.close(); reject(err) })
    sock.bind(() => {
      sock.setBroadcast(true)
      let pending = targets.length
      const errors = []
      for (const host of targets) {
        sock.send(packet, 0, packet.length, PORT, host, (err) => {
          if (err) errors.push(`${host}: ${err.message}`)
          if (--pending === 0) {
            sock.close()
            if (errors.length === targets.length) reject(new Error(errors.join('; ')))
            else resolve({ mac, targets })
          }
        })
      }
    })
  })
}
