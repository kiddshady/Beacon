/**
 * Publicar un release entero, o no publicar nada.
 *
 * `npm run release` corre esto. Compila el renderer, arma el instalador con
 * electron-builder, lo sube a GitHub, verifica lo que quedó allá contra lo que
 * hay en release/ y recién entonces lo publica.
 *
 * ── Por qué no alcanza con `electron-builder --publish always` ──────────────
 * electron-builder 26.15.3 tiene una carrera en PublishManager: el .exe y su
 * .blockmap llegan casi juntos, cada uno crea SU publicador y cada publicador
 * crea SU release. Pasó en Beacon 0.2.0 (21 sep 2026): dos releases con el
 * mismo tag, uno con dos archivos y otro con tres. En Mnemus pasó tres veces.
 *
 * El arreglo no toca node_modules: getOrCreateRelease devuelve el borrador que
 * ya exista con ese tag, así que lo creamos NOSOTROS antes de compilar y los dos
 * publicadores suben al mismo. Y como una carrera se arregla pero no se
 * demuestra, al final se verifica: un solo release para el tag, y adentro los
 * tres archivos con el tamaño exacto de release/.
 *
 * Uso:
 *   npm run release                       publica la versión de package.json
 *   npm run release -- --notas notas.md   con esas notas (si no, un pie mínimo)
 *   npm run release -- --ensayo           todo el camino con una versión de
 *                                         prueba, y al final borra el borrador
 *
 * Antes: `npm version <patch|minor>` y `git push origin main --follow-tags`.
 * El token sale de `gh auth token` si GH_TOKEN no está en el entorno.
 *
 * Es una adaptación de tools/release.mjs de Mnemus.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const publish = [].concat(pkg.build.publish).find(p => p.provider === 'github')
const REPO = `${publish.owner}/${publish.repo}`

const args = process.argv.slice(2)
const ensayo = args.includes('--ensayo')
const notasArg = args.indexOf('--notas')
const notasFile = notasArg > -1 ? args[notasArg + 1] : null

const version = ensayo ? `${pkg.version}-ensayo.${Date.now()}` : pkg.version
const tag = `v${version}`
const titulo = `${pkg.productName} ${version}`
const PIE = 'Se instala sola si ya tenés Beacon. Si es tu primera vez, Windows SmartScreen va a advertir porque el instalador no está firmado.'

const paso = (t) => console.log(`\n── ${t}`)
const falla = (t) => { console.error(`\nNO SE PUBLICÓ NADA: ${t}`); process.exit(1) }

function run (cmd, cmdArgs, { input, env, quiet = false, shell = false } = {}) {
  // Sin shell salvo para npx/npm (.cmd): por cmd.exe, un argumento con saltos
  // de línea o comillas —las notas del release— llega roto.
  const r = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    input,
    env: env || process.env,
    encoding: 'utf8',
    stdio: quiet ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
    shell,
    maxBuffer: 64 * 1024 * 1024
  })
  if (r.status !== 0) falla(`${cmd} ${cmdArgs.join(' ')} terminó con código ${r.status}${quiet ? `\n${r.stderr || r.stdout}` : ''}`)
  return (r.stdout || '').trim()
}
const gh = (...a) => run('gh', a, { quiet: true })
const ghPost = (ruta, datos) => JSON.parse(run('gh', ['api', '-X', 'POST', ruta, '--input', '-'], { quiet: true, input: JSON.stringify(datos) }))
const ghJson = (...a) => JSON.parse(gh(...a) || 'null')

/** Todos los releases del tag, borradores incluidos. `gh release view` elige
 *  uno solo y así escondía al gemelo: acá se piden todos. */
function releasesDelTag () {
  return ghJson('api', `repos/${REPO}/releases?per_page=100`)
    .filter(r => r.tag_name === tag)
    .map(r => ({ id: r.id, draft: r.draft, assets: r.assets.map(a => ({ name: a.name, size: a.size, state: a.state })) }))
}

/* ── 1. Precondiciones ──────────────────────────────────────────────────── */

paso(`${ensayo ? 'ENSAYO' : 'Release'} ${tag} → ${REPO}`)
const token = process.env.GH_TOKEN || gh('auth', 'token')
if (!token) falla('no hay GH_TOKEN ni sesión de `gh auth`.')

if (!ensayo) {
  // El release tiene que ser del código que ya está en GitHub con su tag.
  const remoto = run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], { quiet: true })
  if (!remoto) falla(`el tag ${tag} no está en origin. Corré \`npm version <patch|minor>\` y \`git push origin main --follow-tags\`.`)
  const local = run('git', ['rev-parse', 'HEAD'], { quiet: true })
  const delTag = run('git', ['rev-list', '-n', '1', tag], { quiet: true })
  if (local !== delTag) falla(`HEAD no es ${tag}: habría un instalador de código distinto al del tag.`)
}
if (notasFile && !fs.existsSync(notasFile)) falla(`no existe el archivo de notas ${notasFile}.`)

/* ── 2. El borrador, antes de compilar ──────────────────────────────────── */

paso('Borrador en GitHub')
let existentes = releasesDelTag()
if (existentes.some(r => !r.draft)) falla(`${tag} ya está publicado.`)
if (existentes.length > 1) falla(`hay ${existentes.length} borradores para ${tag} (ids ${existentes.map(r => r.id).join(', ')}). Borrá los que sobran y volvé a correr.`)

let draftId
if (existentes.length === 1) {
  draftId = existentes[0].id
  console.log(`Se reutiliza el borrador ${draftId} de una corrida anterior.`)
} else {
  const cuerpo = (notasFile ? fs.readFileSync(notasFile, 'utf8').trim() + '\n\n---\n\n' : '') + PIE
  const creado = ghPost(`repos/${REPO}/releases`, { tag_name: tag, name: titulo, body: cuerpo, draft: true, prerelease: ensayo })
  draftId = creado.id
  console.log(`Borrador ${draftId} creado.`)
}

/* ── 3. Compilar y subir ────────────────────────────────────────────────── */

const shell = process.platform === 'win32'

paso('vite build')
run('npm', ['run', 'build'], { shell })

paso('electron-builder')
const ebArgs = ['electron-builder', '--win', '--publish', 'always']
if (ensayo) ebArgs.push(`-c.extraMetadata.version=${version}`)
run('npx', ebArgs, {
  shell,
  env: {
    ...process.env,
    GH_TOKEN: token,
    // Que Node resuelva primero IPv4 para la subida de 95 MB: con IPv6 a medias
    // la conexión se cuelga un minuto antes de caer a IPv4.
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first'].filter(Boolean).join(' ')
  }
})

/* ── 4. Verificar contra release/ ───────────────────────────────────────── */

paso('Verificación')
const out = path.join(ROOT, pkg.build.directories?.output || 'dist')
const instalador = pkg.build.nsis.artifactName
  .replace('${productName}', pkg.productName)
  .replace('${version}', version)
  .replace('${ext}', 'exe')
const esperados = [instalador, `${instalador}.blockmap`, 'latest.yml'].map(name => {
  const f = path.join(out, name)
  if (!fs.existsSync(f)) falla(`falta ${name} en ${path.basename(out)}/.`)
  return { name, size: fs.statSync(f).size }
})

existentes = releasesDelTag()
const problemas = []
if (existentes.length !== 1) problemas.push(`hay ${existentes.length} releases para ${tag} y tiene que haber uno (ids ${existentes.map(r => r.id).join(', ')}).`)
const nuestro = existentes.find(r => r.id === draftId)
if (!nuestro) problemas.push(`el borrador ${draftId} desapareció.`)
for (const e of esperados) {
  const a = nuestro?.assets.find(x => x.name === e.name)
  const estado = !a ? 'FALTA' : a.state !== 'uploaded' ? `estado ${a.state}` : a.size !== e.size ? `pesa ${a.size} y local ${e.size}` : 'ok'
  console.log(`  ${estado === 'ok' ? 'ok   ' : 'MAL  '} ${e.name} (${e.size} bytes)${estado === 'ok' ? '' : ` — ${estado}`}`)
  if (estado !== 'ok') problemas.push(`${e.name}: ${estado}.`)
}
if (problemas.length) falla(`el borrador quedó incompleto; sigue siendo borrador y nadie lo ve.\n  - ${problemas.join('\n  - ')}`)

/* ── 5. Publicar (o, en ensayo, limpiar) ────────────────────────────────── */

if (ensayo) {
  paso('Ensayo: se borra el borrador')
  gh('api', '-X', 'DELETE', `repos/${REPO}/releases/${draftId}`)
  // El instalador de prueba pesa 95 MB y no sirve para nada.
  for (const e of esperados.slice(0, 2)) fs.rmSync(path.join(out, e.name), { force: true })
  console.log(`Borrador ${draftId} borrado. El camino completo anduvo; no se publicó nada.`)
  process.exit(0)
}

paso('Publicar')
gh('api', '-X', 'PATCH', `repos/${REPO}/releases/${draftId}`, '-F', 'draft=false', '-f', 'make_latest=true')
const final = ghJson('api', `repos/${REPO}/releases/${draftId}`)
if (final.draft) falla('GitHub no lo sacó de borrador.')
console.log(`Publicado: ${final.html_url}`)
