// src/components/encargos/EncargosVista.jsx
// Pantalla «Encargos de clientes» dentro del módulo de Pedidos de Compra.
// Filtro por estado (servidor) + búsqueda de texto (memoria) + paginación, con el mismo
// comportamiento que el listado de pedidos (usePaginatedList: reload no resetea la página).

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ClipboardList, Search, WifiOff } from 'lucide-react'
import { Button, PageHeader } from '../ui'
import PaginadorListado from '../ui/PaginadorListado'
import { usePaginatedList } from '../../hooks/usePaginatedList'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useScrollAnchor } from '../../hooks/useScrollToTopOnChange'
import { obtenerEncargos } from '../../services/encargosService'
import { ESTADOS_ENCARGO, ETIQUETA_ESTADO_ENCARGO, filtrarEncargos } from '../../lib/encargos'
import { TOUCH } from '../pedidos/pedidosPresentacion'
import EncargosListado from './EncargosListado'
import CancelarEncargoDialog from './CancelarEncargoDialog'

const PAGE_SIZE = 20
const FILTROS_ESTADO = [{ valor: 'all', etiqueta: 'Todos' }, ...ESTADOS_ENCARGO.map((e) => ({ valor: e, etiqueta: ETIQUETA_ESTADO_ENCARGO[e] }))]

/**
 * @param {object} props
 * @param {()=>void} props.onVolver
 * @param {()=>void} props.onCrear                 Abre el diálogo «Crear Encargo» (lo gestiona el padre).
 * @param {number} props.refrescarClave            Cambia cuando el padre creó/modificó encargos → recarga.
 * @param {(mensaje:string)=>void} props.onToast
 * @param {()=>void} props.onCambioEstado          Avisa al padre para refrescar el contador de pendientes.
 */
export default function EncargosVista({ onVolver, onCrear, refrescarClave, onToast, onCambioEstado }) {
  const online = useOnlineStatus()
  const [estado, setEstado] = useState('all')
  const [texto, setTexto] = useState('')
  const [aCancelar, setACancelar] = useState(null)
  const { anchorRef, scrollToStart } = useScrollAnchor()

  const { pageItems: pagina, items: filtrados, rawItems, page, setPage, totalPages: paginas, loading, error, reload } = usePaginatedList({
    fetcher: (f) => obtenerEncargos({ estado: f.estado !== 'all' ? f.estado : null }),
    serverFilters: { estado },
    clientFilters: { texto },
    // Búsqueda en memoria (sin tildes, varias palabras): el hook resetea la página al cambiar el texto.
    clientFilter: (e, cf) => filtrarEncargos([e], cf.texto).length > 0,
    pageSize: PAGE_SIZE,
  })

  // El padre creó un encargo (o vinculó/canceló): recarga SIN resetear la página.
  const primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    reload()
  }, [refrescarClave]) // eslint-disable-line react-hooks/exhaustive-deps

  const hayFiltros = estado !== 'all' || texto.trim() !== ''

  return (
    <div className="w-full min-w-0 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <button type="button" onClick={onVolver}
        className="flex items-center gap-2 -ml-2 px-2 min-h-[44px] min-[1025px]:min-h-0 text-surface-300 hover:text-white text-sm font-body transition-colors">
        <ArrowLeft size={16} aria-hidden="true" />Volver a pedidos
      </button>

      {!online && (
        <div role="status" className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
          <WifiOff size={16} className="text-yellow-400 flex-shrink-0" aria-hidden="true" />
          <p className="text-yellow-300 text-xs font-body">Sin conexión. Los datos pueden estar desactualizados y no se podrán guardar cambios.</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <PageHeader title="Encargos de clientes" subtitle="Mercadería solicitada por clientes" />
        <Button icon={ClipboardList} className={`w-full sm:w-auto ${TOUCH}`} onClick={onCrear}>Crear Encargo</Button>
      </div>

      <div className="space-y-3">
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
          {FILTROS_ESTADO.map((f) => (
            <button key={f.valor} type="button" aria-pressed={estado === f.valor}
              onClick={() => { setEstado(f.valor); setPage(1) }}
              className={`px-4 ${TOUCH} rounded-xl text-sm font-body border transition-all
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60
                ${estado === f.valor ? 'bg-brand-500/15 border-brand-500/40 text-white' : 'bg-surface-700 border-surface-600 text-surface-300 hover:border-surface-500'}`}>
              {f.etiqueta}
            </button>
          ))}
        </div>
        <div className="relative">
          <label htmlFor="busqueda-encargos" className="sr-only">Buscar encargos por cliente, producto o número</label>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" aria-hidden="true" />
          <input id="busqueda-encargos" type="search" value={texto} maxLength={60} autoComplete="off"
            onChange={(e) => { setTexto(e.target.value); setPage(1) }}
            placeholder="Buscar por cliente, producto o número"
            className="w-full bg-surface-700 border border-surface-600 rounded-xl pl-10 pr-3 min-h-[44px] text-white text-base min-[1025px]:text-sm font-body
                       placeholder:text-surface-500 focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40" />
        </div>
        <p role="status" aria-live="polite" className="text-surface-400 text-sm min-[1025px]:text-xs font-body">
          {loading ? '' : `${filtrados.length} ${filtrados.length === 1 ? 'encargo' : 'encargos'}`}
        </p>
      </div>

      <div ref={anchorRef}>
        <EncargosListado
          encargos={pagina} totalSinFiltrar={rawItems.length} loading={loading} error={error} onRetry={reload}
          onCancelar={setACancelar} hayFiltros={hayFiltros} onCrear={onCrear}
          onLimpiarFiltros={() => { setEstado('all'); setTexto(''); setPage(1) }}
          footer={<PaginadorListado page={page} totalPages={paginas} pageSize={PAGE_SIZE} total={filtrados.length}
            onChange={(n) => { setPage(n); scrollToStart() }} />}
        />
      </div>

      {aCancelar && (
        <CancelarEncargoDialog
          encargo={aCancelar}
          onClose={() => setACancelar(null)}
          onCancelado={(res) => { setACancelar(null); onToast(`Encargo #${res.idEncargo} cancelado ✓`); reload(); onCambioEstado() }}
          onDesactualizado={() => { reload(); onCambioEstado() }}
        />
      )}
    </div>
  )
}
