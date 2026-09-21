/**
 * Los botones. Cada uno es una intención en castellano, no una combinación de flags.
 *
 * `nmapFlags` no se ejecuta necesariamente: también alimenta el panel que muestra
 * el comando equivalente, para que usar Beacon te enseñe nmap de rebote.
 */
export const PRESETS = [
  {
    id: 'who',
    label: '¿Quién está en mi red?',
    blurb: 'Descubre todos los dispositivos conectados. Segundos, sin permisos especiales.',
    engine: 'native',
    needsNmap: false,
    needsAdmin: false,
    probePorts: 'default',
    topPorts: 0,
    nmapFlags: [
      { flag: '-sn', note: 'solo descubrir hosts, sin escanear puertos' }
    ]
  },
  {
    id: 'quick',
    label: 'Escaneo rápido',
    blurb: 'Los dispositivos y sus puertos más comunes. Un minuto, más o menos.',
    engine: 'native',
    needsNmap: false,
    needsAdmin: false,
    probePorts: 'default',
    topPorts: 100,
    nmapFlags: [
      { flag: '-sT', note: 'conexión TCP completa (no necesita admin)' },
      { flag: '--top-ports 100', note: 'los 100 puertos más frecuentes' }
    ]
  },
  {
    id: 'deep',
    label: 'Escaneo profundo',
    blurb: 'Versión de cada servicio y sistema operativo. Tarda varios minutos: usalo en tu red.',
    engine: 'nmap',
    needsNmap: true,
    needsAdmin: true,
    probePorts: 'default',
    topPorts: 200,
    // nmap corre SOLO sobre los que el motor propio ya encontró vivos, nunca sobre
    // la subred entera: descubrir 254 direcciones nos cuesta 2 segundos, y a nmap
    // con -sV le costaría horas.
    nmapTargets: 'alive',
    nmapFlags: [
      { flag: '-sS', note: 'SYN scan: más rápido y discreto, requiere admin', adminOnly: true },
      { flag: '-sV', note: 'identifica qué programa y qué versión atiende cada puerto' },
      { flag: '--version-intensity 4', note: 'sondeo de versión moderado: mucho más rápido que el máximo' },
      { flag: '-O', note: 'adivina el sistema operativo', adminOnly: true },
      { flag: '-T4', note: 'ritmo agresivo, pensado para redes locales rápidas' },
      { flag: '--host-timeout 90s', note: 'abandona un dispositivo que no responde en vez de colgarse' },
      { flag: '--top-ports 200', note: 'los 200 puertos más frecuentes' }
    ]
  },
  {
    id: 'exposed',
    label: '¿Estoy expuesto?',
    blurb: 'Revisa esta máquina buscando los puertos que no deberían estar abiertos.',
    engine: 'native',
    needsNmap: false,
    needsAdmin: false,
    scope: 'self',
    probePorts: 'risky',
    topPorts: 200,
    nmapFlags: [
      { flag: '-sT', note: 'conexión TCP completa' },
      { flag: '--top-ports 200', note: 'los 200 puertos más frecuentes' },
      { flag: '--open', note: 'mostrar solo lo que está realmente abierto' }
    ]
  }
]

/** Puertos que en una LAN merecen una mirada si aparecen abiertos en tu propia máquina. */
export const RISKY_PORTS = [
  21, 22, 23, 25, 110, 111, 135, 139, 143, 445, 1433, 3306, 3389,
  5432, 5900, 6379, 8080, 9200, 11434, 27017
]
