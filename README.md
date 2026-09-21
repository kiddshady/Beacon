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
  store.js           un JSON en userData, escrito de forma atómica
  net/
    interfaces.js    detecta las subredes escaneables
    arp.js           lee la tabla ARP (parsea por regex, no por idioma de Windows)
    probe.js         knock TCP + pool con límite de concurrencia
    names.js         mDNS + NetBIOS + DNS inverso, en paralelo
    data.js          bases OUI y de servicios (las toma de nmap si está)
    ports.js         qué es cada puerto, dicho como se lo explicarías a alguien
    fingerprint.js   adivina el tipo de aparato
    presets.js       los botones
    nmap.js          wrapper con parseo XML en streaming
    scanner.js       orquesta todo y emite hallazgos a medida que aparecen
renderer/
  css/beacon.css     sistema visual (fósforo verde, CRT)
  css/layout.css     estructura
  js/radar.js        el radar
  js/panel.js        lista y detalle
  js/about.js        acerca de: versión, actualizaciones, entorno
  js/ui.js           tooltip, fade del scroll, nombres y fechas
  js/mock.js         puente falso para trabajar la UI sin Electron
```

## Detalles que importan

- **El radar es determinista.** El ángulo sale de la IP y el radio de la latencia, así
  que el mismo aparato vuelve siempre al mismo lugar y podés memorizar tu red de vista.
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
  marca nada como nuevo: no habría con qué comparar.
- **Ponele nombre a las cosas.** En el detalle, el lápiz al lado del título. El alias
  reemplaza al nombre detectado en la lista, el detalle y el radar, y se queda.
- **Radar y lista se hablan.** Pasás el mouse por una tarjeta y su punto se enciende;
  pasás por un punto y su tarjeta se resalta (y se asoma si estaba fuera de vista).

## Scripts

```bash
npm run dev     # vite + electron
npm run ui      # solo el renderer, con datos simulados, en el navegador
npm run smoke   # prueba el motor sin interfaz (acepta un preset: quick, deep…)
npm run oui     # actualiza la base de fabricantes desde el IEEE
npm run icon    # regenera build/icon.png desde la marca de la app
npm run dist    # instalador NSIS en release/, sin publicar
npm run release # instalador + publica el release en GitHub (necesita GH_TOKEN)
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

Para sacar una versión: subí `version` en `package.json`, commiteá, y

```bash
GH_TOKEN=$(gh auth token) npm run release
```

Eso construye el instalador, crea el release en GitHub con el `.exe`, el `.blockmap`
y el `latest.yml` que el updater lee. El tag lo pone electron-builder (`v0.2.0`).

## Pendiente

- Vista de grilla (el botón está, todavía vuelve a la lista).
