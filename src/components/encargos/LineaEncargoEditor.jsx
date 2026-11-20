// src/components/encargos/LineaEncargoEditor.jsx
// Una línea del encargo: producto, medida (si el producto la tiene) y cantidad.
//   mobile/tablet < 768 px → tarjeta con los campos apilados.
//   ≥ 768 px               → una fila (nombre | medida | cantidad | quitar).
// Todos los controles miden ≥ 44 px; la cantidad tiene botones − / + además del teclado numérico.

import { useId } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { MEDIDAS_VALIDAS } from '../../lib/medidasProducto'
import { LIMITE_CANTIDAD_ENCARGO, parsearCantidad } from '../../lib/encargos'

const CONTROL = `bg-surface-700 border rounded-lg text-white text-base min-[1025px]:text-sm font-mono min-h-[44px]
  focus:outline-none focus-visible:ring-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed`
const BORDE_OK = 'border-surface-600 focus:border-brand-500 focus-visible:ring-brand-500/40'
const BORDE_ERR = 'border-red-500 focus-visible:ring-red-500/40'
const BOTON_PASO = `flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg bg-surface-700 border border-surface-600
  text-white hover:bg-surface-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-40`

/**
 * @param {object} props
 * @param {import('../../lib/encargos').LineaForm} props.linea
 * @param {number} props.indice  0-based
 * @param {import('../../lib/encargos').ErrorLinea} [props.error]
 * @param {boolean} [props.disabled]
 * @param {(uid:string, campo:'medida'|'cantidad', valor:string)=>void} props.onCambiar
 * @param {(uid:string)=>void} props.onQuitar
 */
export default function LineaEncargoEditor({ linea, indice, error, disabled = false, onCambiar, onQuitar }) {
  const uid = useId()
  const idMedida = `${uid}-medida`, idCant = `${uid}-cant`, idErr = `${uid}-err`
  const n = indice + 1
  const actual = parsearCantidad(linea.cantidad) ?? 0
  const hayError = Boolean(error?.medida || error?.cantidad || error?.repetida)

  const paso = (delta) => onCambiar(linea.uid, 'cantidad', String(Math.min(LIMITE_CANTIDAD_ENCARGO, Math.max(1, actual + delta))))

  return (
    <li className={`rounded-xl border p-3 md:grid md:grid-cols-[minmax(0,1fr)_9rem_11.5rem_2.75rem] md:items-start md:gap-3
                    ${hayError ? 'border-red-500/60 bg-red-500/5' : 'border-surface-700 bg-surface-800/60'}`}>
      <div className="min-w-0 mb-3 md:mb-0 md:pt-2.5">
        <p className="text-white text-sm font-body leading-snug break-words">
          <span className="text-surface-500 font-mono mr-1.5">{n}.</span>{linea.nombreProducto}
        </p>
        <p className="text-surface-400 text-xs font-mono mt-0.5">#{linea.idProducto}</p>
      </div>

      <div className="mb-3 md:mb-0">
        {linea.tieneMedidas ? (
          <>
            <label htmlFor={idMedida} className="block text-surface-300 text-sm min-[1025px]:text-xs font-body mb-1 md:sr-only">Medida del producto {n}</label>
            <select
              id={idMedida} value={linea.medida ?? ''} disabled={disabled}
              onChange={(e) => onCambiar(linea.uid, 'medida', e.target.value)}
              aria-invalid={error?.medida ? true : undefined} aria-describedby={hayError ? idErr : undefined}
              data-encargo-invalido={error?.medida ? 'true' : undefined}
              className={`${CONTROL} w-full px-2 ${error?.medida ? BORDE_ERR : BORDE_OK}`}
            >
              <option value="">Elegí la medida…</option>
              {MEDIDAS_VALIDAS.map((m) => <option key={m} value={m}>{m === 'standard' ? 'Standard' : m}</option>)}
            </select>
          </>
        ) : (
          <p className="text-surface-500 text-sm font-body md:pt-2.5">Sin medidas</p>
        )}
      </div>

      <div className="flex items-end gap-2 md:items-start">
        <div className="flex-1 min-w-0">
          <label htmlFor={idCant} className="block text-surface-300 text-sm min-[1025px]:text-xs font-body mb-1 md:sr-only">Cantidad del producto {n}</label>
          <div className="flex items-center gap-1">
            <button type="button" className={BOTON_PASO} disabled={disabled || actual <= 1} onClick={() => paso(-1)} aria-label={`Restar uno a la cantidad del producto ${n}`}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <input
              id={idCant} type="text" inputMode="numeric" autoComplete="off" maxLength={7} disabled={disabled}
              value={linea.cantidad}
              onChange={(e) => onCambiar(linea.uid, 'cantidad', e.target.value.replace(/\D/g, ''))}
              aria-invalid={error?.cantidad ? true : undefined} aria-describedby={hayError ? idErr : undefined}
              data-encargo-invalido={error?.cantidad ? 'true' : undefined}
              className={`${CONTROL} w-full min-w-0 px-1 text-center ${error?.cantidad ? BORDE_ERR : BORDE_OK}`}
            />
            <button type="button" className={BOTON_PASO} disabled={disabled || actual >= LIMITE_CANTIDAD_ENCARGO} onClick={() => paso(1)} aria-label={`Sumar uno a la cantidad del producto ${n}`}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <button type="button" disabled={disabled} onClick={() => onQuitar(linea.uid)} aria-label={`Quitar el producto ${n}: ${linea.nombreProducto}`}
          className={`${BOTON_PASO} md:hidden text-red-400`}><Trash2 size={16} aria-hidden="true" /></button>
      </div>

      <button type="button" disabled={disabled} onClick={() => onQuitar(linea.uid)} aria-label={`Quitar el producto ${n}: ${linea.nombreProducto}`}
        className={`${BOTON_PASO} hidden md:flex text-red-400 hover:text-red-300`}><Trash2 size={16} aria-hidden="true" /></button>

      {hayError && (
        <div id={idErr} role="alert" className="mt-2 md:mt-0 md:col-span-4 text-red-400 text-sm min-[1025px]:text-xs font-body space-y-0.5">
          {error.medida && <p>{error.medida}</p>}
          {error.cantidad && <p>{error.cantidad}</p>}
          {error.repetida && <p>{error.repetida}</p>}
        </div>
      )}
    </li>
  )
}
