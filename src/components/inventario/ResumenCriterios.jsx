// src/components/inventario/ResumenCriterios.jsx
// Resumen vivo de lo que está filtrando el listado (escenarios 6 y 7):
//   · "12 de 340 productos" (región aria-live: lo anuncian los lectores de pantalla).
//   · Una pastilla por criterio activo, unidas con "y": deja a la vista que se aplican TODAS a la vez
//     (AND) y permite quitar cada una de a una (volver a "Todos") sin abrir ningún panel.
//   · "Limpiar filtros" cuando hay algo aplicado.
//
// Responsive: las pastillas hacen wrap (nunca scroll horizontal) y truncan el texto largo; en touch
// (≤ 1024 px) cada pastilla mide 44 px de alto, en escritorio 32 px.

import { Fragment } from 'react'
import { X } from 'lucide-react'

/**
 * @param {object} props
 * @param {Array<{ clave: string, etiqueta: string, valor: string }>} props.criterios
 * @param {number} props.mostrados
 * @param {number} props.total
 * @param {(clave: string) => void} props.onQuitar   Devuelve ese criterio a "Todos"/vacío.
 * @param {() => void} props.onLimpiar
 */
export default function ResumenCriterios({ criterios, mostrados, total, onQuitar, onLimpiar }) {
  const hay = criterios.length > 0
  return (
    <div className="space-y-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p role="status" aria-live="polite" className="text-surface-400 text-xs font-body">
          {mostrados} de {total} producto{total === 1 ? '' : 's'}
        </p>
        {hay && (
          <button type="button" onClick={onLimpiar}
            className="inline-flex items-center gap-2 h-11 min-[1025px]:h-9 px-3 rounded-xl bg-surface-700 border border-surface-600
                       text-surface-300 text-sm font-body whitespace-nowrap cursor-pointer transition-all
                       hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/10
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
            <X size={13} aria-hidden="true" /> Limpiar filtros
          </button>
        )}
      </div>

      {hay && (
        <div className="min-w-0">
          <ul aria-label="Criterios aplicados" className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
            {criterios.map((c, i) => (
              <Fragment key={c.clave}>
                {i > 0 && <li aria-hidden="true" className="text-surface-500 text-xs font-body uppercase">y</li>}
                <li className="min-w-0 max-w-full">
                  <button type="button" onClick={() => onQuitar(c.clave)}
                    aria-label={`Quitar ${c.etiqueta}: ${c.valor}`}
                    className="inline-flex max-w-full items-center gap-1.5 min-h-[44px] min-[1025px]:min-h-[32px] pl-3 pr-2.5 rounded-full
                               bg-brand-500/10 border border-brand-500/30 text-surface-100 text-xs font-body cursor-pointer
                               hover:bg-brand-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
                    <span className="text-surface-400">{c.etiqueta}:</span>
                    <span className="truncate">{c.valor}</span>
                    <X size={12} aria-hidden="true" className="flex-shrink-0 text-surface-400" />
                  </button>
                </li>
              </Fragment>
            ))}
          </ul>
          {criterios.length > 1 && (
            <p className="mt-1.5 text-surface-500 text-xs font-body">
              Se cumplen todas las condiciones a la vez.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
