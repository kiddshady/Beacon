import { afterExit } from './ui.js'

/**
 * El menú del click derecho en los campos de texto.
 *
 * Electron no trae menú contextual en los campos, y sin esto el click derecho
 * en el filtro, en «Otro rango» o en el nombre de un aparato no hacía nada: no
 * se podía pegar un rango con el mouse. Es el de Chrome (deshacer, cortar,
 * copiar, pegar, suprimir, seleccionar todo), dibujado por nosotros, cada uno
 * apagado cuando no se puede. Viene de Opal (FieldMenu + Menu.showAt).
 *
 * Lo que lo hace andar:
 * - El menú no se lleva el foco (como uno nativo): cada acción cae sobre el
 *   campo con su selección intacta, y los campos que se cierran al perder el
 *   foco (renombrar, el rango a mano) siguen abiertos.
 * - Las teclas que usa no siguen de largo: las flechas no mueven el cursor
 *   del campo, y el Enter que elige un ítem no confirma el campo de atrás.
 * - Pegar lee el portapapeles por el proceso principal: desde la página,
 *   leerlo pide un permiso.
 */

const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', 'password'])
const EDGE = 8

let open = null

function fieldOf (target) {
  const el = target?.closest?.('input, textarea')
  if (!el || (el.tagName === 'INPUT' && !TEXT_TYPES.has(el.type))) return null
  return el
}

const exec = (cmd, value) => document.execCommand(cmd, false, value)
const readClip = () => Promise.resolve(window.beacon?.paste?.() ?? navigator.clipboard.readText()).catch(() => '')

function close () {
  if (!open) return
  const { el } = open
  open = null
  window.removeEventListener('keydown', onKey, true)
  document.removeEventListener('pointerdown', onOutside, true)
  window.removeEventListener('blur', close)
  window.removeEventListener('resize', close)
  window.removeEventListener('scroll', onScroll, true)
  el.classList.add('closing')
  afterExit(el, () => el.remove(), { ms: 200 })
}

// Lo de atrás que se desplaza deja al menú sin su lugar; el menú que se desplaza a sí mismo, no.
function onScroll (e) {
  if (open && !open.el.contains(e.target)) close()
}

function onOutside (e) {
  if (open && !open.el.contains(e.target)) close()
}

function move (dir) {
  const items = [...open.el.querySelectorAll('.menu-item:not(:disabled)')]
  if (!items.length) return
  const i = items.findIndex(b => b.classList.contains('is-active'))
  items.forEach(b => b.classList.remove('is-active'))
  const next = items[(i + dir + items.length) % items.length]
  next.classList.add('is-active')
  next.scrollIntoView({ block: 'nearest' })
}

/* Las teclas que usa el menú son suyas: con el foco todavía en el campo, las
   flechas moverían su cursor y un Enter lo confirmaría (el rango a mano se
   escanearía). Escape cierra el menú y nada más. */
function onKey (e) {
  if (!open) return
  const mine = { Escape: () => close(), ArrowDown: () => move(1), ArrowUp: () => move(-1), Enter: () => open.el.querySelector('.menu-item.is-active')?.click() }[e.key]
  if (mine) {
    e.preventDefault()
    e.stopImmediatePropagation()
    mine()
  } else if (e.key !== 'Shift' && e.key !== 'Control' && e.key !== 'Alt') {
    close()   // cualquier otra tecla es seguir escribiendo
  }
}

/** Un menú en un punto de la ventana. items: { label, key, disabled, onSelect } | { sep: true } */
export function showMenuAt (x, y, items) {
  if (open) { const { el } = open; open = null; el.classList.add('closing'); afterExit(el, () => el.remove(), { ms: 200 }) }

  const el = document.createElement('div')
  el.className = 'menu'
  el.setAttribute('role', 'menu')
  for (const it of items) {
    if (it.sep) {
      const sep = document.createElement('div')
      sep.className = 'menu-sep'
      el.append(sep)
      continue
    }
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'menu-item'
    b.setAttribute('role', 'menuitem')
    b.disabled = !!it.disabled
    b.innerHTML = '<span class="menu-label"></span>' + (it.key ? '<span class="menu-key"></span>' : '')
    b.querySelector('.menu-label').textContent = it.label
    if (it.key) b.querySelector('.menu-key').textContent = it.key
    // No se lleva el foco: el campo conserva su selección y no se cierra.
    b.addEventListener('mousedown', e => e.preventDefault())
    b.addEventListener('click', () => { close(); it.onSelect?.() })
    b.addEventListener('pointerenter', () => {
      el.querySelectorAll('.is-active').forEach(o => o.classList.remove('is-active'))
      if (!b.disabled) b.classList.add('is-active')
    })
    el.append(b)
  }
  document.body.append(el)

  /* Abre en el cursor, hacia abajo; si abajo no entra y arriba hay más lugar,
     hacia arriba. El alto es el lugar que hay de ese lado: si igual no entra,
     se desplaza. Se mide con el tamaño de layout, no el de la animación. */
  const w = el.offsetWidth
  const h = el.offsetHeight
  const below = window.innerHeight - y - EDGE
  const above = y - EDGE
  const up = h > below && above > below
  const room = Math.max(80, up ? above : below)
  if (h > room) el.style.maxHeight = `${Math.floor(room)}px`
  const top = up ? y - Math.min(h, room) : y
  const left = Math.max(EDGE, Math.min(x, window.innerWidth - w - EDGE))
  el.style.left = `${Math.round(left)}px`
  el.style.top = `${Math.round(top)}px`
  el.style.transformOrigin = `${x - left}px ${up ? '100%' : '0'}`

  open = { el }
  window.addEventListener('keydown', onKey, true)
  document.addEventListener('pointerdown', onOutside, true)
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)
  window.addEventListener('scroll', onScroll, true)
  return { close }
}

async function openFor (field, x, y) {
  const ro = field.readOnly || field.disabled
  const secret = field.type === 'password'
  const hasSel = field.selectionEnd > field.selectionStart
  const all = !!field.value && field.selectionStart === 0 && field.selectionEnd === field.value.length
  const canUndo = !ro && document.queryCommandEnabled('undo')
  const clip = await readClip()
  return showMenuAt(x, y, [
    { label: 'Deshacer', key: 'Ctrl Z', disabled: !canUndo, onSelect: () => exec('undo') },
    { sep: true },
    { label: 'Cortar', key: 'Ctrl X', disabled: ro || secret || !hasSel, onSelect: () => exec('cut') },
    { label: 'Copiar', key: 'Ctrl C', disabled: secret || !hasSel, onSelect: () => exec('copy') },
    // Se vuelve a leer al elegir: lo copiado pudo cambiar con el menú abierto.
    { label: 'Pegar', key: 'Ctrl V', disabled: ro || !clip, onSelect: async () => { field.focus(); exec('insertText', (await readClip()) || clip) } },
    { label: 'Suprimir', disabled: ro || !hasSel, onSelect: () => exec('delete') },
    { sep: true },
    { label: 'Seleccionar todo', key: 'Ctrl A', disabled: !field.value || all, onSelect: () => field.select() }
  ])
}

/** Lo prende para toda la app. Un campo que quiera otro menú hace preventDefault antes. */
export function installFieldMenu (root = document) {
  root.addEventListener('contextmenu', e => {
    const field = !e.defaultPrevented && fieldOf(e.target)
    if (!field) return
    e.preventDefault()
    openFor(field, e.clientX, e.clientY)
  })
}
