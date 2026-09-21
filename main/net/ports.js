/**
 * El corazón del "más fácil de entender": qué es cada puerto, dicho como se lo
 * explicarías a alguien parado al lado tuyo.
 *
 * `risk` es el riesgo *en una LAN doméstica*, no en un servidor expuesto:
 *   ok    — normal que esté abierto, no mires más
 *   watch — tiene sentido, pero conviene saber que está ahí
 *   warn  — protocolo sin cifrar o superficie de ataque conocida
 */
export const PORT_NOTES = {
  21:   { name: 'FTP',        what: 'Transferencia de archivos a la vieja usanza. Manda la contraseña en texto plano.', risk: 'warn' },
  22:   { name: 'SSH',        what: 'Consola remota cifrada. Normal en Linux, NAS y routers.', risk: 'ok' },
  23:   { name: 'Telnet',     what: 'Consola remota SIN cifrado. Todo viaja legible, contraseña incluida.', risk: 'warn' },
  25:   { name: 'SMTP',       what: 'Envío de correo.', risk: 'watch' },
  53:   { name: 'DNS',        what: 'Traduce nombres a IPs. Casi siempre es tu router o un Pi-hole.', risk: 'ok' },
  80:   { name: 'HTTP',       what: 'Web sin cifrar. En la LAN suele ser el panel de configuración del aparato.', risk: 'ok' },
  110:  { name: 'POP3',       what: 'Lectura de correo, versión vieja y sin cifrar.', risk: 'warn' },
  111:  { name: 'RPCbind',    what: 'Directorio de servicios RPC, típico de NFS en Linux.', risk: 'watch' },
  135:  { name: 'MSRPC',      what: 'Llamadas remotas de Windows. Normal en cualquier Windows de la red.', risk: 'watch' },
  139:  { name: 'NetBIOS',    what: 'Compartir archivos de Windows, versión antigua.', risk: 'watch' },
  143:  { name: 'IMAP',       what: 'Lectura de correo sin cifrar.', risk: 'warn' },
  443:  { name: 'HTTPS',      what: 'Web cifrada. El panel del aparato, bien hecho.', risk: 'ok' },
  445:  { name: 'SMB',        what: 'Compartir archivos e impresoras de Windows. Normal adentro de tu LAN; grave si estuviera expuesto a internet.', risk: 'watch' },
  515:  { name: 'LPD',        what: 'Cola de impresión. Estás mirando una impresora.', risk: 'ok' },
  548:  { name: 'AFP',        what: 'Compartir archivos de Apple. Un Mac o un NAS.', risk: 'ok' },
  554:  { name: 'RTSP',       what: 'Streaming de video en vivo. Casi seguro es una cámara IP.', risk: 'watch' },
  631:  { name: 'IPP',        what: 'Impresión por internet. Una impresora o un servidor CUPS.', risk: 'ok' },
  993:  { name: 'IMAPS',      what: 'Lectura de correo, cifrada.', risk: 'ok' },
  1883: { name: 'MQTT',       what: 'Mensajería de domótica. Home Assistant, ESPHome y compañía.', risk: 'ok' },
  1900: { name: 'UPnP',       what: 'Descubrimiento automático de dispositivos. Smart TVs, consolas, Chromecast.', risk: 'watch' },
  3306: { name: 'MySQL',      what: 'Base de datos. Si no la pusiste vos, preguntate quién.', risk: 'warn' },
  3389: { name: 'RDP',        what: 'Escritorio remoto de Windows. Comodísimo, y el favorito de los ataques por fuerza bruta.', risk: 'warn' },
  5000: { name: 'UPnP/API',   what: 'Puerto multiuso: Synology, UPnP, o una API casera.', risk: 'watch' },
  5353: { name: 'mDNS',       what: 'Nombres .local. Así se anuncian Chromecast, impresoras y Apple.', risk: 'ok' },
  5432: { name: 'PostgreSQL', what: 'Base de datos.', risk: 'warn' },
  5900: { name: 'VNC',        what: 'Escritorio remoto. Muchas veces queda sin contraseña.', risk: 'warn' },
  6379: { name: 'Redis',      what: 'Base de datos en memoria. Por defecto viene SIN autenticación.', risk: 'warn' },
  8006: { name: 'Proxmox',    what: 'Panel de Proxmox, el hipervisor.', risk: 'ok' },
  8080: { name: 'HTTP alt',   what: 'Web en puerto alternativo. Paneles, proxies, apps caseras.', risk: 'ok' },
  8123: { name: 'Home Assistant', what: 'El panel de Home Assistant.', risk: 'ok' },
  8443: { name: 'HTTPS alt',  what: 'Web cifrada en puerto alternativo.', risk: 'ok' },
  9100: { name: 'JetDirect',  what: 'Impresión cruda de HP. Es una impresora de red.', risk: 'ok' },
  11434:{ name: 'Ollama',     what: 'API de Ollama sirviendo modelos locales.', risk: 'watch' },
  27017:{ name: 'MongoDB',    what: 'Base de datos. Históricamente se filtró por venir abierta sin clave.', risk: 'warn' },
  32400:{ name: 'Plex',       what: 'Servidor de medios Plex.', risk: 'ok' }
}

/** Los puertos que se usan para tocar la puerta: cubren casi todo lo que vive en una LAN. */
export const PROBE_PORTS = [80, 443, 22, 445, 139, 135, 3389, 8080, 53, 5000, 631, 9100, 1883, 8123]

export function describePort (port, serviceHint) {
  const known = PORT_NOTES[port]
  if (known) return { port, ...known }
  return {
    port,
    name: serviceHint || `puerto ${port}`,
    what: serviceHint
      ? `Servicio "${serviceHint}". No está en el catálogo de Beacon todavía.`
      : 'Servicio no identificado. Si no sabés qué es, vale la pena averiguarlo.',
    risk: 'watch'
  }
}
