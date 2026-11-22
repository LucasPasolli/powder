// src/components/encargos/EncargosListado.jsx
// Listado de encargos. Mismo layout y estados que PedidosListado (Pedidos), Historial y Saldos:
//   mobile  (< 768 px)  → grilla de tarjetas (1 col, 2 desde sm); «Cancelar encargo» a ancho completo.
//   tablet  (768–1023)  → tabla; la columna secundaria (Fecha) se colapsa y su dato viaja bajo el ID.
//   desktop (≥ 1024)    → tabla completa.
//
// El cambio de presentación es 100 % CSS (md: / lg:): sin estado por breakpoint, rotar no remonta nada.
// La tabla scrollea dentro de su contenedor: la página nunca tiene scroll horizontal.
// Estados: cargando (skeleton) · error (reintentar) · vacío (sin encargos / sin coincidencias).
// Alineación: texto a la izquierda. El módulo no maneja montos ni cantidades totales por fila
// (las cantidades van dentro de «Productos solicitados»), por eso no hay columnas numéricas a la derecha;
// sólo la columna de acciones se alinea a la derecha. Fecha: dd/mm/aaaa (fmtFecha, como Pedidos).

import { AlertTriangle, ClipboardList } from 'lucide-react'
import { Button, Card } from '../ui'
import { fmtFecha } from '../pedidos/pedidosPresentacion'
import { nombreCompletoCliente, puedeCancelarEncargo } from '../../lib/encargos'
import { EstadoEncargoBadge, LineasEncargo } from './encargosPresentacion'

// ─── Estados transversales (misma estructura que Pedidos / Saldos / Historial) ─

function ListSkeleton() {
  return (
    <div role="status" className="p-3 grid gap-3 sm:grid-cols-2 md:grid-cols-1">
      <span className="sr-only">Cargando encargos…</span>
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
      <p className="text-surface-300 text-sm font-body">No pudimos cargar los encargos. Revisá tu conexión e intentá de nuevo.</p>
      <Button variant="secondary" className="min-h-[44px]" onClick={onRetry}>Reintentar</Button>
    </div>
  )
}

function EmptyState({ sinEncargos, hayFiltros, onClear }) {
  return (
    <div className="flex flex-col items-center py-16 px-4 gap-3 text-surface-500 text-center">
      <ClipboardList size={32} className="opacity-30" aria-hidden="true" />
      <p className="font-body text-sm">
        {sinEncargos ? 'Todavía no hay encargos registrados.' : 'No hay encargos que coincidan con los filtros.'}
      </p>
      {hayFiltros && onClear && (
        <Button variant="secondary" className="min-h-[44px]" onClick={onClear}>Limpiar filtros</Button>
      )}
    </div>
  )
}

// ─── Piezas compartidas por tarjeta y tabla ───────────────────────────────────

function ReferenciaPedido({ encargo }) {
  if (!encargo.idPedido) return null
  return <p className="text-surface-400 text-xs font-mono mt-1">Pedido #{encargo.idPedido}</p>
}

function AccionCancelar({ encargo, onCancelar, className = '' }) {
  if (!puedeCancelarEncargo(encargo)) {
    return <span className="text-surface-600 text-sm" aria-label="Sin acciones disponibles">—</span>
  }
  return (
    <Button size="sm" variant="secondary" className={`min-h-[44px] ${className}`} onClick={() => onCancelar(encargo)}>
      Cancelar encargo{' '}<span className="sr-only">#{encargo.idEncargo}</span>
    </Button>
  )
}

// ─── Vista de tarjeta (< 768 px) ───────────────────────────────────────────────
// Misma anatomía que PedidoCard: cliente + «#ID · fecha» · estado (arriba) → dl → acción.

function EncargoCard({ encargo: e, onCancelar }) {
  return (
    <article className="h-full flex flex-col gap-3 bg-surface-700/40 border border-surface-700 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-body font-medium leading-tight break-words">{nombreCompletoCliente(e.cliente)}</p>
          <p className="text-surface-400 text-xs font-mono mt-1">
            <span className="text-brand-400 font-bold">#{e.idEncargo}</span> · {fmtFecha(e.fecha)}
          </p>
        </div>
        <div className="flex-shrink-0"><EstadoEncargoBadge estado={e.estado} /></div>
      </div>

      <dl className="text-xs font-body">
        <dt className="text-surface-500 mb-1">Productos solicitados</dt>
        <dd><LineasEncargo detalles={e.detalles} /></dd>
      </dl>
      <ReferenciaPedido encargo={e} />

      {puedeCancelarEncargo(e) && <AccionCancelar encargo={e} onCancelar={onCancelar} className="w-full mt-auto justify-center" />}
    </article>
  )
}

function EncargosCardList({ items, onCancelar, loading }) {
  return (
    <ul aria-label="Listado de encargos" aria-busy={loading} className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
      {items.map((e) => <li key={e.idEncargo}><EncargoCard encargo={e} onCancelar={onCancelar} /></li>)}
    </ul>
  )
}

// ─── Vista de tabla (≥ 768 px) ─────────────────────────────────────────────────
// En tablet la fecha se colapsa (`hidden lg:table-cell`) y viaja bajo el ID (`lg:hidden`), como en Pedidos.

const COLUMNAS = [
  { key: 'id',        label: 'ID' },
  { key: 'fecha',     label: 'Fecha',                 cls: 'hidden lg:table-cell' },
  { key: 'cliente',   label: 'Cliente' },
  { key: 'productos', label: 'Productos solicitados' },
  { key: 'estado',    label: 'Estado' },
  { key: 'accion',    label: '', sr: 'Acciones', cls: 'text-right' },
]

function EncargoRow({ encargo: e, onCancelar }) {
  return (
    <tr className="border-b border-surface-700/50 last:border-0 align-top">
      <td className="py-3 px-3 whitespace-nowrap">
        <span className="text-brand-400 font-mono text-sm font-bold">#{e.idEncargo}</span>
        <span className="block lg:hidden text-surface-500 text-xs font-mono">{fmtFecha(e.fecha)}</span>
      </td>
      <td className="hidden lg:table-cell py-3 px-3 text-surface-300 font-mono text-xs whitespace-nowrap">{fmtFecha(e.fecha)}</td>
      <td className="py-3 px-3 text-white text-sm font-body leading-tight break-words max-w-[14rem]">{nombreCompletoCliente(e.cliente)}</td>
      <td className="py-3 px-3 min-w-[12rem]"><LineasEncargo detalles={e.detalles} /></td>
      <td className="py-3 px-3 whitespace-nowrap"><EstadoEncargoBadge estado={e.estado} /><ReferenciaPedido encargo={e} /></td>
      <td className="py-3 px-3 text-right"><AccionCancelar encargo={e} onCancelar={onCancelar} /></td>
    </tr>
  )
}

function EncargosTable({ items, onCancelar, loading }) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm font-body" aria-busy={loading}>
        <caption className="sr-only">Listado de encargos de clientes</caption>
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
          {items.map((e) => <EncargoRow key={e.idEncargo} encargo={e} onCancelar={onCancelar} />)}
        </tbody>
      </table>
    </div>
  )
}

// ─── Contenedor ────────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {import('../../services/encargosService').Encargo[]} props.encargos  Página actual.
 * @param {number} props.totalSinFiltrar
 * @param {boolean} props.loading
 * @param {unknown} props.error
 * @param {()=>void} props.onRetry
 * @param {(e: object)=>void} props.onCancelar
 * @param {boolean} [props.hayFiltros]
 * @param {()=>void} [props.onLimpiarFiltros]
 * @param {React.ReactNode} [props.footer]  Paginador: queda DENTRO del mismo Card que la lista.
 */
export default function EncargosListado({
  encargos, totalSinFiltrar, loading, error, onRetry, onCancelar,
  hayFiltros = false, onLimpiarFiltros, footer,
}) {
  let contenido
  if (loading && encargos.length === 0) contenido = <ListSkeleton />
  else if (error) contenido = <ListError onRetry={onRetry} />
  else if (encargos.length === 0) contenido = <EmptyState sinEncargos={totalSinFiltrar === 0} hayFiltros={hayFiltros} onClear={onLimpiarFiltros} />
  else {
    contenido = (
      <>
        <EncargosCardList items={encargos} onCancelar={onCancelar} loading={loading} />
        <EncargosTable items={encargos} onCancelar={onCancelar} loading={loading} />
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
