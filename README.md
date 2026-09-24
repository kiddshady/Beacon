# Beacon

Radar de red. Descubre qué hay conectado a tu LAN y te lo explica en castellano,
sin que tengas que acordarte de una sola flag de nmap.

```bash
npm run dev
```

## Cómo funciona

**Dos motores, uno invisible.** El descubrimiento rápido lo hace Beacon solo, en
Node, sin privilegios y sin depender de nada instalado. Cuando pedís profundidad,
tira nmap por debajo. Vos nunca elegís motor: tocás un botón y la app decide.

El truco del motor propio: **no hace falta ICMP crudo para descubrir hosts**. Se
intenta una conexión TCP contra cada dirección de la subred, y el sistema operativo
emite un ARP request antes de cada intento. Después se lee la tabla ARP y ahí están
todos — incluso los que tienen absolutamente todos los puertos cerrados, porque a
nivel de enlace igual contestaron. Un /24 entero tarda ~2 segundos.

**nmap corre solo sobre lo que ya se encontró vivo.** Descubrir 254 direcciones nos
cuesta 2 segundos; a nmap con `-sV` le costaría horas. Se lo apunta a la lista de
IPs vivas y baja a minutos.

## Estructura

```
main/
  main.js            ventana, IPC, modo captura
  preload.cjs        puente al renderer
  updater.js         actualizaciones automáticas desde GitHub Releases
  memory.js          qué aparatos vio, en qué red, cuándo, y cómo los llamás vos
  watch.js           vigilancia continua: reloj, bandeja, notificaciones
  settings.js        lo que configuraste (settings.json en userData)
  store.js           un JSON en userData, escrito de forma atómica
  net/
    interfaces.js    detecta las subredes escaneables
    arp.js           lee la tabla ARP (parsea por regex, no por idioma de Windows)
    probe.js         knock TCP + pool con límite de concurrencia
    names.js         mDNS + NetBIOS + DNS inverso, en paralelo
    ssdp.js          UPnP: el nombre y el modelo que el aparato dice tener
    data.js          bases OUI y de servicios (las toma de nmap si está)
    ports.js         qué es cada puerto, dicho como se lo explicarías a alguien
    fingerprint.js   adivina el tipo de aparato
    presets.js       los botones
    nmap.js          wrapper con parseo XML en streaming
    wol.js           el paquete mágico de Wake-on-LAN
    range.js         un rango escrito a mano → scope (10.0.0.0/24, 192.168.1.1-50, una IP)
    ping.js          ping en vivo (ping.exe, con knock TCP de respaldo)
    scanner.js       orquesta todo y emite hallazgos a medida que aparecen
renderer/
  css/beacon.css     sistema visual: vidrio sobre el radar (la física de Opal)
  css/layout.css     el HUD: el radar de fondo y las hojas que flotan encima
  css/fonts.css      la mono de los datos (Roboto Mono, empaquetada)
  js/radar.js        el radar
  js/panel.js        lista y detalle
  js/about.js        acerca de: versión, actualizaciones, entorno
  js/watch.js        el popover de vigilancia
  js/export.js       exportar: JSON, CSV (con ; y BOM, para Excel) o PNG del radar
  js/history.js      historial: cómo estaba la red cada vez que se la escaneó
  js/ui.js           tooltip, fade del scroll, nombres y fechas
  js/mock.js         puente falso para trabajar la UI sin Electron
```

## Detalles que importan

- **El radar es determinista.** El ángulo sale de la IP y el radio de la latencia, así
  que el mismo aparato vuelve siempre al mismo lugar y podés memorizar tu red de vista.
- **El radar cuenta algo, no solo ubica.** Un anillo fino alrededor del punto crece
  con los puertos abiertos (más grande, más expuesto) y se pone ámbar si alguno es
  riesgoso; el punteado marca al que no estaba la última vez; dos ondas al aparecer.
  La leyenda de abajo dice solo lo que hay en pantalla.
- **Los aparatos que se presentan solos.** Un M-SEARCH de UPnP por multicast (desde
  cada interfaz, que con VirtualBox o WSL el "default" engaña) y otro directo a cada
  vivo; el que contesta entrega su ficha con el nombre que le puso la persona y el
  modelo. Ese nombre le gana a NetBIOS y al DNS inverso (no al mDNS) y el tipo UPnP
  (MediaRenderer, Printer, InternetGatewayDevice…) manda sobre las demás pistas.
  Teles, reproductores, consolas, NAS, impresoras y routers hablan UPnP; los Tuya y
  compañía no — a esos se los bautiza a mano.
- **Los hosts aparecen cuando el barrido les pasa por encima**, no cuando se descubren.
  Milisegundos de mentira piadosa que convierten una lista que se llena en algo que
  se siente como detectar.
- **MAC aleatorias.** Android e iOS aleatorizan su MAC por privacidad. Beacon lo detecta
  (bit "administrada localmente") y lo dice, en vez de mentir con "fabricante desconocido".
- **El panel del comando enseña nmap.** Cada flag se arma en vivo con su explicación,
  y cuando algo no se puede hacer sin admin, lo dice y muestra con qué lo reemplaza.
- **Beacon se acuerda de tu red.** Cada escaneo completo queda guardado
  (`%APPDATA%/beacon/memory.json`). El siguiente marca quién es **nuevo**, quién
  **no contestó** respecto de la vez anterior (aparece apagado al final de la lista)
  y quién **cambió de IP**. La identidad es la MAC; los teléfonos con MAC aleatoria
  la mantienen por red, así que igual se reconocen. El primer escaneo de una red no
  marca nada como nuevo: no habría con qué comparar. También se acuerda de qué
  **puertos** le vio abiertos a cada aparato: uno que nunca le vio es "puerto nuevo",
  en el aviso, en el detalle y en la vigilancia (te avisa "al NAS se le abrió el 22").
- **Historial.** El reloj en la cabecera del panel: los últimos 40 escaneos completos
  de esta red — cuándo, con qué preset, cuántos aparatos, qué cambió — y cada fila se
  despliega para ver quiénes estaban.
- **Ponele nombre a las cosas.** En el detalle, el lápiz al lado del título. El alias
  reemplaza al nombre detectado en la lista, el detalle y el radar, y se queda.
- **Radar y lista se hablan.** Pasás el mouse por una tarjeta y su punto se enciende;
  pasás por un punto y su tarjeta se resalta (y se asoma si estaba fuera de vista).
- **Lista o grilla, y un filtro.** El botón arriba a la derecha del panel (o `G`)
  cambia entre lista y grilla de dos columnas; se recuerda. El filtro aparece cuando
  hay algo que filtrar y busca en nombre, alias, IP, MAC, fabricante y puertos
  (número o nombre); cada palabra tiene que aparecer, en cualquier orden.
- **Profundizar en uno solo.** Desde el detalle, **Profundizar** corre el escaneo
  profundo (200 puertos y, con nmap, versión de cada servicio y sistema operativo)
  contra ese aparato nada más, sin borrar lo que ya está en pantalla: los hallazgos se
  funden en su tarjeta a medida que llegan, el anillo del radar crece, y el pie muestra
  el comando nmap de ese solo host. Anotado con la memoria (alias, historial) pero sin
  guardar: no es una foto de la red.
- **El detalle hace cosas.** **Abrir panel** lleva al web del aparato si tiene un
  puerto típico abierto (443, 80, 8080, 5000 del Synology, 8123 de Home Assistant…);
  cada puerto web de la lista tiene también su flechita. **Despertar** manda el
  paquete mágico de Wake-on-LAN al broadcast de la subred y al general. Y la
  **latencia en vivo**: un ping por segundo (con `ping.exe`, que no necesita admin y
  llega a los teléfonos donde el TCP se muere) con sparkline y mín/med/máx; los que no
  contestan se marcan en ámbar. Se corta al volver a la lista o esconder la ventana.
- **Otra red, a mano.** El último chip del selector de redes se vuelve un campo:
  una subred (`10.0.0.0/24`), un rango (`192.168.1.1-50` o `192.168.1.1-192.168.2.20`)
  o una sola IP, hasta 4096 direcciones. Si cae adentro de una red local, hereda su
  interfaz para que "Esta máquina" y el router se sigan reconociendo. Se recuerda el
  último.
- **Exportar.** El botón de descarga en la cabecera del panel: **JSON** con todo
  (alias, puertos con explicación, memoria), **CSV** de una fila por aparato — con
  punto y coma y BOM, que es lo que Excel en castellano abre bien —, o un **PNG del
  radar** tal como se ve. Va a Descargas con nombre `beacon-<red>-<fecha>`.
- **Vigilancia continua.** El botón **Vigilar** de la barra: cada 5, 15, 30 o 60
  minutos Beacon repite el barrido liviano (ARP + knock, dos segundos, sin puertos)
  sobre la red elegida y, si aparece alguien que la memoria no conocía, avisa con una
  notificación del sistema. Mientras está activa hay un ícono en la bandeja (abrir,
  barrer ahora, cambiar el intervalo, dejar de vigilar, salir) y **cerrar la ventana
  la esconde ahí** en vez de cerrar la app. Al volver de suspensión barre a los 30 s.
  Los barridos se ven en la ventana como un escaneo normal; un escaneo a mano en curso
  nunca se interrumpe (el vigilante reintenta al minuto). En el popover elegís qué red
  vigilar (las detectadas o el rango a mano) y, en la app instalada, **arrancar con
  Windows** escondida en la bandeja para que la vigilancia sobreviva a un reinicio.
- **Atajos.** `Ctrl+Enter` escanea o detiene, `1`–`4` eligen qué escanear, `/` va al
  filtro, `G` cambia la vista, `Esc` hace lo más cercano (sale del campo, vuelve
  del detalle, detiene, limpia el filtro) y `Ctrl+,` abre Acerca de, donde están
  todos listados.

## Scripts

```bash
npm run dev     # vite + electron
npm run ui      # solo el renderer, con datos simulados, en el navegador
npm run smoke   # prueba el motor sin interfaz (acepta un preset: quick, deep…)
npm run oui     # actualiza la base de fabricantes desde el IEEE
npm run icon    # regenera build/icon.png desde la marca de la app
npm run dist    # instalador NSIS en release/, sin publicar
npm run release # instalador + release en GitHub, verificado (ver Actualizaciones)
```

Para capturar la app corriendo un escaneo real:

```bash
BEACON_CAPTURE=salida.png BEACON_CAPTURE_PRESET="Escaneo rápido" npx electron .
```

## La base de fabricantes

Beacon trae su propia base, bajada de los tres registros del IEEE: MA-L (bloques de
24 bits), MA-M (28) y MA-S (36). Son **53.307 fabricantes** contra los 26.354 que
traía nmap 7.80, y esos 27.000 de diferencia son justo los fabricantes chicos —
domótica, placas, aparatos que no son de marca grande.

```bash
npm run oui     # vuelve a bajarla y regenera data/oui.txt
```

El lookup prueba de más específico a más general (9 → 7 → 6 dígitos): un bloque
MA-S pertenece a una empresa chica que comparte los primeros 6 dígitos con el
mayorista que se lo vendió, así que buscar al revés devolvería siempre al mayorista.

## Actualizaciones

La app empaquetada consulta los releases de `kiddshady/Beacon` unos segundos después
de abrir, baja la versión nueva en silencio y avisa recién cuando ya está lista, con
un botón para reiniciar. Si no lo tocás, se instala sola al cerrar. En desarrollo no
busca nada. Para buscar a mano o ver en qué anda: el botón de información en la barra
de título (Acerca de).

Para sacar una versión:

```bash
npm version minor            # o patch: sube package.json y crea el tag
git push origin main --follow-tags
npm run release              # o: npm run release -- --notas notas.md
```

`scripts/release.mjs` crea el borrador en GitHub **antes** de compilar (electron-builder
26 tiene una carrera que, si no, crea dos releases con el mismo tag), construye el
instalador, sube el `.exe`, el `.blockmap` y el `latest.yml` que el updater lee,
verifica que los tres estén con su tamaño exacto, y recién ahí lo publica. Si algo
falla, queda en borrador y nadie lo ve. `--ensayo` recorre todo con una versión de
prueba y borra el borrador al final.

## Pendiente

- Nada pendiente de las dos hornadas. Lo que se me ocurre para después: avisar por
  Telegram, IPv6, un modo "solo bandeja" sin ventana al arrancar la app a mano.
