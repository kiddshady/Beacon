/**
 * El panel del comando equivalente.
 *
 * No es decoración: es la parte que hace que usar Beacon te enseñe nmap. Cada flag
 * se arma en vivo mientras tocás botones y viene con su explicación al lado, así
 * que cuando estés en el Kali del celu ya sabés qué escribir.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function renderCommand ({ lineEl, notesEl }, command) {
  if (!command?.full) {
    lineEl.innerHTML = '<span class="bin">nmap</span>'
    notesEl.replaceChildren()
    return
  }

  const { parts, target, degraded = [] } = command

  lineEl.innerHTML = [
    '<span class="bin">nmap</span>',
    ...parts.map(p => `<span class="flag">${esc(p.flag)}</span>`),
    `<span class="target">${esc(target)}</span>`
  ].join(' ')

  notesEl.replaceChildren(...parts.map((p, i) => {
    const note = document.createElement('span')
    note.className = 'note'
    note.style.animationDelay = `${i * 30}ms`
    note.innerHTML = `<b>${esc(p.flag.split(' ')[0])}</b><span>${esc(p.note)}</span>`
    return note
  }))

  if (degraded.length) {
    const warn = document.createElement('span')
    warn.className = 'note degraded'
    warn.style.animationDelay = `${parts.length * 30}ms`
    warn.innerHTML = `<b>sin admin</b><span>${esc(degraded.join(' '))} ` +
      `no está disponible; Beacon usa la alternativa que sí funciona</span>`
    notesEl.appendChild(warn)
  }
}
