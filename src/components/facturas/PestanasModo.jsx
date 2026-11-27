// src/components/facturas/PestanasModo.jsx
// Selector de modo del módulo Facturas: «Facturas del período» | «Facturar por monto».
// Patrón ARIA «tabs» con teclado (← → Inicio Fin) y foco móvil (roving tabindex).
// Los paneles los renderiza el padre (siempre montados, con `hidden`) para conservar el
// estado —en especial las ediciones sin exportar— al cambiar de pestaña.
import { useRef } from 'react'
import { FOCO } from './estilos'

export const MODOS = Object.freeze([
  { id: 'periodo', etiqueta: 'Facturas del período' },
  { id: 'monto',   etiqueta: 'Facturar por monto' },
])

/** Ids estables para enlazar pestaña ↔ panel (aria-controls / aria-labelledby). */
export const idPestana = (id) => `facturas-tab-${id}`
export const idPanel = (id) => `facturas-panel-${id}`

/**
 * @param {{modo: string, onCambiar: (id: string) => void}} props
 */
export default function PestanasModo({ modo, onCambiar }) {
  const refs = useRef(/** @type {Record<string, HTMLButtonElement|null>} */ ({}))

  const alTeclear = (e) => {
    const i = MODOS.findIndex((m) => m.id === modo)
    let n = i
    if (e.key === 'ArrowRight') n = (i + 1) % MODOS.length
    else if (e.key === 'ArrowLeft') n = (i - 1 + MODOS.length) % MODOS.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = MODOS.length - 1
    else return
    e.preventDefault()
    onCambiar(MODOS[n].id)
    refs.current[MODOS[n].id]?.focus()
  }

  return (
    <div role="tablist" aria-label="Modo de facturación" onKeyDown={alTeclear}
      className="grid grid-cols-2 gap-1 p-1 bg-surface-800 border border-surface-700 rounded-2xl sm:inline-grid sm:w-auto">
      {MODOS.map((m) => {
        const activo = m.id === modo
        return (
          <button key={m.id} ref={(el) => { refs.current[m.id] = el }} type="button" role="tab"
            id={idPestana(m.id)} aria-selected={activo} aria-controls={idPanel(m.id)} tabIndex={activo ? 0 : -1}
            onClick={() => onCambiar(m.id)}
            className={`min-h-[44px] px-3 sm:px-5 rounded-xl text-base sm:text-sm font-body font-medium transition-colors ${FOCO}
              ${activo ? 'bg-brand-500 text-white' : 'text-surface-300 hover:text-white hover:bg-surface-700'}`}>
            {m.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
