import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * nmap trae dos bases de datos excelentes en texto plano. Si está instalado las
 * leemos directo — 30.000 fabricantes y la frecuencia real de cada puerto, gratis.
 * Si no está, caemos a un puñado embebido: la app sigue funcionando, con menos detalle.
 */
export const NMAP_DIRS = [
  'C:\\Program Files (x86)\\Nmap',
  'C:\\Program Files\\Nmap',
  '/usr/share/nmap',
  '/usr/local/share/nmap'
]

function findDataFile (name) {
  for (const dir of NMAP_DIRS) {
    const p = join(dir, name)
    if (existsSync(p)) return p
  }
  return null
}

/* ── Fabricantes (OUI) ──────────────────────────────────────────────────── */

const FALLBACK_OUI = {
  '001A11': 'Google', '3C5AB4': 'Google', 'F4F5D8': 'Google',
  'B827EB': 'Raspberry Pi', 'DCA632': 'Raspberry Pi', 'E45F01': 'Raspberry Pi',
  '2462AB': 'Espressif', '240AC4': 'Espressif', '3C6105': 'Espressif',
  '7CDFA1': 'Espressif', 'A4CF12': 'Espressif', 'C8C9A3': 'Espressif',
  '001132': 'Synology', '0011D8': 'ASUSTek', '1C872C': 'ASUSTek',
  'AC84C6': 'TP-Link', '5C6291': 'TP-Link', 'B0BE76': 'TP-Link',
  '0018E7': 'Cameo/Netgear', '2C3033': 'Netgear', '9C3DCF': 'Netgear',
  '001DD8': 'Microsoft', '00155D': 'Microsoft (Hyper-V)', '7CED8D': 'Microsoft',
  '080027': 'VirtualBox', '000C29': 'VMware', '005056': 'VMware',
  '3C0754': 'Apple', 'A45E60': 'Apple', 'F0189E': 'Apple',
  'F8E61A': 'Samsung', '8425DB': 'Samsung', 'C81EE7': 'Samsung',
  '00E04C': 'Realtek', '001E58': 'D-Link', '00248C': 'ASRock'
}

/** Nuestra base propia, generada con `npm run oui` desde los registros del IEEE. */
const OWN_OUI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'oui.txt')

let ouiPromise = null

/**
 * Se cachea la PROMESA, no el Map ya construido.
 *
 * No es un detalle de estilo: el enriquecimiento consulta fabricantes con dos docenas
 * de tareas en paralelo. Si se cachea el Map y se lo asigna antes de terminar de leer
 * el archivo, la primera llamada espera la carga completa y todas las demás encuentran
 * la variable ya asignada — con la base a medio llenar — y se van con eso. El síntoma
 * es desconcertante: un dispositivo se identifica bien y el resto no.
 */
export function loadOui () {
  if (!ouiPromise) ouiPromise = buildOuiMap()
  return ouiPromise
}

/**
 * Tres capas, de menos a más confiable: primero el puñado embebido, encima lo que
 * traiga nmap si está instalado, y encima de todo nuestra base del IEEE — que es la
 * más completa y la única que se puede actualizar sin reinstalar nada.
 */
async function buildOuiMap () {
  const ouiMap = new Map(Object.entries(FALLBACK_OUI))

  const nmapFile = findDataFile('nmap-mac-prefixes')
  if (nmapFile) {
    try {
      const text = await readFile(nmapFile, 'utf8')
      for (const line of text.split('\n')) {
        if (!line || line[0] === '#') continue
        const sp = line.indexOf(' ')
        if (sp !== 6) continue
        ouiMap.set(line.slice(0, 6).toUpperCase(), line.slice(sp + 1).trim())
      }
    } catch { /* seguimos con lo que haya */ }
  }

  if (existsSync(OWN_OUI)) {
    try {
      const text = await readFile(OWN_OUI, 'utf8')
      for (const line of text.split('\n')) {
        if (!line || line[0] === '#') continue
        const tab = line.indexOf('\t')
        if (tab < 6) continue
        ouiMap.set(line.slice(0, tab).toUpperCase(), line.slice(tab + 1).trim())
      }
    } catch { /* seguimos con lo que haya */ }
  }

  return ouiMap
}

/**
 * Una MAC con el bit "administrada localmente" encendido no fue asignada por
 * ningún fabricante: es una MAC aleatoria que el aparato inventó para no ser
 * rastreable entre redes. Android e iOS lo hacen por defecto desde hace años.
 *
 * Buscarla en la base OUI no tiene sentido, y decir "fabricante desconocido"
 * sería engañoso: lo honesto es decir que es aleatoria a propósito.
 */
export function isRandomMac (mac) {
  if (!mac) return false
  const firstOctet = parseInt(mac.replace(/[:-]/g, '').slice(0, 2), 16)
  return Number.isFinite(firstOctet) && (firstOctet & 0b10) !== 0
}

export async function vendorOf (mac) {
  if (!mac) return null
  if (isRandomMac(mac)) return null

  const map = await loadOui()
  const hex = mac.replace(/[:-]/g, '').toUpperCase()

  // De más específico a más general: un bloque MA-S (9 dígitos) pertenece a una
  // empresa chica que comparte los primeros 6 con el mayorista que se lo vendió.
  // Buscar al revés devolvería siempre al mayorista, que no es quien fabricó esto.
  return map.get(hex.slice(0, 9)) ||
         map.get(hex.slice(0, 7)) ||
         map.get(hex.slice(0, 6)) ||
         null
}

/** Qué contarle al usuario sobre el fabricante, incluido el caso "no se puede saber". */
export async function vendorInfo (mac) {
  if (!mac) return { vendor: null, vendorNote: null }
  if (isRandomMac(mac)) {
    return {
      vendor: null,
      vendorNote: 'MAC aleatoria — el aparato oculta su fabricante a propósito (privacidad)'
    }
  }
  const vendor = await vendorOf(mac)
  return {
    vendor,
    vendorNote: vendor ? null : 'Prefijo no encontrado en la base de fabricantes'
  }
}

/* ── Servicios y su frecuencia real ─────────────────────────────────────── */

const FALLBACK_SERVICES = [
  [80, 'http', 0.484], [23, 'telnet', 0.221], [443, 'https', 0.209],
  [21, 'ftp', 0.198], [22, 'ssh', 0.182], [3389, 'ms-wbt-server', 0.083],
  [445, 'microsoft-ds', 0.056], [139, 'netbios-ssn', 0.051], [8080, 'http-proxy', 0.043],
  [53, 'domain', 0.039], [135, 'msrpc', 0.032], [3306, 'mysql', 0.024],
  [8443, 'https-alt', 0.023], [5900, 'vnc', 0.023], [1900, 'upnp', 0.019],
  [631, 'ipp', 0.018], [515, 'printer', 0.016], [9100, 'jetdirect', 0.015],
  [554, 'rtsp', 0.014], [8000, 'http-alt', 0.012], [5000, 'upnp', 0.011],
  [548, 'afp', 0.010], [111, 'rpcbind', 0.010], [5353, 'mdns', 0.009],
  [1883, 'mqtt', 0.005], [6379, 'redis', 0.004], [5432, 'postgresql', 0.004],
  [27017, 'mongod', 0.003], [11434, 'ollama', 0.001], [1234, 'lmstudio', 0.001]
]

let servicesPromise = null

/** Lista de puertos TCP ordenada por qué tan seguido aparecen abiertos en el mundo real. */
export function loadServices () {
  if (!servicesPromise) servicesPromise = buildServices()
  return servicesPromise
}

async function buildServices () {
  const file = findDataFile('nmap-services')
  if (file) {
    try {
      const text = await readFile(file, 'utf8')
      const rows = []
      for (const line of text.split('\n')) {
        if (!line || line[0] === '#') continue
        const [name, portProto, freq] = line.split('\t')
        if (!portProto?.endsWith('/tcp')) continue
        const port = parseInt(portProto, 10)
        if (!port) continue
        rows.push({ port, name, freq: parseFloat(freq) || 0 })
      }
      if (rows.length) {
        rows.sort((a, b) => b.freq - a.freq)
        return rows
      }
    } catch { /* fallback */ }
  }

  return FALLBACK_SERVICES.map(([port, name, freq]) => ({ port, name, freq }))
}

/** Los N puertos TCP más comunes — el mismo criterio que usa `nmap --top-ports N`. */
export async function topPorts (n) {
  const rows = await loadServices()
  return rows.slice(0, n).map(r => r.port)
}

export async function serviceName (port) {
  const rows = await loadServices()
  return rows.find(r => r.port === port)?.name || null
}
