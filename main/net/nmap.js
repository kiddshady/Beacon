import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'

import { NMAP_DIRS } from './data.js'

const run = promisify(execFile)

let cachedInfo = null

function findBinary () {
  if (process.platform === 'win32') {
    for (const dir of NMAP_DIRS) {
      const exe = join(dir, 'nmap.exe')
      if (existsSync(exe)) return exe
    }
    return 'nmap' // que lo resuelva el PATH
  }
  return 'nmap'
}

/** En Windows, `fltmc` falla sin privilegios elevados. Es el chequeo más barato que hay. */
async function isElevated () {
  if (process.platform !== 'win32') return process.getuid?.() === 0
  try {
    await run('fltmc', [], { windowsHide: true })
    return true
  } catch {
    return false
  }
}

export async function nmapInfo () {
  if (cachedInfo) return cachedInfo

  const bin = findBinary()
  const elevated = await isElevated()

  try {
    const { stdout } = await run(bin, ['--version'], { windowsHide: true, timeout: 5000 })
    const version = stdout.match(/Nmap version (\S+)/)?.[1] || null
    const major = version ? parseInt(version, 10) : 0
    const minor = version ? parseInt(version.split('.')[1] || '0', 10) : 0

    cachedInfo = {
      available: true,
      bin,
      version,
      elevated,
      // 7.80 es de 2019: anda perfecto, pero sus huellas de servicios están viejas.
      outdated: major < 7 || (major === 7 && minor < 90)
    }
  } catch {
    cachedInfo = { available: false, bin: null, version: null, elevated, outdated: false }
  }

  return cachedInfo
}

/**
 * El comando nmap equivalente al preset elegido, con cada flag explicada.
 * Es lo que se muestra en el panel inferior mientras tocás botones.
 */
export function buildCommand (preset, target) {
  if (!preset) return { full: '', parts: [], target: target || '' }

  const info = cachedInfo
  const parts = preset.nmapFlags.filter(f => !f.adminOnly || info?.elevated !== false)

  // Sin admin, nmap no puede hacer SYN scan ni detectar el SO: se avisa y se degrada.
  const degraded = preset.nmapFlags.filter(f => f.adminOnly && info?.elevated === false)
  if (degraded.length) {
    parts.unshift({ flag: '-sT', note: 'conexión TCP completa (sin admin no se puede -sS)' })
    parts.push({ flag: '-Pn', note: 'no hacer ping previo: sin admin puede dar falsos negativos' })
  }

  const full = ['nmap', ...parts.map(p => p.flag), target].filter(Boolean).join(' ')
  return { full, parts, target: target || '', degraded: degraded.map(d => d.flag) }
}

/* ── Ejecución con resultados en streaming ──────────────────────────────── */

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' })

function asArray (v) {
  return v == null ? [] : Array.isArray(v) ? v : [v]
}

function parseHostBlock (xml) {
  let doc
  try { doc = parser.parse(xml) } catch { return null }

  const host = doc?.host
  if (!host) return null

  const addresses = asArray(host.address)
  const ip = addresses.find(a => a['@addrtype'] === 'ipv4')?.['@addr']
  if (!ip) return null

  const mac = addresses.find(a => a['@addrtype'] === 'mac')
  const hostname = asArray(host.hostnames?.hostname)[0]?.['@name'] || null

  const ports = asArray(host.ports?.port)
    .filter(p => p.state?.['@state'] === 'open')
    .map(p => ({
      port: parseInt(p['@portid'], 10),
      protocol: p['@protocol'],
      service: p.service?.['@name'] || null,
      product: p.service?.['@product'] || null,
      version: p.service?.['@version'] || null
    }))

  const osMatch = asArray(host.os?.osmatch)[0]

  return {
    ip,
    mac: mac?.['@addr']?.toUpperCase() || null,
    vendor: mac?.['@vendor'] || null,
    name: hostname,
    ports,
    os: osMatch ? { name: osMatch['@name'], accuracy: parseInt(osMatch['@accuracy'], 10) } : null,
    latency: host.times?.['@srtt'] ? Math.round(parseInt(host.times['@srtt'], 10) / 1000) : null
  }
}

/**
 * Corre nmap y va entregando cada host apenas nmap termina con él.
 *
 * nmap cierra un bloque `<host>` en cuanto lo resuelve, así que se puede ir cortando
 * el XML por bloques completos en vez de esperar el documento entero.
 */
export function runNmap ({ bin, args, onHost, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    let buffer = ''
    let stderr = ''
    const hosts = []

    signal?.addEventListener('abort', () => child.kill(), { once: true })

    child.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8')

      let start, end
      while (
        (start = buffer.indexOf('<host ')) !== -1 &&
        (end = buffer.indexOf('</host>', start)) !== -1
      ) {
        const block = buffer.slice(start, end + 7)
        buffer = buffer.slice(end + 7)

        const host = parseHostBlock(block)
        if (host) { hosts.push(host); onHost?.(host) }
      }

      const pct = buffer.match(/percent="([\d.]+)"/)
      if (pct) onProgress?.(parseFloat(pct[1]))
    })

    child.stderr.on('data', c => { stderr += c.toString('utf8') })

    child.once('error', reject)
    child.once('close', code => {
      if (code === 0 || hosts.length) resolve(hosts)
      else reject(new Error(stderr.trim() || `nmap terminó con código ${code}`))
    })
  })
}
