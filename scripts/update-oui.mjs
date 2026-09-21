/**
 * Baja el registro de fabricantes del IEEE y lo convierte al formato compacto que
 * usa Beacon.
 *
 *   node scripts/update-oui.mjs
 *
 * El IEEE publica tres registros según el tamaño del bloque asignado:
 *   MA-L (24 bits) — el clásico, bloques grandes: 3 octetos identifican al fabricante
 *   MA-M (28 bits) — bloques medianos, hacen falta 7 dígitos hex
 *   MA-S (36 bits) — bloques chicos, hacen falta 9
 *
 * Con los tres se identifican también los fabricantes pequeños, que son justo los
 * que la base de nmap 7.80 no tenía.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const SOURCES = [
  { url: 'https://standards-oui.ieee.org/oui/oui.csv',     digits: 6, name: 'MA-L' },
  { url: 'https://standards-oui.ieee.org/oui28/mam.csv',   digits: 7, name: 'MA-M' },
  { url: 'https://standards-oui.ieee.org/oui36/oui36.csv', digits: 9, name: 'MA-S' }
]

/**
 * Descarga con curl forzando IPv4. No es capricho: en esta red el router anuncia
 * IPv6 que el ISP no rutea, y cualquier cliente que lo intente primero se queda
 * colgado ~63 segundos antes de caer a IPv4.
 */
async function download (url) {
  const { stdout } = await run('curl.exe',
    ['-4', '-s', '--fail', '--max-time', '180', url],
    { maxBuffer: 64 << 20, windowsHide: true })
  return stdout
}

/** Parser de CSV mínimo pero correcto: los nombres de empresa traen comas y comillas. */
function parseCsvLine (line) {
  const out = []
  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++ }  // comilla escapada
        else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(field); field = '' }
    else field += c
  }
  out.push(field)
  return out
}

/** Limpia el nombre: el registro trae mayúsculas gritadas, sufijos legales y espacios raros. */
function tidy (name) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/[.,]?\s*(Co\.?,?\s*)?(Ltd|Limited|Inc|LLC|GmbH|S\.?A\.?|B\.?V\.?|Corp(oration)?|Company|Technologies|Technology)\.?$/i, '')
    .trim() || name.trim()
}

const entries = new Map()
let totals = []

for (const src of SOURCES) {
  process.stdout.write(`  bajando ${src.name}… `)
  let csv
  try {
    csv = await download(src.url)
  } catch (err) {
    console.log(`falló (${err.message.split('\n')[0]})`)
    continue
  }

  let added = 0
  for (const line of csv.split('\n')) {
    if (!line || line.startsWith('Registry,')) continue
    const [, assignment, org] = parseCsvLine(line)
    if (!assignment || !org) continue

    const prefix = assignment.trim().toUpperCase()
    if (prefix.length !== src.digits) continue

    const name = tidy(org)
    if (!name || /^private$/i.test(name)) continue

    entries.set(prefix, name)
    added++
  }

  console.log(`${added.toLocaleString('es')} prefijos`)
  totals.push(`${src.name}: ${added}`)
}

if (!entries.size) {
  console.error('\nNo se pudo bajar ningún registro. ¿Hay conexión?')
  process.exit(1)
}

// Orden por prefijo: el archivo queda estable entre corridas y los diffs son legibles.
const sorted = [...entries].sort((a, b) => a[0].localeCompare(b[0]))
const stamp = new Date().toISOString().slice(0, 10)

const body = [
  `# Base de fabricantes de Beacon — generada el ${stamp}`,
  '# Fuente: registros MA-L / MA-M / MA-S del IEEE (standards-oui.ieee.org)',
  `# ${totals.join(' · ')}`,
  '# Formato: PREFIJO<TAB>Fabricante  (el prefijo puede tener 6, 7 o 9 dígitos hex)',
  ...sorted.map(([prefix, name]) => `${prefix}\t${name}`)
].join('\n')

await mkdir(join(ROOT, 'data'), { recursive: true })
await writeFile(join(ROOT, 'data', 'oui.txt'), body, 'utf8')

console.log(`\n  ${entries.size.toLocaleString('es')} fabricantes → data/oui.txt`)
