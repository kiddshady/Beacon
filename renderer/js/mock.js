/**
 * Puente falso para trabajar la interfaz en el navegador, sin levantar Electron.
 * Se activa solo si `window.beacon` no existe — dentro de la app real nunca corre.
 */

const SCOPES = [
  { id: 'eth', iface: 'Ethernet', label: 'Ethernet', kind: 'lan', address: '192.168.1.2',
    mac: '34:5A:60:58:2A:D5', netmask: '255.255.255.0', prefix: 24, network: '192.168.1.0',
    cidr: '192.168.1.0/24', hostCount: 254, gateway: '192.168.1.1', sweepable: true },
  { id: 'ts', iface: 'Tailscale', label: 'Tailscale', kind: 'mesh', address: '100.121.210.29',
    mac: null, netmask: '255.255.255.255', prefix: 32, network: '100.121.210.29',
    cidr: '100.121.210.29/32', hostCount: 1, gateway: null, sweepable: false },
  { id: 'vb', iface: 'VirtualBox', label: 'VirtualBox', kind: 'virtual', address: '192.168.56.1',
    mac: null, netmask: '255.255.255.0', prefix: 24, network: '192.168.56.0',
    cidr: '192.168.56.0/24', hostCount: 254, gateway: '192.168.56.1', sweepable: true }
]

const PRESETS = [
  { id: 'who', label: '¿Quién está en mi red?', blurb: 'Descubre todos los dispositivos conectados.', needsNmap: false, needsAdmin: false },
  { id: 'quick', label: 'Escaneo rápido', blurb: 'Los dispositivos y sus puertos más comunes.', needsNmap: false, needsAdmin: false },
  { id: 'deep', label: 'Escaneo profundo', blurb: 'Versión de cada servicio y sistema operativo.', needsNmap: true, needsAdmin: true },
  { id: 'exposed', label: '¿Estoy expuesto?', blurb: 'Revisa esta máquina.', needsNmap: false, needsAdmin: false }
]

const P = (port, name, what, risk) => ({ port, name, what, risk })

const HOSTS = [
  { ip: '192.168.1.1', mac: '20:08:89:2F:65:78', isGateway: true, latency: 2, kind: 'router',
    display: 'Router · SMBSHARE', name: 'SMBSHARE', nameSource: 'NetBIOS', vendor: null,
    vendorNote: 'Prefijo no encontrado en la base de fabricantes',
    ports: [P(443, 'HTTPS', 'Web cifrada. El panel del aparato, bien hecho.', 'ok'),
            P(445, 'SMB', 'Compartir archivos e impresoras de Windows. Normal adentro de tu LAN; grave si estuviera expuesto a internet.', 'watch'),
            P(139, 'NetBIOS', 'Compartir archivos de Windows, versión antigua.', 'watch')] },

  { ip: '192.168.1.2', mac: '34:5A:60:58:2A:D5', isSelf: true, latency: 0, kind: 'self',
    display: 'Esta máquina', vendor: null, vendorNote: 'Prefijo no encontrado en la base de fabricantes',
    ports: [P(445, 'SMB', 'Compartir archivos e impresoras de Windows.', 'watch'),
            P(135, 'MSRPC', 'Llamadas remotas de Windows. Normal en cualquier Windows de la red.', 'watch'),
            P(3389, 'RDP', 'Escritorio remoto de Windows. Comodísimo, y el favorito de los ataques por fuerza bruta.', 'warn')] },

  { ip: '192.168.1.3', mac: 'CA:E7:0D:95:DB:E5', latency: 34, kind: 'phone',
    display: 'Teléfono (MAC privada)', vendor: null,
    vendorNote: 'MAC aleatoria — el aparato oculta su fabricante a propósito (privacidad)', ports: [] },

  { ip: '192.168.1.10', mac: '80:64:7C:EE:A0:B2', latency: 12, kind: 'iot', display: 'esphome-atom',
    name: 'esphome-atom', nameSource: 'mDNS', vendor: 'Espressif Inc.',
    ports: [P(1883, 'MQTT', 'Mensajería de domótica. Home Assistant, ESPHome y compañía.', 'ok')] },

  { ip: '192.168.1.15', mac: '80:64:7C:EE:40:FB', latency: 18, kind: 'printer', display: 'Impresora Brother',
    vendor: 'Brother Industries',
    ports: [P(9100, 'JetDirect', 'Impresión cruda de HP. Es una impresora de red.', 'ok'),
            P(631, 'IPP', 'Impresión por internet. Una impresora o un servidor CUPS.', 'ok'),
            P(23, 'Telnet', 'Consola remota SIN cifrado. Todo viaja legible, contraseña incluida.', 'warn')] },

  { ip: '192.168.1.18', mac: '68:B9:C2:65:82:30', latency: 8, kind: 'nas', display: 'NAS Synology',
    name: 'diskstation', nameSource: 'mDNS', vendor: 'Synology Inc.',
    ports: [P(5000, 'UPnP/API', 'Puerto multiuso: Synology, UPnP, o una API casera.', 'watch'),
            P(22, 'SSH', 'Consola remota cifrada. Normal en Linux, NAS y routers.', 'ok')] },

  { ip: '192.168.1.19', mac: '2E:2C:7F:E8:92:81', latency: 88, kind: 'phone',
    display: 'Teléfono (MAC privada)', vendor: null,
    vendorNote: 'MAC aleatoria — el aparato oculta su fabricante a propósito (privacidad)', ports: [] },

  { ip: '192.168.1.24', mac: 'B8:27:EB:14:9C:22', latency: 5, kind: 'sbc', display: 'raspberrypi',
    name: 'raspberrypi', nameSource: 'mDNS', vendor: 'Raspberry Pi Foundation',
    ports: [P(22, 'SSH', 'Consola remota cifrada. Normal en Linux, NAS y routers.', 'ok'),
            P(80, 'HTTP', 'Web sin cifrar. En la LAN suele ser el panel de configuración del aparato.', 'ok'),
            P(11434, 'Ollama', 'API de Ollama sirviendo modelos locales.', 'watch')] },

  { ip: '192.168.1.31', mac: '3C:5A:B4:22:11:09', latency: 46, kind: 'media', display: 'Chromecast',
    name: 'Chromecast-Living', nameSource: 'mDNS', vendor: 'Google Inc.',
    ports: [P(8008, 'puerto 8008', 'Servicio no identificado.', 'watch'),
            P(1900, 'UPnP', 'Descubrimiento automático de dispositivos. Smart TVs, consolas, Chromecast.', 'watch')] }
]

const listeners = new Set()
const updateListeners = new Set()
let updateState = { phase: 'idle', version: '0.0.0-ui', reason: 'dev' }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

window.beacon = {
  async bootstrap () {
    return {
      version: '0.0.0-ui',
      versions: { electron: '—', chrome: navigator.userAgent.match(/Chrome\/(\S+)/)?.[1] || '—', node: '—' },
      scopes: SCOPES,
      presets: PRESETS,
      nmap: { available: true, bin: 'nmap', version: '7.80', elevated: false, outdated: true }
    }
  },

  async previewCommand (presetId, target) {
    const flags = {
      who: [{ flag: '-sn', note: 'solo descubrir hosts, sin escanear puertos' }],
      quick: [{ flag: '-sT', note: 'conexión TCP completa (no necesita admin)' },
              { flag: '--top-ports 100', note: 'los 100 puertos más frecuentes' }],
      deep: [{ flag: '-sT', note: 'conexión TCP completa (sin admin no se puede -sS)' },
             { flag: '-sV', note: 'identifica qué programa y qué versión atiende cada puerto' },
             { flag: '--top-ports 1000', note: 'los 1000 puertos más frecuentes' },
             { flag: '-Pn', note: 'no hacer ping previo: sin admin puede dar falsos negativos' }],
      exposed: [{ flag: '-sT', note: 'conexión TCP completa' },
                { flag: '--top-ports 200', note: 'los 200 puertos más frecuentes' },
                { flag: '--open', note: 'mostrar solo lo que está realmente abierto' }]
    }[presetId] || []

    return {
      full: ['nmap', ...flags.map(f => f.flag), target].join(' '),
      parts: flags,
      target,
      degraded: presetId === 'deep' ? ['-sS', '-O'] : []
    }
  },

  async startScan (presetId) {
    const emit = (evt) => listeners.forEach(fn => fn(evt))
    const t0 = Date.now()

    emit({ type: 'start', total: 254, cidr: '192.168.1.0/24', preset: presetId })
    emit({ type: 'phase', phase: 'arp', label: 'Leyendo vecinos conocidos' })
    await sleep(320)

    emit({ type: 'phase', phase: 'sweep', label: 'Barriendo la subred' })
    for (let i = 0; i < HOSTS.length; i++) {
      await sleep(260 + Math.random() * 420)
      emit({ type: 'progress', done: Math.round(((i + 1) / HOSTS.length) * 254), total: 254 })
      emit({ type: 'host', host: { ...HOSTS[i], alive: true } })
    }

    emit({ type: 'phase', phase: 'enrich', label: `Identificando ${HOSTS.length} dispositivos` })
    await sleep(700)
    emit({ type: 'done', hosts: HOSTS, ms: Date.now() - t0, stopped: false })
    return HOSTS
  },

  async stopScan () {
    listeners.forEach(fn => fn({ type: 'done', hosts: HOSTS, ms: 0, stopped: true }))
    return true
  },

  onScanEvent (fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  async copy (text) {
    try { await navigator.clipboard.writeText(text) } catch { /* sin permiso, da igual */ }
    return true
  },

  // Sin updater en el navegador: estado quieto, y `install` no hace nada. Para
  // trabajar la UI de cada fase, desde la consola: beacon.update._emit({ phase: 'ready', next: '0.2.0' })
  update: {
    async state () { return updateState },
    async check () { return updateState },
    install () {},
    onState (fn) { updateListeners.add(fn); return () => updateListeners.delete(fn) },
    _emit (patch) {
      updateState = { ...updateState, ...patch }
      updateListeners.forEach(fn => fn(updateState))
      return updateState
    }
  },

  win: { minimize () {}, maximize () {}, close () {} }
}

console.info('[Beacon] puente simulado activo — datos de ejemplo, no hay red de verdad detrás.')
