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

  { ip: '192.168.1.31', mac: '3C:5A:B4:22:11:09', latency: 46, kind: 'media', display: 'Tele del living',
    name: 'Tele del living', nameSource: 'UPnP', vendor: 'Google Inc.', model: 'Chromecast Ultra',
    upnp: { friendlyName: 'Tele del living', modelName: 'Chromecast Ultra', manufacturer: 'Google Inc.', deviceType: 'MediaRenderer', server: 'Linux/3.10 UPnP/1.0' },
    ports: [P(8008, 'puerto 8008', 'Servicio no identificado.', 'watch'),
            P(1900, 'UPnP', 'Descubrimiento automático de dispositivos. Smart TVs, consolas, Chromecast.', 'watch')] }
]

const listeners = new Set()
const aliases = {}
let scanning = false
const pingListeners = new Set()
let pingTimer = null

const watchListeners = new Set()
let watchState = { enabled: false, intervalMin: 15, intervals: [5, 15, 30, 60], scopeId: null, cidr: null, running: false, lastRun: null, nextRun: null, lastCount: null }
let watchTimer = null
const watchEmit = () => watchListeners.forEach(fn => fn(watchState))
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

  async startScan (presetId, _target, { watch = false } = {}) {
    const emit = (evt) => listeners.forEach(fn => fn(evt))
    const t0 = Date.now()
    const DAY = 86400000

    // Memoria simulada: el Chromecast es nuevo, la Pi cambió de IP, el resto es conocido.
    const remember = (h, i) => ({
      ...h,
      key: `mac:${h.mac}`,
      alias: aliases[`mac:${h.mac}`] || null,
      memory: h.kind === 'media'
        ? { seenBefore: false, isNew: true, firstSeen: null, lastSeen: null, seenCount: 0, previousIp: null }
        : { seenBefore: true, isNew: false, firstSeen: t0 - (12 + i) * DAY, lastSeen: t0 - 3 * 3600000,
            seenCount: 14 - i, previousIp: h.kind === 'sbc' ? '192.168.1.31' : null }
    })
    const hosts = HOSTS.map(remember)
    scanning = true

    emit({ type: 'start', total: 254, cidr: '192.168.1.0/24', preset: presetId, watch })
    emit({ type: 'phase', phase: 'arp', label: 'Leyendo vecinos conocidos' })
    await sleep(320)

    emit({ type: 'phase', phase: 'sweep', label: 'Barriendo la subred' })
    for (let i = 0; i < hosts.length; i++) {
      await sleep(260 + Math.random() * 420)
      if (!scanning) return hosts.slice(0, i)
      emit({ type: 'progress', done: Math.round(((i + 1) / hosts.length) * 254), total: 254 })
      emit({ type: 'host', host: { ...hosts[i], alive: true } })
    }

    emit({ type: 'phase', phase: 'enrich', label: `Identificando ${hosts.length} dispositivos` })
    await sleep(700)
    if (!scanning) return hosts
    scanning = false
    emit({
      type: 'diff',
      first: false,
      complete: true,
      added: [{ key: 'mac:3C:5A:B4:22:11:09', name: 'Tele del living', ip: '192.168.1.31', kind: 'media' }],
      missing: [{ key: 'mac:AA:BB:CC:00:11:22', name: 'Impresora HP', ip: '192.168.1.40', kind: 'printer',
                  vendor: 'HP Inc.', lastSeen: t0 - 2 * DAY }],
      moved: [{ key: 'mac:B8:27:EB:14:9C:22', name: 'raspberrypi', from: '192.168.1.31', to: '192.168.1.24' }]
    })
    emit({ type: 'done', hosts, ms: Date.now() - t0, stopped: false })
    return hosts
  },

  // Profundizar simulado: mismos eventos que un escaneo, marcados con `single`, y
  // al aparato le aparecen puertos con versión y un sistema operativo.
  async deepen (ip) {
    const emit = (evt) => listeners.forEach(fn => fn({ ...evt, single: ip }))
    const base = HOSTS.find(h => h.ip === ip)
    if (!base) throw new Error(`no conozco ${ip}`)
    const t0 = Date.now()
    emit({ type: 'start', total: 1, cidr: ip, preset: 'deep', command: { full: `nmap -sT -sV --version-intensity 4 -T4 --top-ports 200 ${ip}`, parts: [{ flag: '-sT', note: 'conexión TCP completa' }, { flag: '-sV', note: 'identifica qué programa y qué versión atiende cada puerto' }, { flag: '--top-ports 200', note: 'los 200 puertos más frecuentes' }], target: ip, degraded: ['-sS', '-O'] } })
    emit({ type: 'phase', phase: 'ports', label: 'Revisando 200 puertos en 1 dispositivo' })
    let host = { ...base, key: `mac:${base.mac}`, alias: aliases[`mac:${base.mac}`] || null, memory: { seenBefore: true, isNew: false, seenCount: 3, firstSeen: t0 - 86400000 * 3, lastSeen: t0 - 3600000, previousIp: null } }
    for (let i = 1; i <= 8; i++) { await sleep(180); emit({ type: 'progress', done: i * 25, total: 200 }) }
    host = { ...host, ports: [...host.ports, P(8443, 'HTTPS alt', 'Web cifrada en puerto alternativo. Paneles de administración.', 'watch')] }
    emit({ type: 'host:update', host })
    emit({ type: 'phase', phase: 'nmap', label: 'nmap: analizando 1 dispositivo en profundidad (sin admin no se puede detectar el sistema operativo)' })
    await sleep(900)
    host = { ...host, ports: host.ports.map(p => ({ ...p, product: p.port === 22 ? 'OpenSSH 8.9p1 Ubuntu' : p.port === 80 ? 'nginx 1.24.0' : p.product || null })), os: { name: 'Linux 5.x', accuracy: 93 } }
    emit({ type: 'host:update', host })
    await sleep(300)
    emit({ type: 'done', hosts: [host], ms: Date.now() - t0, stopped: false })
    return [host]
  },

  async stopScan () {
    if (!scanning) return true
    scanning = false
    listeners.forEach(fn => fn({ type: 'done', hosts: HOSTS, ms: 0, stopped: true }))
    return true
  },

  onScanEvent (fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  // Vigilancia simulada: el reloj corre acá, en segundos en vez de minutos.
  watch: {
    async state () { return watchState },
    async configure (patch) {
      const wasEnabled = watchState.enabled
      watchState = { ...watchState, ...patch }
      watchState.cidr = watchState.enabled ? (SCOPES.find(s => s.id === watchState.scopeId) || SCOPES[0]).cidr : null
      clearTimeout(watchTimer)
      if (watchState.enabled) {
        watchState.nextRun = Date.now() + watchState.intervalMin * 60000
        // Como el real: recién encendida barre ya; un cambio de intervalo solo reprograma.
        if (!wasEnabled) watchTimer = setTimeout(() => window.beacon.watch.now(), 1500)
      } else {
        watchState.nextRun = null
      }
      watchEmit()
      return watchState
    },
    async now () {
      if (!watchState.enabled || watchState.running) return watchState
      watchState = { ...watchState, running: true, nextRun: null }
      watchEmit()
      const hosts = await window.beacon.startScan('who', null, { watch: true })
      watchState = { ...watchState, running: false, lastRun: Date.now(), lastCount: hosts.length, nextRun: Date.now() + watchState.intervalMin * 60000 }
      watchEmit()
      return watchState
    },
    onState (fn) { watchListeners.add(fn); return () => watchListeners.delete(fn) }
  },

  openExternal (url) { window.open(url, '_blank', 'noopener') },

  // Rango a mano simulado: valida lo básico y arma un scope parecido al real.
  async customScope (text) {
    const t = String(text).trim().replace(/\s+/g, '')
    const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2})|-(\d{1,3}))?$/.exec(t)
    if (!m) throw new Error(`No entiendo «${t}». Probá 10.0.0.0/24, 192.168.1.1-50 o una IP.`)
    const count = m[2] ? 2 ** (32 - Number(m[2])) - 2 : m[3] ? Number(m[3]) - Number(m[1].split('.')[3]) + 1 : 1
    if (count > 4096) throw new Error(`Son ${count.toLocaleString('es')} direcciones y el tope es 4096 (un /20). Achicá el rango.`)
    if (count < 1) throw new Error('El rango está al revés: el final es menor que el inicio.')
    return { id: `custom::${t}`, iface: t.startsWith('192.168.1.') ? 'Ethernet' : 'A mano', label: 'A mano', kind: 'custom', custom: true,
      text: t, cidr: t, nmapTarget: t, hostCount: count, sweepable: true, address: null, gateway: null }
  },

  // Exportar simulado: descarga el archivo desde el navegador; el PNG no se puede.
  async exportSave ({ kind, suggestedName, data }) {
    if (kind === 'png') throw new Error('en el navegador no hay captura del radar (solo en la app)')
    const blob = new Blob([data], { type: kind === 'json' ? 'application/json' : 'text/csv' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: suggestedName })
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    return { path: `C:\\Users\\vos\\Downloads\\${suggestedName}` }
  },
  async showInFolder () { return true },

  async wake (mac) { await sleep(200); return { mac, targets: ['192.168.1.255', '255.255.255.255'] } },

  // Ping simulado: alrededor de la latencia del host, con algún corte de vez en cuando.
  ping: {
    start (ip) {
      this.stop()
      const base = (HOSTS.find(h => h.ip === ip)?.latency ?? 20) + 1
      pingTimer = setInterval(() => {
        const ms = Math.random() < 0.08 ? null : Math.max(0, Math.round(base + (Math.random() - 0.4) * base))
        pingListeners.forEach(fn => fn({ ip, ms, at: Date.now() }))
      }, 1000)
      return true
    },
    stop () { clearInterval(pingTimer); pingTimer = null; return true },
    onSample (fn) { pingListeners.add(fn); return () => pingListeners.delete(fn) }
  },

  async setAlias (key, alias) {
    aliases[key] = alias?.trim() || null
    return aliases[key]
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
