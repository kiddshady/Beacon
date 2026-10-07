import { readFile, rename, mkdir, unlink, open } from 'node:fs/promises'
import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs'
import { basename, dirname } from 'node:path'

/**
 * Un archivo JSON, leído una vez y escrito de forma atómica.
 *
 * Atómica quiere decir: se escribe a un archivo temporal al lado y después se
 * renombra encima del real. Si la app se cierra a mitad de la escritura (o se
 * corta la luz), el archivo real queda como estaba, nunca por la mitad.
 *
 * Las escrituras se encadenan para que dos `save()` seguidos no se pisen. Y hay
 * tres trampas de Windows que esto cubre (las aprendió Prism, las trajo Opal):
 *
 *   1. Un archivo TOMADO no es un archivo vacío. Un backup o un antivirus lo
 *      puede tener abierto justo al arrancar; tomarlo como vacío hacía que el
 *      primer guardado escribiera encima y la memoria de la red (los alias, el
 *      historial) se perdiera. La lectura reintenta, y si no se suelta, el error
 *      sube: quien lee no puede confundirlo con "no hay nada".
 *   2. Un JSON roto se aparta como `.corrupto-<fecha>` (queda para recuperarlo a
 *      mano), se anota, y la app lo avisa. Sin el aviso, para la persona sus
 *      datos simplemente desaparecían.
 *   3. El rename falla con EPERM/EBUSY si el destino está tomado en ese
 *      instante. Son bloqueos de milisegundos: se reintenta con backoff.
 *
 * Y una cuarta: apagar Windows no espera a nadie. Después de avisar que la
 * sesión termina puede matar el proceso, y una escritura asíncrona a mitad no
 * llega. Para ese instante está `flushSync()`, que vuelve con el archivo ya en
 * el disco.
 */

const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES'])
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let tmpCounter = 0

/** Los archivos que se apartaron por ilegibles en esta corrida: { file, dead }. */
const asides = []
export const listAsides = () => asides.map(a => ({ file: basename(a.file), dead: a.dead }))

/** Todos los stores vivos, para escribir lo pendiente al apagar Windows. */
const stores = new Set()
export function flushAll () {
  for (const s of stores) {
    try { s.flushSync() } catch (err) { console.warn(`[store] no se pudo guardar ${s.file} al cerrar: ${err.message}`) }
  }
}

export class Store {
  constructor (file, fallback = {}) {
    this.file = file
    this.fallback = fallback
    this.data = null
    this.chain = Promise.resolve()
    /** Lo que se pidió guardar y todavía no llegó al disco. */
    this.pending = 0
    /** Cuántas escrituras sincrónicas hubo: una asíncrona encolada antes trae datos más viejos. */
    this.syncGen = 0
    stores.add(this)
  }

  async load () {
    if (this.data) return this.data
    this.data = await this.#read()
    return this.data
  }

  async #read () {
    for (let i = 0; ; i++) {
      try {
        return JSON.parse(await readFile(this.file, 'utf8'))
      } catch (err) {
        // Que no exista es lo normal la primera vez.
        if (err.code === 'ENOENT') return structuredClone(this.fallback)
        if (err instanceof SyntaxError) {
          const dead = `${this.file}.corrupto-${Date.now()}`
          if (await rename(this.file, dead).then(() => true, () => false)) asides.push({ file: this.file, dead })
          console.warn(`[store] ${basename(this.file)} ilegible → ${basename(dead)}`)
          return structuredClone(this.fallback)
        }
        // Tomado por un instante: se reintenta. Si no se suelta, el error sube.
        if (TRANSIENT.has(err.code) && i < 4) { await sleep(30 * 2 ** i); continue }
        throw err
      }
    }
  }

  save () {
    const snapshot = JSON.stringify(this.data, null, 2)
    const gen = this.syncGen
    this.pending++
    this.chain = this.chain.then(() => this.#write(snapshot, gen))
      .catch(err => console.warn(`[store] no se pudo guardar ${this.file}: ${err.message}`))
      .finally(() => { this.pending-- })
    return this.chain
  }

  async #write (snapshot, gen) {
    await mkdir(dirname(this.file), { recursive: true })
    // Temporal único: aunque algo se cuele en paralelo, nadie pisa el .tmp ajeno.
    const tmp = `${this.file}.${process.pid}.${++tmpCounter}.tmp`
    const fh = await open(tmp, 'w')
    try {
      await fh.writeFile(snapshot, 'utf8')
      await fh.sync()
    } finally {
      await fh.close()
    }
    // Se encoló antes de una escritura sincrónica: lo que traía es más viejo que el disco.
    if (gen !== this.syncGen) { await unlink(tmp).catch(() => {}); return }
    for (let i = 0; ; i++) {
      try {
        await rename(tmp, this.file)
        return
      } catch (err) {
        if (i >= 4 || !TRANSIENT.has(err.code)) {
          await unlink(tmp).catch(() => {})
          throw err
        }
        await sleep(30 * 2 ** i)
      }
    }
  }

  /**
   * Lo que todavía no llegó al disco, escrito YA y sin soltar el hilo. Es para
   * cuando Windows avisa que se apaga: después puede cortar en cualquier momento.
   */
  flushSync () {
    if (!this.pending || !this.data) return
    this.syncGen++
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.${++tmpCounter}.tmp`
    const fd = openSync(tmp, 'w')
    try {
      writeFileSync(fd, JSON.stringify(this.data, null, 2), 'utf8')
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    for (let i = 0; ; i++) {
      try {
        renameSync(tmp, this.file)
        return
      } catch (err) {
        if (i >= 4 || !TRANSIENT.has(err.code)) {
          try { unlinkSync(tmp) } catch { /* ya no estaba */ }
          throw err
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30 * 2 ** i)
      }
    }
  }
}
