/**
 * Los formatos: los bordes de cada unidad.
 *   node test/format.test.mjs
 */
import { formatMs } from '../renderer/js/ui.js'
import { formatBytes } from '../renderer/js/about.js'

let fails = 0
const eq = (name, got, want) => {
  const ok = got === want
  console.log(`  ${ok ? 'ok  ' : 'FALLA'} ${name}: ${got}${ok ? '' : `  (esperaba ${want})`}`)
  if (!ok) fails++
}

console.log('\nDuraciones')
eq('cero', formatMs(0), '0 ms')
eq('debajo de un segundo', formatMs(999), '999 ms')
eq('999,6 ms redondea a un segundo', formatMs(999.6), '1,0 s')
eq('un segundo y pico', formatMs(3940), '3,9 s')
eq('9,96 s es 10 s, no 10,0 s', formatMs(9960), '10 s')
eq('más de diez', formatMs(12400), '12 s')
eq('sin dato', formatMs(null), '—')

console.log('\nTamaños')
eq('un kB', formatBytes(1024), '1 KB')
eq('justo debajo de un mega es un mega', formatBytes(1048575), '1,0 MB')
eq('un mega y medio', formatBytes(1.5 * 1024 * 1024), '1,5 MB')
eq('cero no dice nada', formatBytes(0), '')

console.log(fails ? `\n${fails} fallaron\n` : '\ntodo bien\n')
process.exit(fails ? 1 : 0)
