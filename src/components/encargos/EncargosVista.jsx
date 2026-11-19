// src/components/encargos/EncargosVista.jsx
// Apartado «Encargos» dentro del módulo de Pedidos de Compra.
// Es DUEÑO del flujo de alta: «Nuevo encargo» (CTA primario) abre el diálogo de creación y, al guardar,
// se vuelve al listado con el registro nuevo visible (filtros limpios, página 1, recarga).
// Filtro por estado (servidor) + búsqueda de texto (memoria) + paginación, con el mismo
// comportamiento que el listado de pedidos (usePaginatedList: reload no resetea la página).
// Mismo encabezado, filtros, listado y paginador que Pedidos de Compra.

import { useState } from 'react'
import { ArrowLeft, Plus, WifiOff } from 'lucide-react'
import { Button, PageHeader } from '../ui'
import PaginadorListado from '../ui/PaginadorListado'
import { usePaginatedList } from '../../hooks/usePaginatedList'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useScrollAnchor } from '../../hooks/useScrollToTopOnChange'
import { obtenerEncargos } from '../../services/encargosService'
import { filtrarEncargos } from '../../lib/encargos'
import { TOUCH } from '../pedidos/pedidosPresentacion'
import FiltrosEncargos, { FILTROS_ENCARGOS_INICIALES, hayFiltrosEncargos } from './FiltrosEncargos'
import EncargosListado from './EncargosListado'
import EncargoFormDialog from './EncargoFormDialog'
import CancelarEncargoDialog from './CancelarEncargoDialog'

const PAGE_SIZE = 20

/**
 * @param {object} props
 * @param {()=>void} props.onVolver                Vuelve a Pedidos de Compra.
 * @param {(mensaje:string)=>void} props.onToast
 * @param {()=>void} props.onCambioEstado          Avisa al padre para refrescar el contador de pendientes.
 */
export default function EncargosVista({ onVolver, onToast, onCambioEstado }) {
  const online = useOnlineStatus()
  const { isCompact } = useBreakpoint()
  const [filtros, setFiltros] = useState({ ...FILTROS_ENCARGOS_INICIALES })
  const [creando, setCreando] = useState(false)
  const [aCancelar, setACancelar] = useState(null)
  const { anchorRef, scrollToStart } = useScrollAnchor()

  const { pageItems: pagina, items: filtrados, rawItems, page, setPage, totalPages: paginas, loading, error, reload } = usePaginatedList({
    fetcher: (f) => obtenerEncargos({ estado: f.estado !== 'all' ? f.estado : null }),
    serverFilters: { estado: filtros.estado },
    clientFilters: { texto: filtros.texto },
    // Búsqueda en memoria (sin tildes, varias palabras): el hook resetea la página al cambiar el texto.
    clientFilter: (e, cf) => filtrarEncargos([e], cf.texto).length > 0,
    pageSize: PAGE_SIZE,
  })

  const hayFiltros = hayFiltrosEncargos(filtros)
  const limpiarFiltros = () => { setFiltros({ ...FILTROS_ENCARGOS_INICIALES }); setPage(1) }

  // Alta guardada: se cierra el diálogo y se vuelve al listado mostrando el nuevo registro
  // (el más reciente va primero; con filtros activos podría quedar oculto, por eso se limpian).
  function handleCreado(encargo) {
    setCreando(false)
    onToast(`Encargo #${encargo.idEncargo} creado correctamente ✓`)
    if (hayFiltros) setFiltros({ ...FILTROS_ENCARGOS_INICIALES }) // cambia el filtro → refetch + página 1
    else reload()
    setPage(1)
    onCambioEstado()
  }

  return (
    <div className="w-full min-w-0 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <button type="button" onClick={onVolver}
        className={`flex items-center gap-2 -ml-2 px-2 ${TOUCH} text-surface-300 hover:text-white text-sm font-body transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded-lg`}>
        <ArrowLeft size={16} aria-hidden="true" />Volver a pedidos
      </button>

      {!online && (
        <div role="status" className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
          <WifiOff size={16} className="text-yellow-400 flex-shrink-0" aria-hidden="true" />
          <p className="text-yellow-300 text-xs font-body">Sin conexión. Los datos pueden estar desactualizados y no se podrán guardar cambios.</p>
        </div>
      )}

      {/* Misma disposición que «Nuevo Pedido» (Pedidos) y «Nuevo Producto» (Inventario):
          mobile → CTA a ancho completo bajo el título; ≥ sm → a la derecha del encabezado.
          «Nuevo encargo» es la ÚNICA acción con estilo primario de la pantalla. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <PageHeader title="Encargos" subtitle="Mercadería solicitada por clientes" />
        <Button icon={Plus} className="w-full sm:w-auto min-h-[44px] justify-center" onClick={() => setCreando(true)}>
          Nuevo encargo
        </Button>
      </div>

      <FiltrosEncargos value={filtros} onChange={setFiltros} compact={isCompact} total={filtrados.length} />

      {/* Listado + paginador en UN solo Card (igual que Pedidos e Inventario). El ancla marca el inicio de la lista. */}
      <div ref={anchorRef}>
        <EncargosListado
          encargos={pagina} totalSinFiltrar={rawItems.length} loading={loading} error={error} onRetry={reload}
          onCancelar={setACancelar} hayFiltros={hayFiltros} onLimpiarFiltros={limpiarFiltros}
          footer={<PaginadorListado page={page} totalPages={paginas} pageSize={PAGE_SIZE} total={filtrados.length}
            onChange={(n) => { setPage(n); scrollToStart() }} />}
        />
      </div>

      {creando && <EncargoFormDialog onClose={() => setCreando(false)} onCreado={handleCreado} />}

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
