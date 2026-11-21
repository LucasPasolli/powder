// src/components/ui/MenuAcciones.jsx
// Botón de menú ("Menu Button" de WAI-ARIA APG) para agrupar acciones de uso
// ocasional y descargar el ruido visual de las barras de acciones.
//
// COMPORTAMIENTO POR BREAKPOINT (fuente única: useBreakpoint)
//   · desktop (> 1024 px)   : popover anclado debajo del botón, alineado a su borde
//                             derecho; si no entra se abre hacia arriba o scrollea por
//                             dentro (ver lib/posicionMenu.js).
//   · tablet / mobile       : bottom sheet con scrim y margen lateral (objetivos táctiles
//                             de 48 px, safe-area, scroll interno con dvh).
//
// DECISIÓN CLAVE — AMBOS formatos se renderizan en un portal (document.body)
//   El header de la página usa `animate-slide-up` (transform + fill-mode forwards): crea
//   un stacking context PERMANENTE. Un popover `absolute z-50` dentro de él queda
//   atrapado y los filtros/banner/tarjetas posteriores se pintan encima (el bug original).
//   Un `fixed` dentro de un ancestro con transform tampoco se ancla al viewport. En un
//   portal el menú compite en el contexto raíz, con z-index por encima de la página.
//
// ACCESIBILIDAD (WCAG 2.1 AA)
//   · Botón: aria-haspopup="menu", aria-expanded, aria-controls.
//   · Teclado: Enter/Espacio/↓ abren (↑ abre en el último), ↑↓ Home End navegan con
//     wrap, Esc cierra y devuelve el foco al botón, Tab cierra.
//   · Clic fuera cierra y devuelve el foco al botón SALVO que el clic haya enfocado otro
//     control (no se le roba el foco al campo que el usuario eligió).
//   · Al elegir un ítem el foco vuelve al botón ANTES de ejecutar la acción, así el
//     modal que abra la acción lo restaura al cerrarse.
//   · Descripciones y títulos en surface-200: 6.9:1 sobre surface-800 y 6.2:1 sobre surface-700 (hover).
//     surface-300 (3.7:1) y surface-400 (2.2:1) NO cumplen 4.5:1 sobre estas superficies.
//   · Animaciones desactivadas con prefers-reduced-motion (ver index.css).
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { usePosicionMenu } from '../../hooks/usePosicionMenu'
import { indiceSiguiente, TECLAS_NAVEGACION } from '../../lib/menuNavegacion'

/**
 * @typedef {object} ItemMenu
 * @property {string} id
 * @property {string} label
 * @property {string} [descripcion]  Línea corta que aclara el efecto de la acción.
 * @property {React.ComponentType<{size?:number,className?:string,'aria-hidden'?:boolean}>} [icon]
 * @property {() => void} onSelect
 *
 * @typedef {object} GrupoMenu
 * @property {string} id
 * @property {string} titulo
 * @property {ItemMenu[]} items
 */

/**
 * @param {object} props
 * @param {string} props.etiqueta          Texto visible del botón.
 * @param {string} [props.ariaLabel]       Nombre accesible si difiere del texto.
 * @param {GrupoMenu[]} props.grupos
 * @param {string} [props.className]       Clases del contenedor (layout del padre).
 */
export default function MenuAcciones({ etiqueta, ariaLabel, grupos, className = '' }) {
  const { isCompact } = useBreakpoint()
  const [abierto, setAbierto] = useState(false)

  const botonId = useId()
  const menuId = useId()
  const wrapperRef = useRef(null)
  const botonRef = useRef(null)
  const panelRef = useRef(null)
  const itemsRef = useRef([])
  const focoInicialRef = useRef('primero')

  const items = () => itemsRef.current.filter(Boolean)

  const cerrar = useCallback(({ devolverFoco = true } = {}) => {
    setAbierto(false)
    if (devolverFoco) botonRef.current?.focus()
  }, [])

  const abrir = (foco) => {
    focoInicialRef.current = foco
    setAbierto(true)
  }

  // Desktop: el panel (portal) se ancla al botón con `position: fixed`.
  usePosicionMenu({ activo: abierto && !isCompact, anclaRef: botonRef, panelRef })

  // Foco inicial al abrir.
  useEffect(() => {
    if (!abierto) return
    const lista = items()
    const destino = focoInicialRef.current === 'ultimo' ? lista[lista.length - 1] : lista[0]
    destino?.focus({ preventScroll: true })
  }, [abierto])

  // Rotar o redimensionar cruzando un breakpoint cambia el formato: se cierra.
  useEffect(() => { setAbierto(false) }, [isCompact])

  // Esc cierra desde cualquier foco (también si el usuario hizo clic en una zona no
  // enfocable del panel, caso en que el evento no pasaría por el panel).
  useEffect(() => {
    if (!abierto) return undefined
    const alTeclear = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      cerrar()
    }
    document.addEventListener('keydown', alTeclear, true)
    return () => document.removeEventListener('keydown', alTeclear, true)
  }, [abierto, cerrar])

  // Desktop: clic/toque fuera cierra. En compact lo resuelve el scrim (evita el
  // "clic fantasma" que cae sobre el elemento de abajo al desmontarse el scrim).
  // El panel vive en un portal: ya no es descendiente del wrapper, hay que excluirlo aparte.
  useEffect(() => {
    if (!abierto || isCompact) return undefined
    const fuera = (e) => {
      if (wrapperRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      cerrar({ devolverFoco: false })
      // El foco vuelve al botón, salvo que el clic haya enfocado otro control (el foco
      // se asigna en `mousedown`, posterior a `pointerdown`; por eso se espera un frame).
      requestAnimationFrame(() => {
        const activo = document.activeElement
        if (!activo || activo === document.body) botonRef.current?.focus()
      })
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [abierto, isCompact, cerrar])

  // Sheet: bloquea el scroll del fondo (mismo patrón que ResponsiveDialog).
  useEffect(() => {
    if (!abierto || !isCompact) return undefined
    const body = document.body
    const previo = body.style.overflow
    body.style.overflow = 'hidden'
    return () => { body.style.overflow = previo }
  }, [abierto, isCompact])

  const onKeyDownBoton = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); abrir('primero') }
    else if (e.key === 'ArrowUp') { e.preventDefault(); abrir('ultimo') }
  }

  const onKeyDownPanel = (e) => {
    if (e.key === 'Tab') {
      if (isCompact) { e.preventDefault(); cerrar() } else cerrar({ devolverFoco: false })
      return
    }
    if (TECLAS_NAVEGACION.includes(e.key)) {
      e.preventDefault()
      const lista = items()
      lista[indiceSiguiente(lista.indexOf(document.activeElement), lista.length, e.key)]?.focus()
    }
  }

  const elegir = (item) => {
    cerrar()           // el foco vuelve al botón ANTES de abrir el modal de la acción
    item.onSelect()
  }

  let indice = 0
  const cuerpo = (
    <div id={menuId} role="menu" aria-labelledby={botonId} className="space-y-1">
      {grupos.map((grupo, g) => {
        const tituloId = `${menuId}-${grupo.id}`
        return (
          <div key={grupo.id} role="group" aria-labelledby={tituloId}
            className={g > 0 ? 'border-t border-surface-700 pt-1' : ''}>
            <p id={tituloId} className="px-3 pt-2 pb-1 text-xs font-mono uppercase tracking-widest text-surface-200">
              {grupo.titulo}
            </p>
            {grupo.items.map((item) => {
              const i = indice++
              const Icono = item.icon
              return (
                <button key={item.id} type="button" role="menuitem" tabIndex={-1}
                  ref={(el) => { itemsRef.current[i] = el }}
                  onClick={() => elegir(item)}
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-3 min-h-[48px] text-left
                             text-surface-100 hover:bg-surface-700 focus:bg-surface-700
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/60
                             transition-colors motion-reduce:transition-none">
                  {Icono && <Icono size={16} aria-hidden="true" className="mt-0.5 flex-shrink-0 text-brand-500" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-body font-medium">{item.label}</span>
                    {item.descripcion && (
                      <span className="block text-xs font-body text-surface-200 mt-0.5 break-words">{item.descripcion}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button ref={botonRef} id={botonId} type="button"
        aria-haspopup="menu" aria-expanded={abierto} aria-controls={abierto ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => (abierto ? cerrar() : abrir('primero'))}
        onKeyDown={onKeyDownBoton}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border border-transparent
          px-4 py-2.5 text-sm min-[1025px]:text-xs font-body font-medium
          min-h-[44px] min-[1025px]:min-h-0 transition-all duration-200 motion-reduce:transition-none
          hover:bg-surface-700 hover:text-white
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900
          ${abierto ? 'bg-surface-700 text-white' : 'text-surface-300'}`}>
        {etiqueta}
        <ChevronDown size={14} aria-hidden="true"
          className={`transition-transform duration-200 motion-reduce:transition-none ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {/* Desktop: popover en portal. `top/left/maxHeight` los escribe usePosicionMenu antes del
          primer pintado. Fondo sólido (bg-surface-800, sin alfa) y z-index sobre toda la página. */}
      {abierto && !isCompact && createPortal(
        <div ref={panelRef} onKeyDown={onKeyDownPanel}
          className="fixed left-0 top-0 z-[9998] w-[22rem] max-w-[calc(100vw-1rem)] isolate
                     overflow-y-auto overscroll-contain rounded-xl border border-surface-600
                     bg-surface-800 p-1.5 shadow-2xl animate-menu-in">
          {cuerpo}
        </div>,
        document.body,
      )}

      {/* Mobile/tablet: bottom sheet con margen lateral y safe-areas. */}
      {abierto && isCompact && createPortal(
        <>
          <div aria-hidden="true" onClick={() => cerrar()}
            className="fixed inset-0 z-[9997] bg-black/60 animate-scrim-in" />
          <div ref={panelRef} onKeyDown={onKeyDownPanel}
            className="fixed z-[9998] mx-auto max-w-xl max-h-[85dvh] overflow-y-auto overscroll-contain
                       left-[max(0.5rem,env(safe-area-inset-left))] right-[max(0.5rem,env(safe-area-inset-right))]
                       bottom-[max(0.5rem,env(safe-area-inset-bottom))]
                       rounded-2xl border border-surface-600 bg-surface-800 px-2 pt-1 pb-2
                       shadow-2xl animate-sheet-in">
            <div className="flex items-center justify-between pl-3">
              <span className="font-display text-lg tracking-widest text-white uppercase">{etiqueta}</span>
              <button type="button" onClick={() => cerrar()} aria-label="Cerrar menú"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg
                           text-surface-300 hover:bg-surface-700 hover:text-white
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {cuerpo}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
