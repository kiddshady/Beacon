/**
 * Prueba de humo del motor, sin Electron de por medio.
 *   node scripts/smoke.mjs           → descubrimiento rápido (preset "who")
 *   node scripts/smoke.mjs quick     → con escaneo de puertos
 */
import { listScopes } from '../main/net/interfaces.js'
import { Scanner } from '../main/net/scanner.js'
import { PRESETS } from '../main/net/presets.js'
import { nmapInfo } from '../main/net/nmap.js'
import { topPorts, vendorOf } from '../main/net/data.js'

const presetId = process.argv[2] || 'who'

const scopes = await listScopes()
console.log('\n── Redes detectadas ──')
for (const s of scopes) {
  console.log(`  ${s.sweepable ? '·' : ' '} ${s.label.padEnd(12)} ${s.cidr.padEnd(20)} ` +
    `gw=${s.gateway || '—'} ${s.sweepable ? `(${s.hostCount} hosts)` : '(no barrible)'}`)
}

const info = await nmapInfo()
console.log('\n── nmap ──')
console.log(`  disponible=${info.available} version=${info.version} admin=${info.elevated} viejo=${info.outdated}`)

console.log('\n── Bases de datos ──')
console.log('  top 10 puertos:', (await topPorts(10)).join(', '))
console.log('  OUI AC:84:C6 →', await vendorOf('AC:84:C6:11:22:33'))
console.log('  OUI B8:27:EB →', await vendorOf('B8:27:EB:00:00:00'))

const scope = scopes.find(s => s.kind === 'lan' && s.sweepable)
if (!scope) { console.log('\nSin LAN barrible; corto acá.'); process.exit(0) }

console.log(`\n── Escaneando ${scope.cidr} con preset "${presetId}" ──`)
const t0 = Date.now()
let lastPhase = ''

const scanner = new Scanner({
  preset: PRESETS.find(p => p.id === presetId),
  target: { scope },
  onEvent: (e) => {
    if (e.type === 'phase' && e.label !== lastPhase) {
      lastPhase = e.label
      console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${e.label}`)
    }
    if (e.type === 'host') console.log(`      + ${e.host.ip.padEnd(16)} ${e.host.mac || ''}`)
    if (e.type === 'notice') console.log(`      ! ${e.message}`)
    if (e.type === 'error') console.log(`      ERROR ${e.message}`)
  }
})

const hosts = await scanner.run()

console.log(`\n── Resultado (${((Date.now() - t0) / 1000).toFixed(1)}s) ──`)
for (const h of hosts.sort((a, b) => (+a.ip.split('.')[3]) - (+b.ip.split('.')[3]))) {
  const ports = h.ports.map(p => p.port).join(',')
  const vendor = h.vendor || (h.vendorNote?.includes('aleatoria') ? '(MAC aleatoria)' : '(sin datos)')
  console.log(
    `  ${h.ip.padEnd(16)} ${(h.mac || '—').padEnd(19)} ${(h.kind || '').padEnd(9)} ` +
    `${(h.display || '').slice(0, 24).padEnd(25)} ${vendor.slice(0, 22).padEnd(23)} ${ports}`
  )
}
console.log(`\n  ${hosts.length} dispositivos\n`)
process.exit(0)
