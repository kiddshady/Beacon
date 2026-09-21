import { Socket } from 'node:net'

/**
 * Golpea un puerto TCP y contesta si abrió, cuánto tardó, y si el host rechazó
 * activamente la conexión.
 *
 * Ese rechazo vale oro: un RST significa "acá hay alguien que dijo que no",
 * o sea el host está vivo aunque tenga todo cerrado.
 */
export function knock (ip, port, timeout = 700) {
  return new Promise(resolve => {
    const started = process.hrtime.bigint()
    const sock = new Socket()
    let settled = false

    const done = (state) => {
      if (settled) return
      settled = true
      const ms = Number(process.hrtime.bigint() - started) / 1e6
      sock.destroy()
      resolve({ ip, port, state, ms: Math.round(ms) })
    }

    sock.setTimeout(timeout)
    sock.once('connect', () => done('open'))
    sock.once('timeout', () => done('filtered'))
    sock.once('error', (err) => done(err.code === 'ECONNREFUSED' ? 'refused' : 'error'))

    try { sock.connect(port, ip) } catch { done('error') }
  })
}

/**
 * Corre `jobs` con un tope de tareas simultáneas, entregando cada resultado
 * apenas está listo. Sin esto un /24 abre miles de sockets de golpe y Windows
 * empieza a devolver ENOBUFS.
 */
export async function pool (jobs, limit, onResult, shouldStop = () => false) {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (next < jobs.length) {
      if (shouldStop()) return
      const job = jobs[next++]
      const result = await job()
      if (result !== undefined) onResult(result)
    }
  })
  await Promise.all(workers)
}
