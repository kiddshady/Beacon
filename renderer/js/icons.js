/**
 * Cada símbolo de Beacon es un SVG de la casa. Ni un emoji, ni un glifo unicode:
 * así se tiñen con currentColor, se animan y se ven idénticos en toda máquina.
 *
 * Todos comparten viewBox 24×24 y trazo de 1.6 para que el peso sea consistente.
 */

const S = (body, opts = {}) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${opts.w || 1.6}" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const ICONS = {
  /* ── Marca y chrome ──────────────────────────────────────────────────── */

  beacon: S(`
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>
    <path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22"/>
    <circle cx="12" cy="12" r="6.5" opacity=".55"/>
    <circle cx="12" cy="12" r="10" opacity=".28"/>`),

  radar: S(`
    <circle cx="12" cy="12" r="9.5" opacity=".35"/>
    <circle cx="12" cy="12" r="5.5" opacity=".55"/>
    <path d="M12 12 20 7.5" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>
    <circle cx="16.5" cy="9" r="1.5" fill="currentColor" stroke="none" opacity=".8"/>`),

  grid: S(`
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/>
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/>
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/>
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>`),

  minimize: S(`<path d="M5 12h14"/>`),
  maximize: S(`<rect x="5" y="5" width="14" height="14" rx="2"/>`),
  close:    S(`<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`),

  play: S(`<path d="M7 4.8v14.4l12-7.2z" fill="currentColor" stroke-linejoin="round"/>`),
  stop: S(`<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>`),

  copy: S(`
    <rect x="9" y="9" width="11" height="11" rx="2"/>
    <path d="M5 15V6a2 2 0 0 1 2-2h8"/>`),

  check: S(`<path d="M4.5 12.5l5 5 10-11" stroke-width="2"/>`),
  back:  S(`<path d="M15 5l-7 7 7 7"/>`),
  edit: S(`
    <path d="M4 20h4l10.5-10.5a1.5 1.5 0 0 0 0-2.1l-1.9-1.9a1.5 1.5 0 0 0-2.1 0L4 16v4z"/>
    <path d="M13.5 6.5l4 4"/>`),

  info: S(`
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 11v5"/>
    <circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none"/>`),

  refresh: S(`
    <path d="M20 12a8 8 0 0 1-13.9 5.4"/>
    <path d="M4 12a8 8 0 0 1 13.9-5.4"/>
    <path d="M17.5 3v4h-4"/>
    <path d="M6.5 21v-4h4"/>`),

  external: S(`
    <path d="M14 5h5v5"/>
    <path d="M19 5l-8 8"/>
    <path d="M18 13.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5"/>`),

  update: S(`
    <path d="M12 4v10"/>
    <path d="M8 10.5l4 4 4-4"/>
    <path d="M5 17.5v1a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-1"/>`),

  alert: S(`
    <path d="M12 8.5v5"/>
    <circle cx="12" cy="16.7" r=".9" fill="currentColor" stroke="none"/>
    <path d="M10.3 3.9 2.5 18a1.9 1.9 0 0 0 1.7 2.9h15.6a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z"/>`),

  /* ── Tipos de dispositivo ────────────────────────────────────────────── */

  router: S(`
    <rect x="2.5" y="13" width="19" height="8" rx="2"/>
    <path d="M6.5 17h.01M10 17h.01"/>
    <circle cx="18" cy="17" r="1" fill="currentColor" stroke="none"/>
    <path d="M8 9.5a5.5 5.5 0 0 1 8 0M10.6 6.4a9 9 0 0 1 2.8 0" opacity=".7"/>`),

  printer: S(`
    <path d="M7 9V4.5h10V9"/>
    <rect x="3" y="9" width="18" height="7.5" rx="2"/>
    <rect x="7" y="14" width="10" height="6" rx="1"/>
    <circle cx="17.5" cy="12" r=".9" fill="currentColor" stroke="none"/>`),

  camera: S(`
    <path d="M3 8.5 15 5v8.5L3 17z" />
    <path d="M15 9h3.5l2.5-2v8l-2.5-2H15"/>
    <path d="M6 17v2.5"/>`),

  nas: S(`
    <rect x="3.5" y="3.5" width="17" height="7" rx="1.8"/>
    <rect x="3.5" y="13.5" width="17" height="7" rx="1.8"/>
    <path d="M7 7h.01M7 17h.01"/>
    <circle cx="17" cy="7" r=".9" fill="currentColor" stroke="none"/>
    <circle cx="17" cy="17" r=".9" fill="currentColor" stroke="none"/>`),

  phone: S(`
    <rect x="6" y="2.5" width="12" height="19" rx="2.5"/>
    <path d="M10.5 5.5h3"/>
    <path d="M10.5 18.5h3" opacity=".6"/>`),

  apple: S(`
    <path d="M15.6 12.4c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.5-1-2.5-3.7Z"/>
    <path d="M13.3 5.3c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2-.5 2.7-1.3Z"/>`),

  media: S(`
    <rect x="2.5" y="4" width="19" height="12.5" rx="2"/>
    <path d="M8 20.5h8"/>
    <path d="M12 16.5v4"/>
    <path d="M10.3 8.4v3.7l3.4-1.85z" fill="currentColor" stroke-linejoin="round"/>`),

  console: S(`
    <path d="M7.5 7.5h9a5.5 5.5 0 0 1 5.4 6.5l-.5 2.8a2.6 2.6 0 0 1-4.6 1.1l-1.6-2.1H8.8l-1.6 2.1a2.6 2.6 0 0 1-4.6-1.1l-.5-2.8A5.5 5.5 0 0 1 7.5 7.5Z"/>
    <path d="M7 11v2.4M5.8 12.2h2.4"/>
    <circle cx="16.5" cy="11.6" r=".9" fill="currentColor" stroke="none"/>
    <circle cx="18.4" cy="13.4" r=".9" fill="currentColor" stroke="none"/>`),

  iot: S(`
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.2"/>
    <rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor" stroke="none"/>
    <path d="M9.5 6.5V3.5M14.5 6.5V3.5M9.5 20.5v-3M14.5 20.5v-3M6.5 9.5h-3M6.5 14.5h-3M20.5 9.5h-3M20.5 14.5h-3"/>`),

  sbc: S(`
    <rect x="3.5" y="5.5" width="17" height="13" rx="2"/>
    <rect x="7.5" y="9.5" width="5.5" height="5" rx="1"/>
    <path d="M16 9.5h2M16 12h2M16 14.5h2"/>`),

  pc: S(`
    <rect x="2.5" y="4.5" width="19" height="12" rx="2"/>
    <path d="M8 20h8M12 16.5V20"/>`),

  server: S(`
    <rect x="3.5" y="3" width="17" height="6" rx="1.6"/>
    <rect x="3.5" y="10.5" width="17" height="6" rx="1.6"/>
    <path d="M7 6h.01M7 13.5h.01M12 20.5h.01"/>
    <path d="M12 16.5v4"/>`),

  virtual: S(`
    <rect x="3" y="4.5" width="13" height="10" rx="2" opacity=".55"/>
    <rect x="8" y="9.5" width="13" height="10" rx="2"/>`),

  self: S(`
    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="7" opacity=".5"/>
    <circle cx="12" cy="12" r="10.5" opacity=".25"/>`),

  unknown: S(`
    <circle cx="12" cy="12" r="9"/>
    <path d="M9.6 9.4a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.5"/>
    <circle cx="12" cy="16.8" r=".9" fill="currentColor" stroke="none"/>`)
}

/** Reemplaza todo [data-icon] del subárbol por su SVG. */
export function paintIcons (root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    const name = el.dataset.icon
    if (!ICONS[name] || el.dataset.painted === name) continue
    el.innerHTML = ICONS[name]
    el.dataset.painted = name
  }
}

export function icon (name) {
  return ICONS[name] || ICONS.unknown
}
