import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** IP seguida de MAC en cualquier separador. Parsea así sin importar el idioma de Windows. */
const ROW = /(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}(?:[-:][0-9a-f]{2}){5})\s+(\S+)/gi

const MULTICAST_OR_BROADCAST = /^(?:224\.|239\.|255\.|0\.)/

/**
 * La tabla ARP del sistema: quién le contestó a esta máquina a nivel de enlace.
 *
 * Es la mitad silenciosa del descubrimiento. Un host puede rechazar todos los puertos
 * y aun así responder ARP — con lo cual sigue apareciendo acá.
 */
export async function readArpTable () {
  let stdout = ''
  try {
    ({ stdout } = await run('arp', ['-a'], { windowsHide: true, maxBuffer: 4 << 20 }))
  } catch {
    return new Map()
  }

  const table = new Map()
  for (const m of stdout.matchAll(ROW)) {
    const ip = m[1]
    const mac = m[2].replace(/-/g, ':').toUpperCase()
    const type = /din|dyn/i.test(m[3]) ? 'dynamic' : 'static'

    if (MULTICAST_OR_BROADCAST.test(ip)) continue
    if (mac === 'FF:FF:FF:FF:FF:FF') continue
    // Las MAC multicast de IPv4 (01:00:5E:...) no son dispositivos.
    if (mac.startsWith('01:00:5E')) continue

    table.set(ip, { ip, mac, type })
  }
  return table
}
