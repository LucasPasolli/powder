// src/components/encargos/encargosPresentacion.jsx
// Helpers de PRESENTACIÓN compartidos por listado, tarjetas y selector de pedido (DRY).

import { useId, useState } from 'react'
import { CheckCircle2, Clock, Truck, XCircle } from 'lucide-react'
import { Badge } from '../ui'
import { ETIQUETA_ESTADO_ENCARGO, descripcionLinea, resumirLineas } from '../../lib/encargos'

/** Color + ícono por estado: el estado NUNCA se comunica sólo con color (WCAG 1.4.1). */
const CONFIG_ESTADO = {
  pendiente:  { color: 'yellow', icon: Clock },
  en_proceso: { color: 'blue',   icon: Truck },
  completado: { color: 'green',  icon: CheckCircle2 },
  cancelado:  { color: 'gray',   icon: XCircle },
}

export function EstadoEncargoBadge({ estado }) {
  const cfg = CONFIG_ESTADO[estado] ?? CONFIG_ESTADO.pendiente
  return (
    <Badge color={cfg.color}>
      <cfg.icon size={11} className="inline mr-1" aria-hidden="true" />
      {ETIQUETA_ESTADO_ENCARGO[estado] ?? estado}
    </Badge>
  )
}

/**
 * Productos solicitados. Muestra las primeras `max` líneas y, si hay más, un botón
 * «+N más» que las despliega (Escenario 5: el detalle completo siempre está al alcance).
 * Texto plano (React lo escapa): nunca se interpreta como HTML.
 */
export function LineasEncargo({ detalles, max = 3 }) {
  const regionId = useId()
  const [abierto, setAbierto] = useState(false)
  const { visibles, ocultas } = abierto ? { visibles: detalles ?? [], ocultas: 0 } : resumirLineas(detalles, max)
  const total = detalles?.length ?? 0

  if (total === 0) return <span className="text-surface-500 text-sm font-body">Sin productos</span>

  return (
    <div>
      <ul id={regionId} className="space-y-1">
        {visibles.map((d) => (
          <li key={d.idDetalleEncargo} className="text-surface-200 text-sm font-body leading-snug break-words">
            {descripcionLinea(d)}
          </li>
        ))}
      </ul>
      {total > max && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls={regionId}
          className="mt-1 inline-flex items-center min-h-[44px] md:min-h-0 text-brand-400 hover:text-brand-300 text-sm font-body
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded"
        >
          {abierto ? 'Ver menos' : `+${ocultas} más`}
        </button>
      )}
    </div>
  )
}
