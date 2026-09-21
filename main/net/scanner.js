import { hostsOf } from './interfaces.js'
import { readArpTable } from './arp.js'
import { knock, pool } from './probe.js'
import { resolveName, isJunkName } from './names.js'
import { vendorInfo, topPorts, serviceName } from './data.js'
import { describePort, PROBE_PORTS } from './ports.js'
import { fingerprint, displayName } from './fingerprint.js'
import { PRESETS, RISKY_PORTS } from './presets.js'
import { nmapInfo, runNmap, buildCommand } from './nmap.js'

const SWEEP_CONCURRENCY = 128
const PORTSCAN_CONCURRENCY = 64
const SWEEP_TIMEOUT = 500

/**
 * Orquesta un escaneo completo y va contando lo que encuentra mientras lo encuentra.
 *
 * La idea central del descubrimiento sin privilegios: no hace falta ICMP crudo.
 * Basta con intentar una conexión TCP a cada IP de la subred — el sistema operativo
 * emite un ARP request antes de cada intento, y el que conteste queda registrado en
 * la tabla ARP. Después leemos esa tabla y ahí están todos, incluso los que tienen
 * absolutamente todos los puertos cerrados.
 */
export class Scanner {
  constructor ({ preset, target, onEvent }) {
    this.preset = preset
    this.target = target
    this.emit = onEvent
    this.stopped = false
    this.hosts = new Map()
    this.controller = new AbortController()
  }

  stop () {
    this.stopped = true
    this.controller.abort()
  }

  #shouldStop = () => this.stopped

  #upsert (ip, patch) {
    const prev = this.hosts.get(ip) || { ip, ports: [], firstSeen: Date.now() }
    const host = { ...prev, ...patch, ports: patch.ports ?? prev.ports }

    // La latencia hacia uno mismo es 0 por definición: es el punto desde donde se
    // mide todo lo demás. El barrido le mide un número real y hay que descartarlo.
    if (host.isSelf) host.latency = 0

    host.kind = fingerprint(host)
    host.display = displayName(host)
    this.hosts.set(ip, host)
    return host
  }

  async run () {
    const started = Date.now()
    const { preset, target } = this
    const scope = target.scope

    const ips = preset.scope === 'self'
      ? [scope.address]
      : scope.sweepable
        ? hostsOf(scope.network, scope.prefix)
        : []

    this.emit({
      type: 'start',
      total: ips.length,
      cidr: preset.scope === 'self' ? scope.address : scope.cidr,
      preset: preset.id,
      command: buildCommand(preset, preset.scope === 'self' ? scope.address : scope.cidr)
    })

    try {
      await this.#phaseKnownNeighbours(scope)
      if (ips.length) await this.#phaseSweep(ips, scope)
      await this.#phaseArpHarvest(scope)
      await this.#phaseEnrich()
      await this.#phaseLatency()

      if (preset.topPorts > 0) await this.#phasePortScan(preset)
      if (preset.engine === 'nmap') await this.#phaseNmap(preset, scope)
    } catch (err) {
      if (!this.stopped) this.emit({ type: 'error', message: err.message })
    }

    const hosts = [...this.hosts.values()]
    this.emit({ type: 'done', hosts, ms: Date.now() - started, stopped: this.stopped })
    return hosts
  }

  /* ── 1. Lo que el sistema ya sabe, gratis y al instante ───────────────── */

  async #phaseKnownNeighbours (scope) {
    this.emit({ type: 'phase', phase: 'arp', label: 'Leyendo vecinos conocidos' })
    const table = await readArpTable()

    for (const [ip, entry] of table) {
      if (!this.#inScope(ip, scope)) continue
      const host = this.#upsert(ip, {
        mac: entry.mac,
        alive: true,
        via: 'arp',
        isGateway: ip === scope.gateway,
        isSelf: ip === scope.address
      })
      this.emit({ type: 'host', host })
    }

    // Esta máquina siempre está, aunque no figure en su propia tabla ARP.
    const known = this.hosts.has(scope.address)
    const self = this.#upsert(scope.address, {
      mac: scope.mac, alive: true, via: 'self', isSelf: true
    })
    this.emit({ type: known ? 'host:update' : 'host', host: self })
  }

  /* ── 2. El barrido: tocar la puerta de cada IP ────────────────────────── */

  async #phaseSweep (ips, scope) {
    this.emit({ type: 'phase', phase: 'sweep', label: 'Barriendo la subred' })

    const ports = PROBE_PORTS.slice(0, 6)
    const jobs = []
    let done = 0

    for (const ip of ips) {
      jobs.push(async () => {
        if (this.stopped) return
        const results = await Promise.all(ports.map(p => knock(ip, p, SWEEP_TIMEOUT)))
        done++

        const open = results.filter(r => r.state === 'open')
        const refused = results.filter(r => r.state === 'refused')
        const alive = open.length > 0 || refused.length > 0

        this.emit({ type: 'progress', done, total: ips.length, current: ip, alive })

        if (!alive) return

        // El RTT más corto que hayamos visto es la mejor estimación de latencia.
        const latency = Math.min(...[...open, ...refused].map(r => r.ms))
        const host = this.#upsert(ip, {
          alive: true,
          via: 'tcp',
          latency,
          isGateway: ip === scope.gateway,
          isSelf: ip === scope.address,
          ports: open.map(r => describePort(r.port))
        })
        this.emit({ type: 'host', host })
      })
    }

    await pool(jobs, SWEEP_CONCURRENCY, () => {}, this.#shouldStop)
  }

  /* ── 3. Recoger lo que el barrido dejó en la tabla ARP ────────────────── */

  async #phaseArpHarvest (scope) {
    if (this.stopped) return
    this.emit({ type: 'phase', phase: 'harvest', label: 'Recogiendo respuestas de capa 2' })

    const table = await readArpTable()
    for (const [ip, entry] of table) {
      if (!this.#inScope(ip, scope)) continue

      const known = this.hosts.get(ip)
      if (known?.mac) continue

      // Contestó ARP pero rechazó todo por TCP: está vivo y bien cerrado.
      const host = this.#upsert(ip, {
        mac: entry.mac,
        alive: true,
        via: known ? known.via : 'arp',
        isGateway: ip === scope.gateway,
        isSelf: ip === scope.address
      })
      this.emit({ type: known ? 'host:update' : 'host', host })
    }
  }

  /* ── 4. Ponerle nombre y cara a cada uno ──────────────────────────────── */

  async #phaseEnrich () {
    if (this.stopped) return
    const targets = [...this.hosts.values()]
    this.emit({ type: 'phase', phase: 'enrich', label: `Identificando ${targets.length} dispositivos` })

    const jobs = targets.map(h => async () => {
      if (this.stopped) return
      const [vendorData, named] = await Promise.all([
        vendorInfo(h.mac),
        resolveName(h.ip)
      ])
      const host = this.#upsert(h.ip, { ...vendorData, ...named })
      this.emit({ type: 'host:update', host })
    })

    await pool(jobs, 24, () => {}, this.#shouldStop)
  }

  /* ── 4b. Medir la latencia de verdad ──────────────────────────────────── */

  /**
   * La latencia del barrido no sirve para mostrar: se midió con 128 conexiones
   * simultáneas peleándose, así que sale inflada (el router de la LAN daba 90ms).
   * Acá se remide tranquilo, de a pocos y quedándose con el mejor de tres intentos,
   * que es lo que hace cualquier herramienta de ping seria.
   */
  async #phaseLatency () {
    if (this.stopped) return

    const targets = [...this.hosts.values()].filter(h => !h.isSelf && h.ports?.length)
    if (!targets.length) return

    this.emit({ type: 'phase', phase: 'latency', label: 'Midiendo tiempos de respuesta' })

    const jobs = targets.map(h => async () => {
      if (this.stopped) return
      const port = h.ports[0].port
      const tries = []
      for (let i = 0; i < 3; i++) {
        const r = await knock(h.ip, port, 1000)
        if (r.state === 'open' || r.state === 'refused') tries.push(r.ms)
      }
      if (!tries.length) return

      const host = this.#upsert(h.ip, { latency: Math.min(...tries) })
      this.emit({ type: 'host:update', host })
    })

    await pool(jobs, 6, () => {}, this.#shouldStop)
  }

  /* ── 5. Puertos, ahora en serio, solo sobre los que están vivos ───────── */

  async #phasePortScan (preset) {
    if (this.stopped) return

    const list = preset.probePorts === 'risky'
      ? [...new Set([...RISKY_PORTS, ...(await topPorts(preset.topPorts))])]
      : await topPorts(preset.topPorts)

    const targets = [...this.hosts.values()].filter(h => h.alive)
    this.emit({
      type: 'phase',
      phase: 'ports',
      label: `Revisando ${list.length} puertos en ${targets.length} dispositivos`
    })

    for (const h of targets) {
      if (this.stopped) return
      const found = new Map(h.ports.map(p => [p.port, p]))

      const jobs = list.map(port => () => knock(h.ip, port, 900))
      await pool(jobs, PORTSCAN_CONCURRENCY, async (res) => {
        if (res.state !== 'open' || found.has(res.port)) return
        found.set(res.port, describePort(res.port, await serviceName(res.port)))
        const host = this.#upsert(h.ip, {
          ports: [...found.values()].sort((a, b) => a.port - b.port)
        })
        this.emit({ type: 'host:update', host })
      }, this.#shouldStop)
    }
  }

  /* ── 6. nmap, para lo que nosotros no podemos ─────────────────────────── */

  async #phaseNmap (preset, scope) {
    if (this.stopped) return

    const info = await nmapInfo()
    if (!info.available) {
      this.emit({ type: 'notice', message: 'nmap no está instalado: se omite el análisis profundo.' })
      return
    }

    // Apuntar nmap solo a lo que ya sabemos que existe. Sobre el CIDR entero, un
    // -sV contra 254 direcciones muertas tarda horas; sobre 12 vivas, minutos.
    const alive = [...this.hosts.values()].filter(h => h.alive).map(h => h.ip)
    const targets = preset.scope === 'self'
      ? [scope.address]
      : preset.nmapTargets === 'alive' ? alive : [scope.cidr]

    if (!targets.length) return

    const command = buildCommand(preset, targets.join(' '))
    const args = [...command.parts.map(p => p.flag.split(' ')).flat(), '-oX', '-', ...targets]

    // El panel tiene que mostrar el comando que se corre de verdad, no el que
    // habíamos previsto antes de saber quién estaba vivo.
    this.emit({ type: 'command', command })

    this.emit({
      type: 'phase',
      phase: 'nmap',
      label: `nmap: analizando ${targets.length} dispositivo${targets.length > 1 ? 's' : ''} en profundidad` +
        (info.elevated ? '' : ' (sin admin no se puede detectar el sistema operativo)')
    })

    try {
      await runNmap({
        bin: info.bin,
        args,
        signal: this.controller.signal,
        onProgress: pct => this.emit({ type: 'progress', done: pct, total: 100, phase: 'nmap' }),
        onHost: (h) => {
          if (!h.ports.length && !this.hosts.has(h.ip)) return
          const prev = this.hosts.get(h.ip)
          const merged = new Map((prev?.ports || []).map(p => [p.port, p]))

          for (const p of h.ports) {
            const base = describePort(p.port, p.service)
            merged.set(p.port, {
              ...base,
              service: p.service,
              product: [p.product, p.version].filter(Boolean).join(' ') || null
            })
          }

          // nmap resuelve el DNS inverso por su cuenta, y acá el router contesta el
          // PTR con la IP misma. Ese nombre trucho entra por una puerta distinta a
          // resolveName(), así que hay que filtrarlo también acá: si no, le gana al
          // nombre lindo que ya teníamos ("Teléfono Samsung" volvía a ser "192.168.1.4").
          const nmapName = isJunkName(h.name, h.ip) ? null : h.name

          const host = this.#upsert(h.ip, {
            alive: true,
            mac: prev?.mac || h.mac,
            vendor: prev?.vendor || h.vendor,
            name: prev?.name || nmapName,
            os: h.os,
            latency: prev?.latency ?? h.latency,
            ports: [...merged.values()].sort((a, b) => a.port - b.port)
          })
          this.emit({ type: 'host:update', host })
        }
      })
    } catch (err) {
      if (!this.stopped) this.emit({ type: 'notice', message: `nmap: ${err.message}` })
    }
  }

  #inScope (ip, scope) {
    if (this.preset.scope === 'self') return ip === scope.address
    const mask = scope.prefix === 0 ? 0 : (0xffffffff << (32 - scope.prefix)) >>> 0
    const toInt = s => s.split('.').reduce((a, o) => ((a << 8) + (+o)) >>> 0, 0) >>> 0
    return (toInt(ip) & mask) === (toInt(scope.network) & mask)
  }
}
