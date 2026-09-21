import { execFile } from 'node:child_process'
import { knock } from './probe.js'

/**
 * Ping en vivo para el detalle de un host.
 *
 * ICMP crudo necesita admin en Node, pero `ping.exe` no: Windows lo hace por
 * nosotros. Se lanza uno por segundo y se lee el tiempo de la respuesta, en el
 * idioma que sea ("tiempo=2ms", "time=2ms", "time<1ms" — y el "tiempo<1m" sin
 * la ese del Windows en castellano). Si ping no está o falla, se cae al knock
 * TCP del motor: un RST también mide ida y vuelta.
 *
 * Un solo host a la vez. Cambiar de host o cerrar el detalle detiene el anterior.
 */

const PERIOD_MS = 1000
const TIMEOUT_MS = 1000
const RTT = /(?:time|tiempo)\s*([=<])\s*(\d+)\s*ms?/i

let pingBroken = false

function pingExe (ip) {
  return new Promise(resolve => {
    const args = process.platform === 'win32'
      ? ['-n', '1', '-w', String(TIMEOUT_MS), ip]
      : ['-c', '1', '-W', String(Math.ceil(TIMEOUT_MS / 1000)), ip]
    execFile('ping', args, { windowsHide: true, timeout: TIMEOUT_MS + 1500 }, (err, stdout) => {
      if (err && err.code === 'ENOENT') { pingBroken = true; return resolve(undefined) }
      const m = RTT.exec(stdout || '')
      if (!m) return resolve(null)
      resolve(m[1] === '<' ? 0 : Number(m[2]))
    })
  })
}

async function knockOnce (ip, port) {
  const r = await knock(ip, port, TIMEOUT_MS)
  return r.state === 'open' || r.state === 'refused' ? r.ms : null
}

/** Una medición: milisegundos, o null si no contestó. */
export async function pingOnce (ip, port = 80) {
  if (!pingBroken) {
    const ms = await pingExe(ip)
    if (ms !== undefined) return ms
  }
  return knockOnce(ip, port)
}

export function createPinger (send) {
  let current = null
  let timer = null
  let busy = false

  async function beat () {
    if (!current || busy) return
    busy = true
    const { ip, port } = current
    const at = Date.now()
    const ms = await pingOnce(ip, port)
    busy = false
    // Si mientras tanto cambió el host, esta muestra ya no es de nadie.
    if (current?.ip === ip) send({ ip, ms, at })
  }

  return {
    start (ip, port) {
      this.stop()
      current = { ip, port: port || 80 }
      beat()
      timer = setInterval(beat, PERIOD_MS)
    },
    stop () {
      clearInterval(timer)
      timer = null
      current = null
    },
    get ip () { return current?.ip || null }
  }
}
