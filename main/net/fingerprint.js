/**
 * Adivina QUÉ es cada cosa, para que la lista diga "Impresora HP" en vez de
 * "192.168.1.87 · 9100/tcp abierto".
 *
 * No hay magia: fabricante + puertos abiertos + nombre alcanzan para acertar
 * la enorme mayoría de los aparatos de una casa.
 */

const VENDOR_HINTS = [
  [/espressif|tuya|shelly|sonoff|tasmota|earda|lumi|aqara|broadlink|yeelight|sengled/i, 'iot'],
  [/raspberry/i,                                          'sbc'],
  [/hewlett|hp inc|brother|epson|canon|lexmark|kyocera/i, 'printer'],
  [/synology|qnap|western digital|seagate/i,              'nas'],
  [/tp-link|netgear|d-link|ubiquiti|mikrotik|zyxel|asustek|technicolor|arris|huawei tech/i, 'router'],
  [/hikvision|dahua|reolink|amcrest|wyze/i,               'camera'],
  [/apple/i,                                              'apple'],
  [/samsung|xiaomi|oneplus|motorola|oppo|vivo|realme|fossibot/i, 'phone'],
  [/roku|amazon tech|google|chromecast|sonos|lg elec|vizio/i,    'media'],
  [/intel|realtek|asrock|gigabyte|micro-star|dell|lenovo/i,      'pc'],
  [/virtualbox|vmware|microsoft.*hyper|parallels/i,       'virtual'],
  [/nintendo|sony interactive|microsoft corporation/i,    'console']
]

const PORT_HINTS = [
  [[9100, 515, 631], 'printer'],
  [[554],            'camera'],
  [[8123, 1883],     'iot'],
  [[548, 5000, 32400], 'nas'],
  [[3389, 445, 135], 'pc'],
  [[8006],           'server']
]

export const DEVICE_LABELS = {
  router:  'Router',
  printer: 'Impresora',
  camera:  'Cámara IP',
  nas:     'NAS',
  phone:   'Teléfono',
  apple:   'Dispositivo Apple',
  media:   'Reproductor / TV',
  console: 'Consola',
  iot:     'Domótica',
  sbc:     'Placa (Pi / SBC)',
  pc:      'Computadora',
  server:  'Servidor',
  virtual: 'Máquina virtual',
  self:    'Esta máquina',
  unknown: 'Sin identificar'
}

/**
 * @param {{ip:string, mac?:string|null, vendor?:string|null, name?:string|null,
 *           ports?:Array<{port:number}>, isGateway?:boolean, isSelf?:boolean}} host
 */
export function fingerprint (host) {
  if (host.isSelf) return 'self'
  if (host.isGateway) return 'router'

  const openPorts = (host.ports || []).map(p => p.port)
  const haystack = `${host.vendor || ''} ${host.name || ''}`

  for (const [ports, kind] of PORT_HINTS) {
    if (ports.some(p => openPorts.includes(p))) return kind
  }
  for (const [re, kind] of VENDOR_HINTS) {
    if (re.test(haystack)) return kind
  }

  // Quien aleatoriza su MAC y no expone nada es, casi siempre, un celular:
  // es la única familia de aparatos que hace las dos cosas por defecto.
  if (host.vendorNote?.includes('aleatoria') && !openPorts.length) return 'phone'

  return 'unknown'
}

/** El nombre que se muestra en el radar: lo más específico que tengamos. */
export function displayName (host) {
  // "Esta máquina" gana siempre: el DNS inverso suele devolver alias inútiles
  // (gateway.docker.internal y compañía) para la propia IP.
  if (host.isSelf) return 'Esta máquina'
  if (host.name) return host.isGateway ? `Router · ${host.name}` : host.name
  if (host.isGateway) return 'Router'
  if (host.vendor) {
    const short = host.vendor.split(/[ ,]/)[0]
    const label = DEVICE_LABELS[host.kind]
    return host.kind && host.kind !== 'unknown' ? `${label} ${short}` : short
  }
  if (host.vendorNote?.includes('aleatoria')) return 'Teléfono (MAC privada)'
  return host.ip
}
