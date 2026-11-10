// src/pages/admin/abmc/Pedidos.jsx
// Migrado desde ABMC.jsx sin cambios funcionales (Task 2).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Input, Select, Modal, Table, Tr, Td, Badge, Card } from '../../../components/ui'
import DateField from '../../../components/ui/DateField'
import { useScrollAnchor } from '../../../hooks/useScrollToTopOnChange'
import { Pencil, Trash2 } from 'lucide-react'
import { obtenerPedidos, actualizarEstadosPedido, eliminarPedido } from '../../../services/pedidosService'
import { buscadorClass, PAGE_SIZE, fmt, formatearFecha, normalizarTexto, Pagination, ConfirmModal } from './comunes'
import { FiltrosGestionMovil, opcionesTodas } from './comunes'
import { useBreakpoint } from '../../../hooks/useBreakpoint'

// ═══════════════════════════════════════════════════════════════════════════════
// PEDIDOS DE COMPRA
// ═══════════════════════════════════════════════════════════════════════════════

const EPAGO_COLOR = { pendiente: 'yellow', pagado: 'green' }
const ELOGISTICO_COLOR = { encargado: 'blue', recibido: 'green' }

// Etiquetas de método de pago de PEDIDOS DE COMPRA (columna `metodo_pago`).
// Cuenta Corriente se distingue según tenga plan de cuotas o sea pago único
// (mismo criterio que el listado de PedidosCompra.jsx).
const PEDIDO_METODO_LABEL = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  echeck:        'E-check',
}
const pedidoMetodoLabel = (pedido) => {
  const m = pedido?.metodoPago
  if (!m) return '—'
  if (m === 'cuenta_corriente') return pedido.tieneCuotas ? 'CC Cuotas' : 'CC'
  return PEDIDO_METODO_LABEL[m] ?? m
}

export default function Pedidos() {
  const [allRows, setAllRows] = useState([])
  const [modal, setModal] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [search, setSearch] = useState('')
  const { isCompact } = useBreakpoint()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const { anchorRef: tableAnchorRef, scrollToStart } = useScrollAnchor()

  const load = useCallback(async () => {
    try {
      const data = await obtenerPedidos({ orden: 'desc', limite: 1000 })
      // El service devuelve nombreProveedor; mapeamos a provNombre para la tabla
      setAllRows(data.map(p => ({ ...p, provNombre: p.nombreProveedor })))
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo])

  function openEdit(r) { setEditRow({ ...r }); setModal(true) }

  async function save() {
    try {
      // actualizarEstadosPedido maneja toda la lógica de stock (aplicar/revertir)
      // según el cambio de estadoLogistico, exactamente como lo hacía el .jsx original.
      await actualizarEstadosPedido(editRow.idPedido, {
        estadoPago:      editRow.estadoPago,
        estadoLogistico: editRow.estadoLogistico,
        metodoPago:      editRow.metodoPago      || null,
        fechaRecepcion:  editRow.fechaRecepcion  || null,
        fechaPago:       editRow.fechaPago       || null,
      })
      setModal(false); load()
    } catch (e) {
      console.error(e)
    }
  }

  async function del(id) {
    try {
      // eliminarPedido revierte stock si estaba recibido
      await eliminarPedido(id)
    } catch (e) {
      console.error(e)
    }
    setConfirm(null); load()
  }

  const fe = (k) => (e) => setEditRow(p => ({ ...p, [k]: e.target.value }))

  const filtered = useMemo(() => allRows.filter(r => {
    const q = normalizarTexto(search)
    const matchFrom = !dateFrom || r.fecha >= dateFrom
    const matchTo = !dateTo || r.fecha <= dateTo
    if (!q) return matchFrom && matchTo
    if (/^\d+$/.test(q)) return String(r.idPedido) === q && matchFrom && matchTo
    const matchQ = normalizarTexto(r.provNombre || '').includes(q)
    return matchQ && matchFrom && matchTo
  }), [allRows, search, dateFrom, dateTo])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const confirmRow = allRows.find(r => r.idPedido === confirm)

  return (
    <div className="space-y-4">
      {/* Mobile/tablet (≤ 1024px): patrón único de filtros (buscador + botón «Filtros» + panel).
          Desktop: barra inline original, aplicación inmediata (sin cambios). */}
      {isCompact ? (
        <FiltrosGestionMovil
          search={search} onSearch={setSearch} placeholder="Buscar por ID o proveedor…"
          valores={{ desde: dateFrom, hasta: dateTo }}
          onApply={(b) => { setDateFrom(b.desde); setDateTo(b.hasta) }}
        />
      ) : (
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center w-full">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ID o proveedor…"
            className={buscadorClass}
          />
        </div>
        <DateField label="Desde" value={dateFrom} onChange={setDateFrom} />
        <DateField label="Hasta" value={dateTo} onChange={setDateTo} />
      </div>
      )}

      <div ref={tableAnchorRef}>
      <Card>
        <Table headers={['#', 'Fecha', 'Proveedor', 'Monto', 'Método', 'Pago', 'Logística', '']}
          empty={paged.length === 0 ? 'Sin pedidos' : null}>
          {paged.map(r => (
            <Tr key={r.idPedido}>
              <Td className="text-surface-500 font-mono text-xs">#{r.idPedido}</Td>
              <Td className="text-surface-400">{formatearFecha(r.fecha)}</Td>
              <Td>{r.provNombre || '—'}</Td>
              <Td>{fmt(r.monto)}</Td>
              <Td className="text-surface-400">{pedidoMetodoLabel(r)}</Td>
              <Td><Badge color={EPAGO_COLOR[r.estadoPago] ?? 'gray'}>{r.estadoPago.charAt(0).toUpperCase() + r.estadoPago.slice(1)}</Badge></Td>
              <Td><Badge color={ELOGISTICO_COLOR[r.estadoLogistico] ?? 'gray'}>{r.estadoLogistico.charAt(0).toUpperCase() + r.estadoLogistico.slice(1)}</Badge></Td>
              <Td>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(r)} />
                  <Button variant="ghost" size="sm" icon={Trash2} className="hover:text-red-400" onClick={() => setConfirm(r.idPedido)} />
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} onNavigate={scrollToStart} />
      </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Editar pedido de compra">
        {editRow && (
          <div className="space-y-4">
            <p className="text-surface-400 text-xs">Pedido #{editRow.idPedido} — {fmt(editRow.monto)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Estado pago" value={editRow.estadoPago} onChange={fe('estadoPago')}>
                <option value="pendiente">Pendiente</option>
                <option value="pagado">Pagado</option>
              </Select>
              <Select label="Estado logístico" value={editRow.estadoLogistico} onChange={fe('estadoLogistico')}>
                <option value="encargado">Encargado</option>
                <option value="recibido">Recibido</option>
              </Select>
              {editRow.metodoPago === 'cuenta_corriente' ? (
                // El método de un pedido en Cuenta Corriente no se cambia desde acá
                // (su plan y vencimientos se gestionan en Pedidos de Compra).
                <Select label="Método de pago" value="cuenta_corriente" onChange={fe('metodoPago')} disabled>
                  <option value="cuenta_corriente">{pedidoMetodoLabel(editRow)}</option>
                </Select>
              ) : (
                <Select label="Método de pago" value={editRow.metodoPago || 'efectivo'} onChange={fe('metodoPago')}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="echeck">E-check</option>
                </Select>
              )}
              <Input label="Fecha recepción" type="date" value={editRow.fechaRecepcion || ''} onChange={fe('fechaRecepcion')} />
              <Input label="Fecha pago" type="date" value={editRow.fechaPago || ''} onChange={fe('fechaPago')} />
            </div>
            <div className="flex gap-3 pt-3 mt-2 -mx-6 -mb-6 px-6 pb-6 sticky bottom-0 bg-surface-800 border-t border-surface-700/60 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0 sm:pt-2 sm:mt-0 sm:border-t-0 sm:bg-transparent">
              <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={save}>Guardar</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => del(confirm)}
        details={confirmRow ? [
          ['ID', `#${confirmRow.idPedido}`],
          ['Fecha', formatearFecha(confirmRow.fecha)],
          ['Proveedor', confirmRow.provNombre || '—'],
          ['Monto', fmt(confirmRow.monto)],
        ] : []}
        message="¿Eliminar este pedido y todos sus detalles?"
      />
    </div>
  )
}
