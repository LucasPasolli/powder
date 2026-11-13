// src/components/pedidos/PedidosListado.jsx
// Listado de pedidos de compra. Mismo layout que Historial y Saldos:
//   mobile  (< 768 px)  → grilla de tarjetas (1 col, 2 desde sm) con acción explícita «Ver detalle».
//   tablet  (768–1023)  → tabla; las columnas secundarias (Fecha, Método) se colapsan y su dato
//                         viaja bajo otra celda (nada queda oculto, sin filas expandibles).
//   desktop (≥ 1024)    → tabla completa.
//
// El cambio de presentación es 100 % CSS (md: / lg:), igual que Saldos: no hay estado por
// breakpoint, así que rotar el equipo no re-monta nada ni produce «flash» de layout.
// Estados: cargando (skeleton), error (reintentar) y vacío (limpiar filtros).

import { AlertTriangle, Eye, ShoppingCart } from 'lucide-react'
import { Button, Card } from '../ui'
import {
  EstadoLogisticoBadge, PagoBadge, fmt, fmtFecha, metodoPagoLabel,
} from './pedidosPresentacion'

// ─── Estados transversales (misma estructura que Saldos / Historial) ──────────

function ListSkeleton() {
  return (
    <div role="status" className="p-3 grid gap-3 sm:grid-cols-2 md:grid-cols-1">
      <span className="sr-only">Cargando pedidos…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-28 md:h-14 rounded-xl bg-surface-700/50 animate-pulse motion-reduce:animate-none" />
      ))}
    </div>
  )
}

function ListError({ onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center py-12 px-4 gap-3 text-center">
      <AlertTriangle size={28} className="text-red-400" aria-hidden="true" />
      <p className="text-surface-300 text-sm font-body">No pudimos cargar los pedidos. Revisá tu conexión e intentá de nuevo.</p>
      <Button variant="secondary" className="min-h-[44px]" onClick={onRetry}>Reintentar</Button>
    </div>
  )
}

function EmptyState({ sinPedidos, hayFiltros, onClear }) {
  return (
    <div className="flex flex-col items-center py-16 px-4 gap-3 text-surface-500 text-center">
      <ShoppingCart size={32} className="opacity-30" aria-hidden="true" />
      <p className="font-body text-sm">
        {sinPedidos ? 'Sin pedidos registrados.' : 'No hay pedidos que coincidan con los filtros.'}
      </p>
      {hayFiltros && onClear && (
        <Button variant="secondary" className="min-h-[44px]" onClick={onClear}>Limpiar filtros</Button>
      )}
    </div>
  )
}

// ─── Vista de tarjeta (< 768 px) ───────────────────────────────────────────────
// Misma anatomía que PresupuestoCard / SaldoCard:
//   proveedor + «#ID · fecha» · estado (arriba)  →  monto  →  dl de 2 columnas  →  «Ver detalle».

function PedidoCard({ pedido: p, resumen, onAbrir }) {
  return (
    <article onClick={() => onAbrir(p)}
      className="h-full flex flex-col gap-3 bg-surface-700/40 border border-surface-700 rounded-xl p-4
                 cursor-pointer active:bg-surface-700/70 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-body font-medium leading-tight break-words">
            {p.nombreProveedor || <span className="text-surface-500">Sin proveedor</span>}
          </p>
          <p className="text-surface-400 text-xs font-mono mt-1">
            <span className="text-brand-400 font-bold">#{p.idPedido}</span> · {fmtFecha(p.fecha)}
          </p>
        </div>
        <div className="flex-shrink-0"><EstadoLogisticoBadge pedido={p} /></div>
      </div>

      <p className="text-white font-mono font-medium text-xl">{fmt(p.monto)}</p>

      <dl className="grid grid-cols-2 gap-3 text-xs font-body">
        <div>
          <dt className="text-surface-500">Método</dt>
          <dd className="text-surface-300 mt-1">{metodoPagoLabel(p)}</dd>
        </div>
        <div>
          <dt className="text-surface-500">Pago</dt>
          <dd className="mt-1"><PagoBadge pedido={p} resumen={resumen} /></dd>
        </div>
      </dl>

      <Button variant="secondary" icon={Eye} className="w-full min-h-[44px] mt-auto"
        aria-label={`Ver pedido ${p.idPedido}`}
        onClick={(e) => { e.stopPropagation(); onAbrir(p) }}>
        Ver detalle
      </Button>
    </article>
  )
}

function PedidosCardList({ items, cuotasResumen, onAbrir, loading }) {
  return (
    <ul aria-label="Listado de pedidos" aria-busy={loading}
      className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
      {items.map((p) => (
        <li key={p.idPedido}><PedidoCard pedido={p} resumen={cuotasResumen[p.idPedido]} onAbrir={onAbrir} /></li>
      ))}
    </ul>
  )
}

// ─── Vista de tabla (≥ 768 px) ─────────────────────────────────────────────────
// En tablet (768–1023 px) se colapsan las columnas secundarias (`hidden lg:table-cell`) y su
// información se reubica bajo otra celda (`lg:hidden`), exactamente como en Saldos.

const COLUMNAS = [
  { key: 'id',        label: 'ID' },
  { key: 'fecha',     label: 'Fecha pedido',     cls: 'hidden lg:table-cell' },
  { key: 'proveedor', label: 'Proveedor' },
  { key: 'monto',     label: 'Monto' },
  { key: 'metodo',    label: 'Método pago',      cls: 'hidden lg:table-cell' },
  { key: 'estadoTab', label: 'Estado',           cls: 'lg:hidden' },
  { key: 'logistico', label: 'Estado logístico', cls: 'hidden lg:table-cell' },
  { key: 'pago',      label: 'Pago',             cls: 'hidden lg:table-cell' },
  { key: 'accion',    label: '', sr: 'Acciones' },
]

function PedidoRow({ pedido: p, resumen, onAbrir }) {
  return (
    <tr onClick={() => onAbrir(p)}
      className="border-b border-surface-700/50 hover:bg-surface-700/40 active:bg-surface-700/60 cursor-pointer transition-colors">
      <td className="py-1 px-3">
        {/* Botón real: da acceso por teclado y lectores de pantalla (la fila sola no lo tiene) */}
        <button type="button" aria-label={`Ver pedido ${p.idPedido}`}
          onClick={(e) => { e.stopPropagation(); onAbrir(p) }}
          className="min-h-[44px] min-w-[44px] text-left text-brand-400 font-mono text-sm font-bold rounded
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
          #{p.idPedido}
        </button>
        {/* En tablet la fecha viaja bajo el ID */}
        <span className="block lg:hidden text-surface-500 text-xs font-mono">{fmtFecha(p.fecha)}</span>
      </td>
      <td className="hidden lg:table-cell py-3 px-3 text-surface-300 font-mono text-xs">{fmtFecha(p.fecha)}</td>
      <td className="py-3 px-3">
        {p.nombreProveedor
          ? <p className="text-white text-sm font-body leading-tight">{p.nombreProveedor}</p>
          : <span className="text-surface-500 text-sm font-body">—</span>}
      </td>
      <td className="py-3 px-3 whitespace-nowrap">
        <p className="text-white font-mono font-medium">{fmt(p.monto)}</p>
        {/* En tablet el método de pago viaja bajo el monto */}
        <p className="lg:hidden text-surface-500 text-xs font-body mt-0.5">{metodoPagoLabel(p)}</p>
      </td>
      <td className="hidden lg:table-cell py-3 px-3 text-surface-300 text-xs font-body">{metodoPagoLabel(p)}</td>
      <td className="lg:hidden py-3 px-3">
        <div className="flex flex-col items-start gap-1.5">
          <EstadoLogisticoBadge pedido={p} />
          <PagoBadge pedido={p} resumen={resumen} />
        </div>
      </td>
      <td className="hidden lg:table-cell py-3 px-3"><EstadoLogisticoBadge pedido={p} /></td>
      <td className="hidden lg:table-cell py-3 px-3"><PagoBadge pedido={p} resumen={resumen} /></td>
      <td className="py-3 px-3 text-surface-500"><ShoppingCart size={14} aria-hidden="true" /></td>
    </tr>
  )
}

function PedidosTable({ items, cuotasResumen, onAbrir, loading }) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm font-body" aria-busy={loading}>
        <caption className="sr-only">Listado de pedidos de compra</caption>
        <thead>
          <tr className="border-b border-surface-700">
            {COLUMNAS.map((c) => (
              <th key={c.key} scope="col"
                className={`text-left text-surface-400 text-xs tracking-widest uppercase py-3 px-3 font-body ${c.cls ?? ''}`}>
                {c.label}{c.sr && <span className="sr-only">{c.sr}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <PedidoRow key={p.idPedido} pedido={p} resumen={cuotasResumen[p.idPedido]} onAbrir={onAbrir} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Contenedor ────────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {object[]} props.pedidos        Página actual.
 * @param {object}   props.cuotasResumen  { [idPedido]: resumen }.
 * @param {number}   props.totalSinFiltrar Cantidad de pedidos antes del filtro de proveedor (para el mensaje vacío).
 * @param {boolean}  props.loading
 * @param {Error|null} props.error
 * @param {()=>void} props.onRetry
 * @param {(p:object)=>void} props.onAbrir
 * @param {boolean}  [props.hayFiltros]       Hay búsqueda/filtros activos: habilita «Limpiar filtros» en el estado vacío.
 * @param {()=>void} [props.onLimpiarFiltros]
 * @param {React.ReactNode} [props.footer] Paginador: queda DENTRO del mismo Card que la lista.
 */
export default function PedidosListado({
  pedidos, cuotasResumen, totalSinFiltrar, loading, error, onRetry, onAbrir,
  hayFiltros = false, onLimpiarFiltros, footer,
}) {
  let contenido
  if (error && totalSinFiltrar === 0) {
    contenido = <ListError onRetry={onRetry} />
  } else if (loading && totalSinFiltrar === 0) {
    contenido = <ListSkeleton />
  } else if (pedidos.length === 0) {
    contenido = <EmptyState sinPedidos={totalSinFiltrar === 0 && !hayFiltros} hayFiltros={hayFiltros} onClear={onLimpiarFiltros} />
  } else {
    contenido = (
      <>
        <PedidosCardList items={pedidos} cuotasResumen={cuotasResumen} onAbrir={onAbrir} loading={loading} />
        <PedidosTable items={pedidos} cuotasResumen={cuotasResumen} onAbrir={onAbrir} loading={loading} />
      </>
    )
  }

  return (
    <Card className="overflow-hidden">
      {contenido}
      {footer}
    </Card>
  )
}
