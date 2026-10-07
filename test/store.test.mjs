/**
 * El store de los JSON: lo que tiene que aguantar en Windows.
 *   node test/store.test.mjs
 * Usa una carpeta temporal propia: no toca la memoria de tu red.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { Store, listAsides } from '../main/store.js'

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-store-'))
let fails = 0
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${name}${cond ? '' : `  → ${detail}`}`)
  if (!cond) fails++
}
const file = (name) => path.join(DIR, name)

console.log('\n1. Lo normal')
{
  const s = new Store(file('a.json'), { n: 0 })
  const d = await s.load()
  ok('sin archivo arranca del fallback', d.n === 0)
  d.n = 1; s.save(); d.n = 2; await s.save()
  ok('dos guardados seguidos: queda el último', JSON.parse(fs.readFileSync(file('a.json'), 'utf8')).n === 2)
  ok('no quedan temporales', !fs.readdirSync(DIR).some(f => f.endsWith('.tmp')))
}

console.log('\n2. Un JSON roto se aparta y se avisa')
{
  fs.writeFileSync(file('roto.json'), '{ esto no es json')
  const s = new Store(file('roto.json'), { vacio: true })
  const d = await s.load()
  ok('arranca del fallback', d.vacio === true)
  ok('el roto quedó aparte', fs.readdirSync(DIR).some(f => f.startsWith('roto.json.corrupto-')))
  ok('queda anotado para avisarlo', listAsides().some(a => a.file === 'roto.json'), JSON.stringify(listAsides()))
}

console.log('\n3. Un archivo tomado al leer no es un archivo vacío')
{
  const tomado = file('tomado.json')
  fs.writeFileSync(tomado, JSON.stringify({ v: 1 }))
  // Lo toma otro programa de verdad: PowerShell lo abre sin compartir.
  const hold = (ms) => new Promise((resolve) => {
    const ps = spawn('powershell', ['-NoProfile', '-Command', `$f = [IO.File]::Open('${tomado}', 'Open', 'ReadWrite', 'None'); 'listo'; Start-Sleep -Milliseconds ${ms}; $f.Close()`])
    const exit = new Promise(r => ps.on('exit', r))
    let out = ''
    ps.stdout.on('data', (c) => { out += c; if (out.includes('listo')) resolve({ exit }) })
  })

  // Tomado un ratito: se suelta mientras reintenta.
  const done = await hold(150)
  const leido = await new Store(tomado, { v: 0 }).load().catch(e => e)
  ok('tomado un instante: se lee lo que hay', leido?.v === 1, JSON.stringify(leido?.code ?? leido))
  await done.exit

  // Tomado todo el rato: el error sube.
  const done2 = await hold(3000)
  const s = new Store(tomado, { v: 0 })
  const err = await s.load().then(v => v, e => e)
  ok('si sigue tomado, el error sube (no es "no hay nada")', ['EBUSY', 'EPERM', 'EACCES'].includes(err?.code), String(err?.code ?? JSON.stringify(err)))
  ok('y no queda cargado un vacío que después se guarde encima', s.data === null)
  await done2.exit
  ok('el archivo sigue intacto', JSON.parse(fs.readFileSync(tomado, 'utf8')).v === 1)
}

console.log('\n4. Al apagar Windows, lo pendiente se escribe sin soltar el hilo')
{
  const s = new Store(file('apagar.json'), { n: 0 })
  const d = await s.load()
  d.n = 1
  const late = s.save()              // una asíncrona en vuelo, con n = 1
  d.n = 2
  s.flushSync()                      // Windows avisa: se escribe ya, con n = 2
  ok('flushSync vuelve con el archivo en el disco', JSON.parse(fs.readFileSync(file('apagar.json'), 'utf8')).n === 2)
  await late
  ok('la asíncrona de antes no lo pisa con lo viejo', JSON.parse(fs.readFileSync(file('apagar.json'), 'utf8')).n === 2)
  ok('sin nada pendiente, flushSync no escribe', (() => { fs.rmSync(file('apagar.json')); s.flushSync(); return !fs.existsSync(file('apagar.json')) })())
}

fs.rmSync(DIR, { recursive: true, force: true })
console.log(fails ? `\n${fails} fallaron\n` : '\ntodo bien\n')
process.exit(fails ? 1 : 0)
