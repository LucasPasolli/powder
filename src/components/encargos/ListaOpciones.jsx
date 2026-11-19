// src/components/encargos/ListaOpciones.jsx
// Lista de opciones accesible (patrón ARIA «combobox + listbox») compartida por el selector
// de clientes y el de productos (DRY).
//
// El panel es SIEMPRE en línea (no un portal): scrollea dentro de su contenedor, nunca se
// sale del viewport ni queda tapado por el teclado virtual, y funciona dentro de un diálogo
// de pantalla completa. Las filas miden ≥ 44 px (área táctil mínima, WCAG 2.5.5).

import { useCallback, useEffect, useState } from 'react'

/**
 * Navegación con teclado del combobox: ↑ ↓ (circular), Enter elige, Escape cierra.
 * El foco NUNCA sale del input: la opción activa se anuncia con `aria-activedescendant`.
 *
 * @param {{ cantidad: number, abierto: boolean, onElegirIndice: (i:number)=>void, onCerrar: ()=>void }} p
 */
export function useNavegacionLista({ cantidad, abierto, onElegirIndice, onCerrar }) {
  const [indiceActivo, setIndiceActivo] = useState(-1)

  // Al cambiar el conjunto de resultados, la selección previa deja de tener sentido.
  useEffect(() => { setIndiceActivo(-1) }, [cantidad, abierto])

  const onKeyDown = useCallback((e) => {
    if (!abierto) return
    if (e.key === 'ArrowDown' && cantidad > 0) {
      e.preventDefault()
      setIndiceActivo((i) => (i + 1) % cantidad)
    } else if (e.key === 'ArrowUp' && cantidad > 0) {
      e.preventDefault()
      setIndiceActivo((i) => (i <= 0 ? cantidad - 1 : i - 1))
    } else if (e.key === 'Enter') {
      if (indiceActivo >= 0 && indiceActivo < cantidad) {
        e.preventDefault()
        onElegirIndice(indiceActivo)
      }
    } else if (e.key === 'Escape') {
      // Cierra sólo la lista (no el diálogo contenedor).
      e.preventDefault()
      e.stopPropagation()
      onCerrar()
    }
  }, [abierto, cantidad, indiceActivo, onElegirIndice, onCerrar])

  return { indiceActivo, onKeyDown }
}

/** Id DOM de la opción `i` (para `aria-activedescendant`). */
export const idOpcion = (idBase, i) => `${idBase}-opt-${i}`

/**
 * @param {object} props
 * @param {string} props.idBase                 Id del listbox (el input lo referencia con aria-controls).
 * @param {string} props.etiqueta               Nombre accesible de la lista.
 * @param {Array<any>} props.opciones
 * @param {(opcion:any, activa:boolean)=>React.ReactNode} props.renderOpcion
 * @param {(opcion:any)=>string|number} props.claveDe
 * @param {number} props.indiceActivo
 * @param {(opcion:any)=>void} props.onElegir
 */
export default function ListaOpciones({ idBase, etiqueta, opciones, renderOpcion, claveDe, indiceActivo, onElegir }) {
  // Mantiene visible la opción activa al navegar con el teclado.
  useEffect(() => {
    if (indiceActivo < 0) return
    document.getElementById(idOpcion(idBase, indiceActivo))?.scrollIntoView({ block: 'nearest' })
  }, [idBase, indiceActivo])

  return (
    <ul
      id={idBase}
      role="listbox"
      aria-label={etiqueta}
      className="mt-1 max-h-[min(18rem,45dvh)] overflow-y-auto overscroll-contain rounded-xl border border-surface-600 bg-surface-800 shadow-xl"
    >
      {opciones.map((op, i) => (
        <li
          key={claveDe(op)}
          id={idOpcion(idBase, i)}
          role="option"
          aria-selected={i === indiceActivo}
          // preventDefault: tocar una opción no le quita el foco al input (en mobile conserva el teclado).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onElegir(op)}
          className={`cursor-pointer px-3 py-2.5 min-h-[44px] border-b border-surface-700/60 last:border-0
                      hover:bg-surface-700 ${i === indiceActivo ? 'bg-surface-700 ring-1 ring-inset ring-brand-500/60' : ''}`}
        >
          {renderOpcion(op, i === indiceActivo)}
        </li>
      ))}
    </ul>
  )
}
