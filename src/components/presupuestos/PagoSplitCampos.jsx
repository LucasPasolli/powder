// src/components/presupuestos/PagoSplitCampos.jsx
// Bloque "Split Payment" del modal de pago. Presentacional: recibe el estado
// del hook `usePagoSplit`. Accesible (switch + fieldsets + errores asociados),
// teclado numérico en móviles y campos apilados (no dependen del ancho).
import { useId } from 'react'
import { AlertCircle } from 'lucide-react'
import { ETIQUETA_METODO, METODOS_SPLIT } from '../../lib/pagoSplit'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n ?? 0)

// 16 px en móvil: evita el zoom automático de iOS al enfocar.
const INPUT = `w-full min-h-[44px] sm:min-h-0 bg-surface-700 border rounded-xl px-3 py-2.5 text-white
  text-base sm:text-sm font-mono tabular-nums placeholder:text-surface-500
  focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60`

function Campo({ id, label, sufijo, value, error, disabled, onChange, descId }) {
  const errId = `${id}-error`
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-surface-400 text-xs font-body mb-1">{label}</label>
      <div className="relative">
        <input id={id} type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off"
          autoCorrect="off" spellCheck={false} maxLength={14} placeholder="0,00"
          value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[error && errId, descId].filter(Boolean).join(' ') || undefined}
          className={`${INPUT} ${sufijo === '%' ? 'pr-8' : 'pl-7'} ${error ? 'border-red-500/60' : 'border-surface-600'}`} />
        <span aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 flex items-center text-surface-400 text-sm
            ${sufijo === '%' ? 'right-3' : 'left-3'}`}>{sufijo}</span>
      </div>
      {error && (
        <p id={errId} role="alert" className="mt-1 flex items-start gap-1 text-red-400 text-xs font-body">
          <AlertCircle size={12} className="mt-0.5 shrink-0" aria-hidden="true" />{error}
        </p>
      )}
    </div>
  )
}

/**
 * @param {object} props
 * @param {ReturnType<import('../../hooks/usePagoSplit').usePagoSplit>} props.split
 * @param {number} props.total
 * @param {boolean} [props.disabled]
 */
export default function PagoSplitCampos({ split, total, disabled = false }) {
  const uid = useId()
  const { activo, alternar, editar, campos, errores, valido, payload } = split
  const resumenId = `${uid}-resumen`

  return (
    <div className="mb-4 rounded-xl border border-surface-600 bg-surface-700/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id={`${uid}-t`} className="text-white text-sm font-body font-medium">Split Payment</p>
          <p id={`${uid}-d`} className="text-surface-400 text-xs font-body mt-0.5">
            El cliente pagó con una combinación de efectivo y transferencia.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={activo}
          aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-d`}
          disabled={disabled} onClick={() => alternar(!activo)}
          className={`relative shrink-0 h-7 w-12 rounded-full transition-colors touch-manipulation
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-60
            ${activo ? 'bg-brand-500' : 'bg-surface-600'}`}>
          <span aria-hidden="true"
            className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform
              motion-reduce:transition-none ${activo ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {activo && (
        <div className="mt-4 space-y-4">
          <div className="flex items-baseline justify-between gap-3 border-b border-surface-600 pb-2">
            <span className="text-surface-400 text-xs font-body">Total del presupuesto</span>
            <span className="text-brand-400 font-mono font-bold tabular-nums">{fmt(total)}</span>
          </div>

          {METODOS_SPLIT.map((m) => (
            <fieldset key={m} disabled={disabled} className="min-w-0">
              <legend className="text-surface-200 text-sm font-body font-medium mb-2">{ETIQUETA_METODO[m]}</legend>
              <div className="grid grid-cols-1 gap-3">
                <Campo id={`${uid}-${m}-monto`} label="Monto" sufijo="$" value={campos[m].monto}
                  error={errores[m]?.monto} disabled={disabled} onChange={(v) => editar(m, 'monto', v)} />
                <Campo id={`${uid}-${m}-pct`} label="Porcentaje" sufijo="%" value={campos[m].porcentaje}
                  error={errores[m]?.porcentaje} disabled={disabled} onChange={(v) => editar(m, 'porcentaje', v)} />
              </div>
            </fieldset>
          ))}

          {/* Región viva: confirma que la suma cierra, o guía si falta ingresar algo. */}
          <p id={resumenId} role="status" aria-live="polite" className="text-xs font-body text-surface-400">
            {valido && payload
              ? `Efectivo ${fmt(payload.efectivo.monto)} + Transferencia ${fmt(payload.transferencia.monto)} = ${fmt(total)}`
              : 'Ingresá un monto o un porcentaje en cualquiera de los dos métodos: el otro se completa solo.'}
          </p>
        </div>
      )}
    </div>
  )
}
