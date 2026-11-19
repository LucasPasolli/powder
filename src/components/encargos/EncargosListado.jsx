// src/components/encargos/EncargosListado.jsx
// Listado de encargos (Task 1 · Escenario 5): estado, cliente y detalle de productos solicitados.
//   mobile  (< 768 px)  → tarjetas apiladas, con «Cancelar Encargo» a ancho completo.
//   tablet+ (≥ 768 px)  → tabla de 5 columnas (Encargo · Cliente · Productos · Estado · Acciones);
//                         ningún dato se oculta en ningún ancho.
// El cambio de presentación es 100 % CSS (md:): sin estado por breakpoint, rotar no remonta nada.
// La tabla scrollea dentro de su contenedor: la página nunca tiene scroll horizontal.
// Estados: cargando (skeleton) · error (reintentar) · vacío (sin encargos / sin coincidencias).

import { AlertTriangle, ClipboardList } from 'lucide-react'
import { Button, Card } from '../ui'
import { fmtFecha } from '../pedidos/pedidosPresentacion'
import { nombreCompletoCliente, puedeCancelarEncargo } from '../../lib/encargos'
import { EstadoEncargoBadge, LineasEncargo } from './encargosPresentacion'

function Esqueleto() {
  return (
    <div role="status" className="p-3 grid gap-3 sm:grid-cols-2 md:grid-cols-1">
      <span className="sr-only">Cargando encargos…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-28 md:h-16 rounded-xl bg-surface-700/50 animate-pulse motion-reduce:animate-none" />
      ))}
    </div>
  )
}

function ErrorCarga({ onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center py-12 px-4 gap-3 text-center">
      <AlertTriangle size={28} className="text-red-400" aria-hidden="true" />
      <p className="text-surface-300 text-sm font-body">No pudimos cargar los encargos. Revisá tu conexión e intentá de nuevo.</p>
      <Button variant="secondary" className="min-h-[44px]" onClick={onRetry}>Reintentar</Button>
    </div>
  )
}

function Vacio({ sinEncargos, hayFiltros, onLimpiar, onCrear }) {
  return (
    <div className="flex flex-col items-center py-16 px-4 gap-3 text-surface-500 text-center">
      <ClipboardList size={32} className="opacity-30" aria-hidden="true" />
      <p className="font-body text-sm">{sinEncargos ? 'Todavía no hay encargos registrados.' : 'No hay encargos que coincidan con los filtros.'}</p>
      {hayFiltros && onLimpiar && <Button variant="secondary" className="min-h-[44px]" onClick={onLimpiar}>Limpiar filtros</Button>}
      {sinEncargos && onCrear && <Button className="min-h-[44px]" onClick={onCrear}>Crear Encargo</Button>}
    </div>
  )
}

function ReferenciaPedido({ encargo }) {
  if (!encargo.idPedido) return null
  return <p className="text-surface-400 text-xs font-mono mt-1">Pedido #{encargo.idPedido}</p>
}

function AccionCancelar({ encargo, onCancelar, className = '' }) {
  if (!puedeCancelarEncargo(encargo)) return <span className="text-surface-600 text-sm" aria-label="Sin acciones disponibles">—</span>
  return (
    <Button size="sm" variant="secondary" className={`min-h-[44px] ${className}`} onClick={() => onCancelar(encargo)}>
      Cancelar Encargo{' '}<span className="sr-only">#{encargo.idEncargo}</span>
    </Button>
  )
}

function TarjetaEncargo({ encargo: e, onCancelar }) {
  return (
    <li className="rounded-xl border border-surface-700 bg-surface-800/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-body font-semibold break-words">{nombreCompletoCliente(e.cliente)}</p>
          <p className="text-surface-400 text-xs font-mono mt-0.5">#{e.idEncargo} · {fmtFecha(e.fecha)}</p>
        </div>
        <EstadoEncargoBadge estado={e.estado} />
      </div>
      <LineasEncargo detalles={e.detalles} />
      <ReferenciaPedido encargo={e} />
      {puedeCancelarEncargo(e) && <AccionCancelar encargo={e} onCancelar={onCancelar} className="w-full justify-center" />}
    </li>
  )
}

/**
 * @param {object} props
 * @param {import('../../services/encargosService').Encargo[]} props.encargos  Página actual.
 * @param {number} props.totalSinFiltrar
 * @param {boolean} props.loading
 * @param {unknown} props.error
 * @param {()=>void} props.onRetry
 * @param {(e: object)=>void} props.onCancelar
 * @param {boolean} props.hayFiltros
 * @param {()=>void} [props.onLimpiarFiltros]
 * @param {()=>void} [props.onCrear]
 * @param {React.ReactNode} [props.footer]
 */
export default function EncargosListado({ encargos, totalSinFiltrar, loading, error, onRetry, onCancelar, hayFiltros, onLimpiarFiltros, onCrear, footer }) {
  let cuerpo
  if (loading && encargos.length === 0) cuerpo = <Esqueleto />
  else if (error) cuerpo = <ErrorCarga onRetry={onRetry} />
  else if (encargos.length === 0) cuerpo = <Vacio sinEncargos={totalSinFiltrar === 0} hayFiltros={hayFiltros} onLimpiar={onLimpiarFiltros} onCrear={onCrear} />
  else {
    cuerpo = (
      <>
        <ul aria-label="Encargos" className="md:hidden p-3 grid gap-3 sm:grid-cols-2">
          {encargos.map((e) => <TarjetaEncargo key={e.idEncargo} encargo={e} onCancelar={onCancelar} />)}
        </ul>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <caption className="sr-only">Encargos de clientes</caption>
            <thead>
              <tr className="border-b border-surface-700 text-surface-400 text-xs tracking-widest uppercase font-body">
                {['Encargo', 'Cliente', 'Productos solicitados', 'Estado'].map((h) => <th key={h} scope="col" className="px-4 py-3 font-normal">{h}</th>)}
                <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {encargos.map((e) => (
                <tr key={e.idEncargo} className="border-b border-surface-700/60 last:border-0 align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="text-white text-sm font-mono">#{e.idEncargo}</p>
                    <p className="text-surface-400 text-xs font-body">{fmtFecha(e.fecha)}</p>
                  </td>
                  <td className="px-4 py-3 text-white text-sm font-body break-words max-w-[14rem]">{nombreCompletoCliente(e.cliente)}</td>
                  <td className="px-4 py-3 min-w-[12rem]"><LineasEncargo detalles={e.detalles} /></td>
                  <td className="px-4 py-3 whitespace-nowrap"><EstadoEncargoBadge estado={e.estado} /><ReferenciaPedido encargo={e} /></td>
                  <td className="px-4 py-3 text-right"><AccionCancelar encargo={e} onCancelar={onCancelar} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )
  }
  return <Card className="overflow-hidden"><div aria-busy={loading}>{cuerpo}</div>{footer}</Card>
}
