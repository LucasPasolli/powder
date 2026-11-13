// src/components/promociones/ProductosAsociados.jsx
// Muestra los productos de una promoción «Producto específico» dentro del listado
// SIN romper el layout (Task 1 · Esc. 7):
//   · 1 producto  → «#12 · Nombre» en una línea (comportamiento previo).
//   · N productos → «N productos» + vista previa del primero; un botón de disclosure
//                   (aria-expanded) despliega la lista completa con scroll interno
//                   acotado. Sirve igual en la tabla (desktop/tablet) y en las
//                   tarjetas apiladas de mobile.
// El estado abierto/cerrado es local de cada fila: no afecta a la página ni a la paginación.

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { textoCantidadProductos } from '../../lib/promocionesConfig'

const etiqueta = (p) => `#${p.idProducto} · ${p.nombre ?? 'Producto sin nombre'}`

/** @param {{ productos: Array<{idProducto:number, nombre:string|null}> }} props */
export default function ProductosAsociados({ productos }) {
  const [abierto, setAbierto] = useState(false)
  const panelId = useId()

  if (!productos?.length) {
    return <p className="text-surface-500 text-xs font-body">Sin productos asociados</p>
  }

  if (productos.length === 1) {
    const texto = etiqueta(productos[0])
    return (
      <p title={texto} className="text-surface-500 text-xs font-body mt-0.5 break-words md:truncate md:max-w-[180px]">
        {texto}
      </p>
    )
  }

  return (
    <div className="mt-0.5 min-w-0 md:max-w-[220px]">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={panelId}
        className="inline-flex items-center gap-1 min-h-[44px] md:min-h-0 rounded-lg text-brand-400 hover:text-brand-300
                   text-xs font-body font-semibold focus-visible:outline-none focus-visible:ring-2
                   focus-visible:ring-brand-500/60"
      >
        {textoCantidadProductos(productos.length)}
        <ChevronDown size={14} aria-hidden="true"
          className={`transition-transform motion-reduce:transition-none ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {!abierto && (
        <p className="text-surface-500 text-xs font-body break-words md:truncate" title={etiqueta(productos[0])}>
          {etiqueta(productos[0])} y {productos.length - 1} más
        </p>
      )}

      <ul id={panelId} hidden={!abierto}
        className="mt-1 max-h-40 overflow-y-auto overscroll-contain space-y-1 rounded-lg bg-surface-700/50 p-2">
        {productos.map((p) => (
          <li key={p.idProducto} className="text-surface-300 text-xs font-body break-words">{etiqueta(p)}</li>
        ))}
      </ul>
    </div>
  )
}
