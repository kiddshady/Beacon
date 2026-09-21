import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Un archivo JSON, leído una vez y escrito de forma atómica.
 *
 * Atómica quiere decir: se escribe a un archivo temporal al lado y después se
 * renombra encima del real. Si la app se cierra a mitad de la escritura (o se
 * corta la luz), el archivo real queda como estaba, nunca por la mitad.
 *
 * Las escrituras se encadenan para que dos `save()` seguidos no se pisen.
 */
export class Store {
  constructor (file, fallback = {}) {
    this.file = file
    this.fallback = fallback
    this.data = null
    this.chain = Promise.resolve()
  }

  async load () {
    if (this.data) return this.data
    try {
      this.data = JSON.parse(await readFile(this.file, 'utf8'))
    } catch (err) {
      // Que no exista es lo normal la primera vez. Que esté roto es raro, pero
      // tampoco vale la pena morir por eso: se arranca de cero y se avisa.
      if (err.code !== 'ENOENT') console.warn(`[store] ${this.file} ilegible, se reinicia: ${err.message}`)
      this.data = structuredClone(this.fallback)
    }
    return this.data
  }

  save () {
    const snapshot = JSON.stringify(this.data, null, 2)
    this.chain = this.chain.then(async () => {
      await mkdir(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, this.file)
    }).catch(err => console.warn(`[store] no se pudo guardar ${this.file}: ${err.message}`))
    return this.chain
  }
}
