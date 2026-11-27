// src/components/facturas/ListadoPorMonto.jsx
// Listado editable de UN documento (Transferencia + CC / Efectivo) de «Facturar por monto».
//
// TASK 2 — edición manual, del lado del cliente: cantidad, precio sin IVA, eliminar y
// agregar productos (buscador por nombre o ID). Cada cambio recalcula en vivo, sin
// reajustar productos automáticamente.
//
// Responsive: UN solo árbol DOM; sólo cambian clases CSS (rotar el equipo no remonta
// ni pierde lo tipeado).
//   · mobile (≤ 767 px)     → cada línea es una tarjeta: nombre + marcas, Cantidad y
//                             Precio lado a lado, Subtotal y «Eliminar» al pie.
//   · tablet/desktop (≥ 768) → grilla tipo tabla (Producto · Cant. · Precio · Subtotal · ✕).
// Teclado móvil: cantidad `inputMode="numeric"`, precio `inputMode="decimal"`.
// Accesibilidad: cada campo tiene <label> (visible en mobile, sr-only en tabla), error por
// campo con role="alert", marcas con texto (no sólo color), áreas táctiles ≥ 44 px.
import { memo, useId } from 'react'
import { AlertCircle, ChevronDown, Trash2 } from 'lucide-react'
import { Badge } from '../ui'
import SelectorProducto from '../encargos/SelectorProducto'
import { fmt } from '../../lib/facturas'
import { MARCA_LABEL, marcaDe, precioEditado, subtotalNeto, textoEditable } from '../../lib/facturarPorMonto'
import { FOCO } from './estilos'

const COLOR_MARCA = { agregada: 'green', aumentada: 'blue', reducida: 'yellow' }

/** Misma plantilla de columnas para el encabezado y las filas (tablet/desktop). */
const COLUMNAS = 'min-[768px]:grid-cols-[minmax(0,1fr)_6.5rem_10.5rem_9rem_2.75rem]'

const CAMPO = `w-full min-h-[44px] min-[1025px]:min-h-[40px] bg-surface-700 border rounded-xl px-3 text-white text-base sm:text-sm
  font-mono tabular-nums text-right placeholder-surface-500 focus:outline-none focus:ring-1 transition-colors`
const BORDE_OK = 'border-surface-600 focus:border-brand-500 focus:ring-brand-500/30'
const BORDE_ERR = 'border-red-500 focus:border-red-500 focus:ring-red-500/30'

/**
 * @param {object} props
 * @param {'noEfectivo'|'efectivo'} props.doc
 * @param {import('../../lib/facturarPorMonto').DocEditable} props.datos
 * @param {{porClave: Record<string,{cantidad?:string,precio?:string}>, sinLineas: boolean}} props.validacion
 * @param {{totalCentavos:number, netoCentavos:number, ivaCentavos:number}} props.totales
 * @param {number} props.alicuota
 * @param {(doc:string, clave:string, texto:string)=>void} props.onCantidad
 * @param {(doc:string, clave:string, texto:string)=>void} props.onPrecio
 * @param {(doc:string, clave:string)=>void} props.onEliminar
 * @param {(doc:string, producto:object)=>void} props.onAgregar   Recibe el producto del catálogo.
 */
export default function ListadoPorMonto({ doc, datos, validacion, totales, alicuota, onCantidad, onPrecio, onEliminar, onAgregar }) {
  const idBase = useId()
  const { lineas, quitadas } = datos

  return (
    <div className="space-y-4 min-w-0">
      <SelectorProducto destino="listado" onElegir={(p) => onAgregar(doc, p)} />

      {validacion.sinLineas && (
        <p role="alert" className="flex items-start gap-2 text-red-400 text-base sm:text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5 font-body">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          El listado no puede quedar sin líneas. Agregá un producto o usá «Restablecer».
        </p>
      )}

      {lineas.length === 0 && !validacion.sinLineas && (
        <p className="text-surface-400 text-base sm:text-sm font-body py-6 text-center">
          No hay líneas para este tipo de documento.
        </p>
      )}

      {lineas.length > 0 && (
        <div role="group" aria-label="Líneas del listado" className="min-w-0">
          {/* Encabezado visual de la grilla (tablet/desktop). Los campos tienen su propio <label>. */}
          <div aria-hidden="true" className={`hidden min-[768px]:grid ${COLUMNAS} gap-3 px-3 pb-2 text-surface-400 text-xs uppercase tracking-widest font-body`}>
            <span>Producto</span>
            <span className="text-right">Cant.</span>
            <span className="text-right">P. unit. s/IVA</span>
            <span className="text-right">Subtotal s/IVA</span>
            <span />
          </div>

          <ul className="space-y-3 min-[768px]:space-y-0 min-[768px]:divide-y min-[768px]:divide-surface-700/60">
            {lineas.map((l) => (
              <FilaLinea key={l.clave} idBase={idBase} doc={doc} linea={l} errores={validacion.porClave[l.clave]}
                onCantidad={onCantidad} onPrecio={onPrecio} onEliminar={onEliminar} />
            ))}
          </ul>
        </div>
      )}

      {quitadas.length > 0 && (
        <details className="group bg-surface-900/40 border border-surface-700 rounded-xl">
          <summary className={`flex items-center justify-between gap-3 min-h-[44px] px-4 cursor-pointer list-none text-surface-300 text-base sm:text-sm font-body rounded-xl ${FOCO}`}>
            <span>{quitadas.length} {quitadas.length === 1 ? 'línea quitada' : 'líneas quitadas'} respecto de Facturas</span>
            <ChevronDown size={16} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <ul className="px-4 pb-3 space-y-1.5 text-surface-300 text-base sm:text-sm font-body">
            {quitadas.map((q) => (
              <li key={q.idProducto} className="flex justify-between gap-3 min-w-0">
                <span className="min-w-0 break-words line-through decoration-surface-500">{q.nombre}</span>
                <span className="font-mono tabular-nums flex-shrink-0">{q.cantidadBase} u.</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <PieTotales totales={totales} alicuota={alicuota} />
    </div>
  )
}

// ─── Fila ──────────────────────────────────────────────────────────────────

const FilaLinea = memo(function FilaLinea({ idBase, doc, linea: l, errores, onCantidad, onPrecio, onEliminar }) {
  const marca = marcaDe(l)
  const editado = precioEditado(l)
  const idCant = `${idBase}-${doc}-${l.clave}-c`
  const idPrec = `${idBase}-${doc}-${l.clave}-p`
  const valorPrecio = l.precioTexto ?? textoEditable(l.precioNeto)

  return (
    <li className={`grid grid-cols-2 ${COLUMNAS} gap-3 items-start p-3 min-[768px]:px-3 min-[768px]:py-3
                    bg-surface-900/40 min-[768px]:bg-transparent border border-surface-700 min-[768px]:border-0 rounded-xl min-[768px]:rounded-none`}>
      {/* Producto + marcas internas (nunca van al PDF) */}
      <div className="col-span-2 min-[768px]:col-span-1 min-w-0">
        <p className="text-white text-base sm:text-sm font-body font-medium break-words">{l.nombre}</p>
        {(marca || editado || !l.activo) && (
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {marca && <Badge color={COLOR_MARCA[marca]}>{MARCA_LABEL[marca]}{marca !== 'agregada' ? ` (era ${l.cantidadBase})` : ''}</Badge>}
            {editado && <Badge color="violet">Precio editado</Badge>}
            {!l.activo && <Badge color="gray">Producto inactivo</Badge>}
          </p>
        )}
      </div>

      {/* Cantidad */}
      <div className="min-w-0">
        <label htmlFor={idCant} className="block mb-1 text-surface-300 text-sm tracking-widest uppercase font-body min-[768px]:sr-only">
          Cantidad<span className="sr-only"> de {l.nombre}</span>
        </label>
        <input id={idCant} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={7}
          value={l.cantidadTexto} onChange={(e) => onCantidad(doc, l.clave, e.target.value)}
          aria-invalid={errores?.cantidad ? true : undefined} aria-describedby={errores?.cantidad ? `${idCant}-e` : undefined}
          className={`${CAMPO} ${errores?.cantidad ? BORDE_ERR : BORDE_OK}`} />
        {errores?.cantidad && <p id={`${idCant}-e`} role="alert" className="mt-1 text-red-400 text-sm min-[1025px]:text-xs font-body break-words">{errores.cantidad}</p>}
      </div>

      {/* Precio unitario sin IVA + referencia registrada */}
      <div className="min-w-0">
        <label htmlFor={idPrec} className="block mb-1 text-surface-300 text-sm tracking-widest uppercase font-body min-[768px]:sr-only">
          Precio s/IVA<span className="sr-only"> de {l.nombre}</span>
        </label>
        <input id={idPrec} type="text" inputMode="decimal" autoComplete="off" maxLength={16}
          value={valorPrecio} onChange={(e) => onPrecio(doc, l.clave, e.target.value)}
          aria-invalid={errores?.precio ? true : undefined}
          aria-describedby={[errores?.precio && `${idPrec}-e`, l.precioReferenciaNeto != null && `${idPrec}-r`].filter(Boolean).join(' ') || undefined}
          className={`${CAMPO} ${errores?.precio ? BORDE_ERR : BORDE_OK}`} />
        {errores?.precio && <p id={`${idPrec}-e`} role="alert" className="mt-1 text-red-400 text-sm min-[1025px]:text-xs font-body break-words">{errores.precio}</p>}
        {l.precioReferenciaNeto != null && (
          <p id={`${idPrec}-r`} className={`mt-1 text-right text-sm min-[1025px]:text-xs font-body ${editado ? 'text-violet-300' : 'text-surface-400'}`}>
            Registrado: <span className="font-mono tabular-nums">{fmt(l.precioReferenciaNeto)}</span>
          </p>
        )}
      </div>

      {/* Subtotal + eliminar */}
      <div className="col-span-2 min-[768px]:col-span-1 min-[768px]:row-start-1 min-[768px]:col-start-4 flex items-center justify-between min-[768px]:justify-end gap-3 min-w-0 min-[768px]:min-h-[44px] min-[1025px]:min-h-[40px]">
        <span className="min-[768px]:hidden text-surface-300 text-sm tracking-widest uppercase font-body">Subtotal s/IVA</span>
        <span className="text-surface-100 font-mono font-semibold tabular-nums text-base sm:text-sm break-words text-right">{fmt(subtotalNeto(l))}</span>
      </div>
      <div className="col-span-2 min-[768px]:col-span-1 min-[768px]:row-start-1 min-[768px]:col-start-5 flex justify-end">
        <button type="button" onClick={() => onEliminar(doc, l.clave)} aria-label={`Eliminar ${l.nombre}`}
          className={`inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 text-base sm:text-sm font-body ${FOCO}`}>
          <Trash2 size={16} aria-hidden="true" />
          <span className="min-[768px]:sr-only">Eliminar</span>
        </button>
      </div>
    </li>
  )
})

// ─── Pie ───────────────────────────────────────────────────────────────────

function PieTotales({ totales, alicuota }) {
  const pct = `${Math.round(alicuota * 1000) / 10}`.replace('.', ',')
  return (
    <dl className="ml-auto w-full min-[768px]:max-w-sm space-y-1.5 bg-surface-900/40 border border-surface-700 rounded-xl p-4 font-body">
      <Fila rotulo="Subtotal neto" valor={fmt(totales.netoCentavos / 100)} />
      <Fila rotulo={`IVA (${pct} %)`} valor={fmt(totales.ivaCentavos / 100)} />
      <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-surface-700">
        <dt className="text-white text-base sm:text-sm font-semibold">Total con IVA</dt>
        <dd className="text-brand-400 font-mono font-bold text-lg sm:text-base tabular-nums break-words text-right">{fmt(totales.totalCentavos / 100)}</dd>
      </div>
    </dl>
  )
}

function Fila({ rotulo, valor }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-base sm:text-sm">
      <dt className="text-surface-300">{rotulo}</dt>
      <dd className="text-surface-100 font-mono tabular-nums break-words text-right">{valor}</dd>
    </div>
  )
}
