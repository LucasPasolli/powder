// src/components/promociones/ResolverConflictos.jsx
// Paso de resolución cuando uno o más productos de la promoción que se está guardando
// YA tienen otra promoción de producto activa en fechas que se solapan.
//
// El usuario decide, producto por producto, cuál queda vigente:
//   · «Usar la nueva»      → el producto se quita de la(s) promoción(es) existente(s).
//   · «Mantener «X»»       → el producto se quita de la promoción que se está guardando.
// Sin decisión por defecto: nadie pierde un descuento por apretar «Guardar» sin leer.
//
// Componente PRESENTACIONAL: no conoce servicios ni estado del formulario; recibe las
// decisiones y el resultado calculado (`resolucion`, ver construirResolucion).
//
// A11y: un <fieldset>/<legend> con radios nativos por producto (navegables con flechas),
// foco al título al aparecer, resumen en región `status`. Responsive: una columna, opciones
// de ≥ 44 px, textos con break-words (sin scroll horizontal).

import { useEffect, useId, useRef } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import {
  DECISION_NUEVA, fmtFechaISO, textoCantidadProductos,
} from '../../lib/promocionesConfig'

const detalleDescuento = (q) =>
  q.valor == null ? '' : q.tipo === 'porcentaje_producto' ? `−${q.valor}%` : `$${q.valor}`

/**
 * @param {object} props
 * @param {string} props.nombreNueva
 * @param {Array<{idProducto:number, nombre:string|null, promos:Array<object>}>} props.conflictos
 * @param {Record<number, string>} props.decisiones
 * @param {(idProducto:number, valor:string) => void} props.onDecidir
 * @param {(modo:'nueva'|'existentes') => void} props.onTodos
 * @param {{pendientes:number, idsFinales:number[], promosQueQuedanVacias:Array<{idPromocion:number,nombre:string}>}} props.resolucion
 */
export default function ResolverConflictos({
  nombreNueva, conflictos, decisiones, onDecidir, onTodos, resolucion,
}) {
  const uid = useId()
  const tituloRef = useRef(null)
  const { pendientes, idsFinales, promosQueQuedanVacias } = resolucion

  // Al aparecer el paso, el foco va al título: el lector de pantalla anuncia el contexto.
  useEffect(() => { tituloRef.current?.focus() }, [])

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <h3 ref={tituloRef} tabIndex={-1}
          className="flex items-start gap-2 text-amber-200 text-base min-[1025px]:text-sm font-body font-semibold focus:outline-none">
          <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 flex-shrink-0" />
          <span>
            {conflictos.length === 1
              ? '1 producto ya tiene una promoción activa en esas fechas'
              : `${conflictos.length} productos ya tienen una promoción activa en esas fechas`}
          </span>
        </h3>
        <p className="mt-1 text-amber-100/80 text-sm min-[1025px]:text-xs font-body">
          Un producto solo puede tener una promoción de producto vigente a la vez. Elegí cuál
          queda activa para cada uno; en la otra se quitará ese producto.
        </p>
      </div>

      {conflictos.length > 1 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={() => onTodos('nueva')}
            className="min-h-[44px] min-[1025px]:min-h-[36px] px-3 rounded-xl border border-surface-600 text-surface-100 text-sm
                       font-body hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
            Usar «{nombreNueva}» en todos
          </button>
          <button type="button" onClick={() => onTodos('existentes')}
            className="min-h-[44px] min-[1025px]:min-h-[36px] px-3 rounded-xl border border-surface-600 text-surface-100 text-sm
                       font-body hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
            Mantener las existentes en todos
          </button>
        </div>
      )}

      <div className="space-y-3">
        {conflictos.map((c) => {
          const grupo = `${uid}-${c.idProducto}`
          const opciones = [
            { value: DECISION_NUEVA, titulo: `Usar la nueva: «${nombreNueva}»`, detalle: 'Se quita este producto de la promoción existente.' },
            ...c.promos.map((q) => ({
              value: String(q.idPromocion),
              titulo: `Mantener «${q.nombre}»`,
              detalle: [detalleDescuento(q), `${fmtFechaISO(q.fechaInicio)} → ${fmtFechaISO(q.fechaFin)}`].filter(Boolean).join(' · '),
            })),
          ]
          return (
            <fieldset key={c.idProducto} className="min-w-0 rounded-xl border border-surface-600 bg-surface-800/60 p-3">
              <legend className="px-1 text-white text-sm font-body font-semibold break-words max-w-full">
                <span className="text-surface-400 font-mono">#{c.idProducto}</span> {c.nombre ?? 'Producto sin nombre'}
              </legend>
              <div className="space-y-2 mt-1">
                {opciones.map((o) => {
                  const marcada = decisiones[c.idProducto] === o.value
                  return (
                    <label key={o.value}
                      className={`flex items-start gap-3 min-h-[44px] cursor-pointer rounded-xl border px-3 py-2 transition-colors
                                  focus-within:ring-2 focus-within:ring-brand-500/60
                                  ${marcada ? 'border-brand-500 bg-brand-500/10' : 'border-surface-600 hover:bg-surface-700/60'}`}>
                      <input type="radio" name={grupo} value={o.value} checked={marcada}
                        onChange={() => onDecidir(c.idProducto, o.value)}
                        className="mt-1 h-4 w-4 flex-shrink-0 accent-brand-500" />
                      <span className="min-w-0">
                        <span className="block text-white text-sm font-body break-words">{o.titulo}</span>
                        <span className="block text-surface-400 text-xs font-body break-words">{o.detalle}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )
        })}
      </div>

      {/* Resumen en vivo del resultado */}
      <div role="status" aria-live="polite"
        className="rounded-xl border border-surface-600 bg-surface-700/50 px-4 py-3 text-sm min-[1025px]:text-xs font-body space-y-1">
        {pendientes > 0 ? (
          <p className="text-surface-300">
            Falta decidir {pendientes} producto{pendientes === 1 ? '' : 's'}.
          </p>
        ) : idsFinales.length === 0 ? (
          <p className="flex items-start gap-1.5 text-red-300">
            <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 flex-shrink-0" />
            La promoción nueva quedaría sin productos. Elegí «Usar la nueva» en al menos uno o volvé al formulario.
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-emerald-300">
            <CheckCircle2 size={14} aria-hidden="true" className="mt-0.5 flex-shrink-0" />
            «{nombreNueva}» quedará con {textoCantidadProductos(idsFinales.length)}.
          </p>
        )}
        {pendientes === 0 && promosQueQuedanVacias.map((q) => (
          <p key={q.idPromocion} className="text-amber-200 break-words">
            «{q.nombre}» quedará sin productos y se desactivará.
          </p>
        ))}
      </div>
    </div>
  )
}
