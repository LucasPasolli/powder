// src/components/facturas/ResumenPorMonto.jsx
// Resumen de «Facturar por monto»: totales combinados (neto, IVA, total con IVA), monto
// ingresado y DIFERENCIA en $ y %, más las dos tarjetas-documento (Transferencia + CC /
// Efectivo) que seleccionan la pestaña y descargan su PDF.
//
// Como en ResumenPeriodo, «seleccionar» y «descargar» son dos controles HERMANOS (un botón
// dentro de otro botón no es operable con teclado ni lector de pantalla).
//
// Responsive: stats en 2 columnas (mobile) → 4 (tablet/desktop); tarjetas apiladas (mobile)
// → 2 columnas (≥ 640 px).
import { AlertTriangle, CheckCircle2, Download } from 'lucide-react'
import { Button, Card } from '../ui'
import { fmt } from '../../lib/facturas'
import { fmtPct } from '../../lib/pagoSplit'
import { DOCUMENTOS, describirDiferencia } from '../../lib/facturarPorMonto'
import { FOCO, TOQUE } from './estilos'

/**
 * @param {object} props
 * @param {ReturnType<typeof import('../../lib/facturarPorMonto').calcularResumen>} props.resumen
 * @param {'noEfectivo'|'efectivo'} props.activo
 * @param {(tipo: 'noEfectivo'|'efectivo') => void} props.onSeleccionar
 * @param {(tipo: 'noEfectivo'|'efectivo') => void} props.onDescargar
 * @param {boolean} props.generando
 * @param {boolean} props.bloqueado     Hay errores de validación: la exportación está deshabilitada.
 * @param {{noEfectivo: number, efectivo: number}} props.cantidadLineas
 * @param {boolean} props.editado       El usuario modificó el listado automático.
 * @param {boolean} [props.desdeHabituales]  Se generó sin base, desde productos habituales.
 */
export default function ResumenPorMonto({
  resumen, activo, onSeleccionar, onDescargar, generando, bloqueado, cantidadLineas, editado, desdeHabituales = false,
}) {
  const exacto = resumen.exacto
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-6 space-y-4">
        <dl className="grid grid-cols-2 min-[768px]:grid-cols-4 gap-x-4 gap-y-3 font-body">
          <Stat rotulo="Subtotal neto" valor={fmt(resumen.netoCentavos / 100)} />
          <Stat rotulo="IVA" valor={fmt(resumen.ivaCentavos / 100)} />
          <Stat rotulo="Total con IVA" valor={fmt(resumen.totalCentavos / 100)} destacado />
          <Stat rotulo="Monto ingresado" valor={fmt(resumen.montoCentavos / 100)} />
        </dl>

        {/* Región viva: anuncia cada recálculo (edición en vivo) a lectores de pantalla. */}
        <div role="status" aria-live="polite" aria-atomic="true"
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-base sm:text-sm font-body
            ${exacto ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
                     : 'text-amber-300 bg-amber-500/10 border-amber-500/30'}`}>
          {exacto
            ? <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            : <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />}
          <div className="min-w-0 break-words">
            {exacto ? (
              <p className="font-semibold">El listado suma exactamente el monto ingresado.</p>
            ) : (
              <>
                <p className="font-semibold">
                  {editado ? 'El total editado difiere del monto ingresado.' : 'Listado aproximado: no se pudo igualar el monto exacto.'}
                </p>
                <p className="mt-0.5">
                  Diferencia: <span className="font-mono tabular-nums">
                    {describirDiferencia(resumen.diferenciaCentavos, resumen.diferenciaPct, fmt, fmtPct)}
                  </span>
                  <span className="text-amber-200/70"> · podés exportarlo igual.</span>
                </p>
              </>
            )}
          </div>
        </div>

        {desdeHabituales && (
          <p className="text-surface-300 text-sm font-body">
            Sin compras en el período: el listado se armó con productos habituales del cliente, a su precio de venta actual.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4" role="group" aria-label="Documentos a exportar">
        {DOCUMENTOS.map(({ tipo, label }) => {
          const t = resumen.porDoc[tipo]
          const sel = activo === tipo
          const lineas = cantidadLineas[tipo]
          return (
            <div key={tipo}
              className={`flex items-start gap-3 bg-surface-800 border rounded-2xl p-3 sm:p-5 transition-colors duration-200
                ${sel ? 'border-brand-500/50 bg-brand-500/5' : 'border-surface-700'}`}>
              <button type="button" aria-pressed={sel} onClick={() => onSeleccionar(tipo)}
                className={`flex-1 min-w-0 min-h-[44px] text-left rounded-xl p-1 -m-1 ${FOCO}`}>
                <span className="block text-surface-400 text-sm min-[1025px]:text-xs uppercase tracking-widest font-body">{label}</span>
                <span className="block text-brand-400 font-mono font-bold text-xl mt-1 tabular-nums break-words">{fmt(t.totalCentavos / 100)}</span>
                <span className="block mt-2 text-surface-400 text-sm min-[1025px]:text-xs font-body">
                  {lineas} {lineas === 1 ? 'línea' : 'líneas'}
                </span>
              </button>
              <Button size="sm" icon={Download} className={`${TOQUE} flex-shrink-0`} loading={generando}
                disabled={lineas === 0 || bloqueado} aria-label={`Descargar PDF de ${label}`}
                onClick={() => onDescargar(tipo)}>
                PDF
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ rotulo, valor, destacado = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-surface-400 text-sm min-[1025px]:text-xs uppercase tracking-widest">{rotulo}</dt>
      <dd className={`mt-0.5 font-mono font-bold tabular-nums break-words ${destacado ? 'text-brand-400 text-xl' : 'text-white text-lg'}`}>{valor}</dd>
    </div>
  )
}
