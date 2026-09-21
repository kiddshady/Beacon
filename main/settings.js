import { join } from 'node:path'
import { app } from 'electron'
import { Store } from './store.js'

/**
 * Lo que la persona configuró y quiere encontrar igual la próxima vez.
 * Un solo JSON en userData; cada sección es de quien la usa.
 */
const DEFAULTS = {
  version: 1,
  watch: { enabled: false, intervalMin: 15, scopeId: null }
}

const store = new Store(join(app.getPath('userData'), 'settings.json'), DEFAULTS)

export async function getSettings () {
  const data = await store.load()
  // Claves nuevas que un archivo viejo no tiene: se completan con el default.
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (data[k] == null) data[k] = structuredClone(v)
    else if (typeof v === 'object' && !Array.isArray(v)) data[k] = { ...v, ...data[k] }
  }
  return data
}

export async function patchSettings (section, patch) {
  const data = await getSettings()
  data[section] = { ...data[section], ...patch }
  await store.save()
  return data[section]
}
