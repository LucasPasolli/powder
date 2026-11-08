// src/pages/admin/TarjetaArea.jsx
// Tarjeta del panel. Réplica del formato de las tarjetas de Dashboard.jsx (mismas clases,
// tamaños, espaciado, animación escalonada y línea de acento al hover). Diferencias deliberadas:
//  - Todo el <Link> es el área clickeable (un único enlace, sin enlaces anidados).
//  - Pie alineado al fondo (flex-col + mt-auto) para que "Acceder" quede a la misma altura por fila.
//  - Foco visible por teclado y respeto a prefers-reduced-motion.
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

export default function TarjetaArea({ area, indice = 0 }) {
  const { titulo, descripcion, icono: Icono, accent, ruta } = area
  return (
    <Link
      to={ruta}
      className="group relative flex h-full flex-col bg-surface-800 border border-surface-700 rounded-2xl p-6
                 hover:border-surface-600 hover:-translate-y-1
                 transition-all duration-300 animate-slide-up overflow-hidden
                 motion-reduce:transition-none motion-reduce:hover:translate-y-0
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900"
      style={{ animationDelay: `${0.08 + indice * 0.06}s` }}
    >
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl
                      bg-gradient-to-br ${accent} mb-4 shadow-lg self-start`} aria-hidden="true">
        <Icono size={22} className="text-white" />
      </div>

      <h2 className="font-body font-semibold text-white text-base mb-1 group-hover:text-brand-300 transition-colors">
        {titulo}
      </h2>
      <p className="text-surface-200 text-sm font-body leading-relaxed">{descripcion}</p>

      <div className="flex items-center gap-1 mt-auto pt-4 text-surface-200 group-hover:text-brand-400 group-focus-visible:text-brand-400 text-xs font-body transition-colors">
        <span>Acceder</span>
        <ArrowRight size={13} aria-hidden="true"
          className="group-hover:translate-x-1 transition-transform motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
      </div>

      <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${accent}
                      opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-300`} />
    </Link>
  )
}
