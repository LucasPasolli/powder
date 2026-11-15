// src/components/pedidos/flujoUi.jsx
// Piezas de UI compartidas por las pantallas del flujo (factura, recepción, comparación).
// Presentacionales y sin lógica de negocio (SRP).
//
// Breakpoints del proyecto: mobile < 768 · tablet 768–1024 · desktop ≥ 1025
// (`md:` = tablet; `min-[1025px]:` = desktop, igual que el resto de la app).

import { useId } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { ESTADO } from '../../lib/pedidoFlujo'

export const ETIQUETA = 'block text-surface-300 text-sm min-[1025px]:text-xs tracking-widest uppercase font-body'

const CAMPO_BASE = `w-full bg-surface-700 border rounded-xl px-3 py-2.5 min-h-[44px] text-white text-base
  min-[1025px]:text-sm min-[1025px]:min-h-0 font-body placeholder-surface-500 focus:outline-none focus:ring-1 transition-all`

/**
 * Campo con etiqueta y mensaje de error propios (aria-invalid + aria-describedby).
 * `ocultarEtiquetaDesktop`: en filas tipo tabla la etiqueta pasa a sólo-lectores
 * (la cabecera visible la aporta la fila de títulos).
 */
export function Campo({ label, error, ocultarEtiquetaDesktop = false, id, as: Tag = 'input', className = '', children, ...props }) {
  const auto = useId()
  const campoId = id ?? auto
  const errorId = `${campoId}-error`
  return (
    <div className="space-y-1 min-w-0">
      <label htmlFor={campoId} className={`${ETIQUETA} ${ocultarEtiquetaDesktop ? 'min-[1025px]:sr-only' : ''}`}>{label}</label>
      <Tag
        id={campoId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`${CAMPO_BASE} ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30'
          : 'border-surface-600 focus:border-brand-500 focus:ring-brand-500/30'} ${className}`}
        {...props}
      >
        {children}
      </Tag>
      {error && <p id={errorId} role="alert" className="text-red-400 text-sm min-[1025px]:text-xs font-body">{error}</p>}
    </div>
  )
}

/** Aviso de error accesible (se anuncia al aparecer). */
export function AvisoError({ children, className = '' }) {
  if (!children) return null
  return (
    <div role="alert" className={`flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 ${className}`}>
      <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
      <p className="text-red-300 text-sm font-body">{children}</p>
    </div>
  )
}

const PASOS = [
  { estado: ESTADO.ORIGINAL, label: 'Original' },
  { estado: ESTADO.FACTURADO, label: 'Facturado' },
  { estado: ESTADO.RECIBIDO, label: 'Recibido' },
]

/** Indicador de etapa: Original → Facturado → Recibido. El estado no depende sólo del color. */
export function EtapasPedido({ estado }) {
  const actual = PASOS.findIndex((p) => p.estado === estado)
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2 flex-wrap" aria-label="Etapas del pedido">
      {PASOS.map((p, i) => {
        const hecho = i < actual
        const esActual = i === actual
        return (
          <li key={p.estado} className="flex items-center gap-1.5 sm:gap-2" aria-current={esActual ? 'step' : undefined}>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm min-[1025px]:text-xs font-body
              ${esActual ? 'bg-brand-500/15 text-brand-400 border-brand-500/40'
                : hecho ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-surface-700/40 text-surface-400 border-surface-600'}`}>
              {hecho && <Check size={11} aria-hidden="true" />}
              {p.label}
              {esActual && <span className="sr-only"> (etapa actual)</span>}
              {hecho && <span className="sr-only"> (completada)</span>}
            </span>
            {i < PASOS.length - 1 && <span className="text-surface-600" aria-hidden="true">→</span>}
          </li>
        )
      })}
    </ol>
  )
}
