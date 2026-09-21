import { join } from 'node:path'
import { app } from 'electron'
import { Store } from './store.js'

/**
 * La memoria de Beacon: qué aparatos vio, en qué red, cuándo, y cómo los llamás vos.
 *
 * Sin esto cada escaneo arranca de cero y "Teléfono (MAC privada)" no te dice si
 * estaba ayer o se colgó recién. Con esto, cada host que aparece viene marcado
 * como conocido o nuevo, y al terminar se sabe quién faltó respecto de la vez
 * anterior.
 *
 * Identidad: la MAC. Android e iOS aleatorizan la suya, pero por red — en tu casa
 * el teléfono usa siempre la misma MAC aleatoria, así que sirve igual. Cuando un
 * host todavía no tiene MAC (lo encontró el barrido TCP y la tabla ARP no se leyó
 * aún), se busca por la IP que tenía la última vez.
 *
 * Red: el CIDR. Dos redes distintas con el mismo 192.168.1.0/24 se mezclan; es
 * el precio de saber a qué red pertenece un host antes de terminar de escanearla.
 */

const EMPTY = { version: 1, devices: {}, networks: {} }
/** Cuántos escaneos se recuerdan por red. Con diez aparatos cada uno, es poco espacio. */
const HISTORY_MAX = 40

const store = new Store(join(app.getPath('userData'), 'memory.json'), EMPTY)

export function deviceKey (host, netKey) {
  if (host.mac) return `mac:${host.mac.toUpperCase()}`
  return `ip:${netKey}:${host.ip}`
}

/** Lo que vale la pena recordar de un host. El resto se vuelve a medir. */
function summarize (host) {
  return {
    ip: host.ip,
    mac: host.mac || null,
    name: host.name || null,
    display: host.display || host.ip,
    vendor: host.vendor || null,
    kind: host.kind || 'unknown',
    isGateway: !!host.isGateway,
    isSelf: !!host.isSelf,
    ports: (host.ports || []).map(p => p.port)
  }
}

const portsOf = (host) => (host.ports || []).map(p => p.port)

/**
 * Una sesión de escaneo sobre una red: congela lo que se sabía ANTES de empezar,
 * para que cada host se compare contra eso y no contra lo que el mismo escaneo
 * ya fue anotando.
 */
export async function openSession (netKey) {
  const data = await store.load()
  const net = data.networks[netKey]
  const scannedBefore = !!net?.lastScan

  // Lo que había la última vez, por clave y por IP.
  const lastByKey = new Map()
  const lastByIp = new Map()
  for (const entry of net?.lastScan?.hosts || []) {
    lastByKey.set(entry.key, entry)
    lastByIp.set(entry.ip, entry)
  }

  function lookup (host) {
    const key = deviceKey(host, netKey)
    const device = data.devices[key]
    if (device) return { key, device, last: lastByKey.get(key) }
    // Sin MAC todavía: ¿alguien estaba en esta IP la última vez?
    if (!host.mac) {
      const prev = lastByIp.get(host.ip)
      if (prev) return { key: prev.key, device: data.devices[prev.key], last: prev }
    }
    return { key, device: null, last: null }
  }

  return {
    netKey,
    scannedBefore,

    /** Le cuelga al host su identidad, su alias y lo que se recuerda de él. */
    annotate (host) {
      const { key, device, last } = lookup(host)
      const seenBefore = !!device
      // Un puerto abierto que nunca se le vio a este aparato. Solo si ya se le
      // conocían puertos: un registro viejo sin esa lista no marca nada.
      const known = device?.knownPorts
      const newPorts = known ? portsOf(host).filter(p => !known.includes(p)) : []
      return {
        ...host,
        key,
        alias: device?.alias || null,
        memory: {
          seenBefore,
          // Solo es "nuevo" si la red ya se había escaneado: en el primer escaneo
          // todo sería nuevo y el aviso no diría nada.
          isNew: scannedBefore && !seenBefore,
          firstSeen: device?.firstSeen || null,
          lastSeen: device?.lastSeen || null,
          seenCount: device?.seenCount || 0,
          previousIp: last && last.ip !== host.ip ? last.ip : null,
          newPorts
        }
      }
    },

    /**
     * Cierra el escaneo: actualiza lo que se sabe de cada aparato, guarda la foto
     * de la red y devuelve el diff contra la vez anterior.
     */
    async commit (hosts, { preset, complete }) {
      const now = Date.now()
      const seenKeys = new Set()
      const added = []
      const moved = []
      const openedPorts = []

      for (const host of hosts) {
        const { key, device, last } = lookup(host)
        seenKeys.add(key)
        const summary = summarize(host)
        const ports = portsOf(host)

        if (device) {
          if (scannedBefore && last && last.ip !== host.ip) {
            moved.push({ key, name: device.alias || summary.display, from: last.ip, to: host.ip })
          }
          // Puertos que nunca se le vieron. Un registro anterior a esta lista se
          // completa en silencio: si no, al actualizar todo sería "nuevo".
          if (Array.isArray(device.knownPorts)) {
            const opened = ports.filter(p => !device.knownPorts.includes(p))
            if (opened.length) {
              openedPorts.push({ key, name: device.alias || summary.display, ip: host.ip, ports: opened })
              device.knownPorts = [...new Set([...device.knownPorts, ...ports])].sort((a, b) => a - b)
            }
          } else {
            device.knownPorts = [...ports].sort((a, b) => a - b)
          }
          Object.assign(device, {
            lastSeen: now,
            seenCount: (device.seenCount || 0) + 1,
            last: summary
          })
          device.networks[netKey] = { lastSeen: now, ip: host.ip }
        } else {
          data.devices[key] = {
            alias: null,
            firstSeen: now,
            lastSeen: now,
            seenCount: 1,
            last: summary,
            knownPorts: [...ports].sort((a, b) => a - b),
            networks: { [netKey]: { lastSeen: now, ip: host.ip } }
          }
          if (scannedBefore) added.push({ key, name: summary.display, ip: host.ip, kind: summary.kind })
        }
      }

      // Los que estaban la última vez y ahora no contestaron. Solo tiene sentido
      // si el escaneo llegó al final: uno detenido a mitad no vio a nadie por culpa
      // de nadie.
      const missing = complete
        ? [...lastByKey.values()]
          .filter(e => !seenKeys.has(e.key))
          .map(e => ({
            key: e.key,
            name: data.devices[e.key]?.alias || e.display,
            ip: e.ip,
            kind: e.kind,
            vendor: e.vendor,
            lastSeen: data.devices[e.key]?.lastSeen || null
          }))
        : []

      // La foto de la red se reemplaza solo con un escaneo completo. Si no, un
      // escaneo cortado a los 2 segundos haría que la próxima vez todos "falten".
      if (complete) {
        const entry = {
          at: now,
          preset,
          count: hosts.length,
          added: added.map(a => a.name),
          missing: missing.map(m => m.name),
          moved: moved.map(m => `${m.name} (${m.from} → ${m.to})`),
          openedPorts: openedPorts.map(o => `${o.name} (${o.ports.join(', ')})`),
          // Lo justo para reconstruir "cómo estaba la red ese día".
          hosts: hosts.map(h => {
            const { key, device } = lookup(h)
            return { key, ip: h.ip, name: device?.alias || h.display || h.ip, kind: h.kind || 'unknown', ports: portsOf(h).length }
          })
        }
        data.networks[netKey] = {
          ...(net || {}),
          scans: (net?.scans || 0) + 1,
          lastScan: {
            at: now,
            preset,
            hosts: hosts.map(h => ({ key: lookup(h).key, ...summarize(h) }))
          },
          history: [...(net?.history || []), entry].slice(-HISTORY_MAX)
        }
      }

      await store.save()
      return { first: !scannedBefore, complete, added, missing, moved, openedPorts }
    }
  }
}

/** Los escaneos guardados de una red, del más reciente al más viejo. */
export async function getHistory (netKey) {
  const data = await store.load()
  const net = data.networks[netKey]
  return {
    netKey,
    scans: net?.scans || 0,
    history: [...(net?.history || [])].reverse()
  }
}

/**
 * Guarda cómo llamás a un aparato. Si todavía no está en la memoria (se lo
 * bautiza a mitad de su primer escaneo), se lo da de alta con lo que se sabe.
 */
export async function setAlias (key, alias, host = null) {
  const data = await store.load()
  let device = data.devices[key]
  if (!device) {
    if (!host) throw new Error(`aparato desconocido: ${key}`)
    const now = Date.now()
    device = data.devices[key] = {
      alias: null, firstSeen: now, lastSeen: now, seenCount: 0, last: summarize(host), networks: {}
    }
  }
  device.alias = alias?.trim() || null
  await store.save()
  return device.alias
}
