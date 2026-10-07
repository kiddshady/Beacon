/**
 * El panel del comando equivalente.
 *
 * No es decoración: es la parte que hace que usar Beacon te enseñe nmap. Cada flag
 * se arma en vivo mientras tocás botones y viene con su explicación al lado, así
 * que cuando estés en el Kali del celu ya sabés qué escribir.
 *
 * Cambia en su lugar: la línea se releva y las notas se ponen al día por flag
 * (las que siguen se quedan, entran las nuevas y se van las que sobran). Rehechas,
 * todas volvían a entrar con cada preset que tocabas.
 */

import { swap, reconcile } from './motion.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function renderCommand ({ lineEl, notesEl }, command) {
  if (!command?.full) {
    swap(lineEl, '<span class="bin">nmap</span>')
    reconcile(notesEl, [])
    return
  }

  const { parts, target, degraded = [] } = command

  swap(lineEl, [
    '<span class="bin">nmap</span>',
    ...parts.map(p => `<span class="flag">${esc(p.flag)}</span>`),
    `<span class="target">${esc(target)}</span>`
  ].join(' '))

  const notes = parts.map(p => ({
    key: `f:${p.flag}`,
    html: `<span class="note"><b>${esc(p.flag.split(' ')[0])}</b><span>${esc(p.note)}</span></span>`
  }))
  if (degraded.length) {
    notes.push({
      key: 'degraded',
      html: `<span class="note degraded"><b>sin admin</b><span>${esc(degraded.join(' '))} ` +
        `no está disponible; Beacon usa la alternativa que sí funciona</span></span>`
    })
  }
  reconcile(notesEl, notes)
}
