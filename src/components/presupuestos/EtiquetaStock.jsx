// src/components/presupuestos/EtiquetaStock.jsx
// Marca INTERNA de stock ("Sin stock" / "Stock insuficiente: disponible X" + unidades en exceso)
// y resumen de advertencias. Solo informan: nunca deshabilitan nada.
//
// Accesibilidad (WCAG 2.1 AA): el significado no depende del color (ícono + texto), el contraste
// del texto sobre el fondo ámbar supera 4.5:1 y no hay información que dependa de `hover`.
// Responsive: textos con `break-words` y contenedores `min-w-0`; en 320 px envuelven en vez de
// desbordar. No usar en PDF ni en vistas del cliente (es información interna).

import { AlertCircle } from 'lucide-react'
import { detalleExcedente, etiquetaStock, tieneAdvertencia } from '../../lib/stockPresupuesto'

/**
 * @param {{ estado?: import('../../lib/stockPresupuesto').EstadoStock, className?: string }} props
 */
export default function EtiquetaStock({ estado, className = '' }) {
  if (!tieneAdvertencia(estado)) return null
  const etiqueta = etiquetaStock(estado)
  const exceso = detalleExcedente(estado)

  return (
    <span
      data-testid="etiqueta-stock"
      className={`inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-yellow-500/40
                  bg-yellow-900/20 px-2 py-1 text-xs font-body text-yellow-200 ${className}`}
    >
      <AlertCircle size={12} className="flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words font-medium">{etiqueta}</span>
      {exceso && <span className="min-w-0 break-words text-yellow-300/90">· {exceso}</span>}
    </span>
  )
}

/**
 * Resumen de los productos afectados. No bloquea ni pide confirmación: el usuario sigue su camino.
 * @param {{ resumen: ReturnType<typeof import('../../lib/stockPresupuesto').resumirAdvertencias>, titulo?: string, className?: string }} props
 */
export function ResumenAdvertenciasStock({ resumen, titulo, className = '' }) {
  if (!resumen || resumen.total === 0) return null
  const { total, sinStock, insuficientes, items } = resumen

  const partes = []
  if (sinStock) partes.push(`${sinStock} sin stock`)
  if (insuficientes) partes.push(`${insuficientes} con stock insuficiente`)

  return (
    <section
      aria-label="Resumen de advertencias de stock"
      className={`rounded-xl border border-yellow-500/30 bg-yellow-900/15 px-3 py-3 sm:px-4 text-left ${className}`}
    >
      <p role="status" className="flex items-start gap-2 text-sm font-body text-yellow-100">
        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">
          <span className="font-semibold">
            {titulo ?? (total === 1 ? '1 producto requiere gestión de stock' : `${total} productos requieren gestión de stock`)}
          </span>
          <span className="text-yellow-200/90"> ({partes.join(' · ')}). Podés continuar: es informativo.</span>
        </span>
      </p>

      <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
        {items.map((a) => (
          <li key={a.clave} className="min-w-0 text-xs font-body text-yellow-100/90">
            <span className="break-words font-medium text-white">{a.nombre}</span>
            {a.medida ? <span className="text-yellow-200/80"> · {a.medida}</span> : null}
            <EtiquetaStock estado={a.estado} className="ml-0 mt-1 block w-fit sm:ml-2 sm:mt-0 sm:inline-flex" />
          </li>
        ))}
      </ul>
    </section>
  )
}
