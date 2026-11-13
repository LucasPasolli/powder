// src/components/ui/KpiCard.jsx
// Tarjeta de indicador (KPI) compartida. Antes vivía copiada en Saldos y en Pedidos de Compra.
//
//   · mobile: se usa dentro de una grilla de 2 columnas (`grid-cols-2`), por eso el valor se
//     trunca con elipsis (`truncate`) y el importe completo queda en el `title`;
//   · `surface` cambia el tono de la tarjeta (neutral | red | blue) para destacar alertas;
//   · `className` permite que la grilla del llamador decida el span (p. ej. `col-span-2`).
//
// Presentacional y sin estado.

const SURFACES = Object.freeze({
  neutral: { box: 'bg-surface-800 border-surface-700', label: 'text-surface-400' },
  red:     { box: 'bg-red-500/8 border-red-500/25',    label: 'text-red-400'     },
  blue:    { box: 'bg-blue-500/8 border-blue-500/25',  label: 'text-blue-400'    },
})

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {React.ReactNode} [props.hint]       Línea secundaria bajo el valor.
 * @param {'neutral'|'red'|'blue'} [props.surface='neutral']
 * @param {string} [props.valueClass]          Color del valor (p. ej. `text-yellow-400`).
 * @param {React.ComponentType<{size?:number,'aria-hidden'?:string}>} [props.icon]
 * @param {string} [props.title]               Texto completo del valor (por defecto, el propio valor).
 * @param {string} [props.className]           Clases extra para la grilla del llamador.
 */
export default function KpiCard({
  label, value, hint, surface = 'neutral', valueClass = '', icon: Icon, title, className = '',
}) {
  const s = SURFACES[surface] ?? SURFACES.neutral
  return (
    <div className={`${s.box} border rounded-xl p-3 sm:p-5 min-w-0 ${className}`.trim()}>
      <p className={`${s.label} text-xs uppercase tracking-widest font-body flex items-center gap-1`}>
        {Icon && <Icon size={11} aria-hidden="true" />}{label}
      </p>
      <p className={`font-display text-2xl sm:text-3xl tracking-widest mt-1 truncate ${valueClass}`}
        title={title ?? String(value)}>
        {value}
      </p>
      <p className="text-surface-500 text-xs font-body mt-1">{hint}</p>
    </div>
  )
}
