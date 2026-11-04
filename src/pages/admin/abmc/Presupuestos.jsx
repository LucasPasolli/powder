// src/pages/admin/abmc/Presupuestos.jsx
// Migrado desde ABMC.jsx sin cambios funcionales (Task 2).
import { useState, useEffect, useCallback, useRef } from 'react'
import { Button, Select, Modal, Table, Tr, Td, Badge, Card } from '../../../components/ui'
import { useScrollAnchor } from '../../../hooks/useScrollToTopOnChange'
import { Pencil, Trash2 } from 'lucide-react'
import { obtenerPresupuestos, actualizarMetadataPresupuesto } from '../../../services/presupuestosService'
import { eliminarPresupuestoConReintegro } from '../../../services/presupuestosIdempotente'
import { ErrorOperacion } from '../../../services/idempotencia'
import { PAGE_SIZE, fmt, formatearFecha, Pagination, ConfirmModal, InfoBanner, dropdownClass } from './comunes'

// ═══════════════════════════════════════════════════════════════════════════════
// PRESUPUESTOS
// ═══════════════════════════════════════════════════════════════════════════════

const ESTADO_COLOR = { borrador: 'gray', aprobado: 'blue', pagado: 'green', rechazado: 'red' }
const METODO_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', cc30: 'CC 30d', cc15: 'CC 15d' }
const ES_CC = (m) => m === 'cc30' || m === 'cc15'

export default function Presupuestos() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [originalEstado, setOriginalEstado] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [confirmRow, setConfirmRow] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [resumenEliminacion, setResumenEliminacion] = useState(null)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [page, setPage] = useState(1)
  const { anchorRef: tableAnchorRef, scrollToStart } = useScrollAnchor()

  // Clave de idempotencia del intento de eliminación en curso. Se regenera
  // cada vez que se abre el modal de confirmación (nuevo intento) y se
  // conserva entre reintentos del MISMO intento (p. ej. si la RPC falla por
  // un error de red transitorio y el usuario vuelve a tocar "Eliminar" sin
  // cerrar el modal) — mismo patrón que NuevoProductoModal en Inventario.jsx.
  const idempotencyKeyRef = useRef(null)

  // Usa los filtros del service server-side en lugar de filtrar en el cliente.
  // Esto corrige el bug principal: obtenerPresupuestos devuelve { data, count },
  // no un array directo, y los filtros/paginación se delegan al servidor.
  const load = useCallback(async (currentPage = 1) => {
    setLoading(true)
    try {
      const offset = (currentPage - 1) * PAGE_SIZE
      const { data, count } = await obtenerPresupuestos({
        estado:     filtroEstado || null,
        fechaDesde: dateFrom    || null,
        fechaHasta: dateTo      || null,
        search:     search.trim() || null,
        sortKey:    'id',
        orden:      'desc',
        limite:     PAGE_SIZE,
        offset,
      })
      // Agregar clienteNombre para la tabla
      setRows(data.map(p => ({
        ...p,
        clienteNombre: [p.nombreCliente, p.apellidoCliente].filter(Boolean).join(' ') || '—',
      })))
      setTotal(count)
    } catch (e) {
      console.error('[Presupuestos] load:', e)
    } finally {
      setLoading(false)
    }
  }, [filtroEstado, dateFrom, dateTo, search])

  // Recarga al montar y cada vez que cambian los filtros
  useEffect(() => {
    setPage(1)
    load(1)
  }, [load])

  // Recarga al cambiar de página (sin resetear a 1)
  useEffect(() => {
    load(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  function openEdit(r) {
    setEditRow({ ...r })
    setOriginalEstado(r.estado)
    setModal(true)
  }

  async function save() {
    const isCC = ES_CC(editRow.metodoPago)
    const estadoCambia = editRow.estado !== originalEstado

    try {
      if (isCC && estadoCambia && editRow.estado === 'rechazado') {
        // Importación dinámica para no contaminar el scope del módulo
        const { eliminarSaldoPorPresupuesto } = await import('../../../services/saldosService')
        await eliminarSaldoPorPresupuesto(editRow.idPresupuesto)
      }
      await actualizarMetadataPresupuesto(editRow.idPresupuesto, {
        estado:      editRow.estado,
        metodoPago:  editRow.metodoPago,
        esExcepcion: editRow.esExcepcion,
      })
      setModal(false)
      load(page)
    } catch (e) {
      console.error('[Presupuestos] save:', e)
    }
  }

  // Estados que ya descontaron stock en algún momento del flujo (alta directa
  // 'aprobado'/'pagado' o transición vía actualizarMetadataPresupuesto).
  // 'borrador' y 'rechazado' nunca descuentan — no corresponde reintegro.
  const REINTEGRA_ESTADO = (estado) => estado === 'aprobado' || estado === 'pagado'

  async function del(id) {
    setDeleting(true)
    setDeleteError('')
    try {
      // eliminarPresupuestoConReintegro es atómica e idempotente: borra el
      // presupuesto, su detalle y el saldo/pagos de CC asociados, y
      // reintegra stock si el estado lo amerita — sin costo extra si no
      // correspondía (la RPC lo detecta sola). Reemplaza a
      // presupuestosService.eliminarPresupuesto para este botón.
      const resultado = await eliminarPresupuestoConReintegro({
        clave: idempotencyKeyRef.current,
        idPresupuesto: id,
      })

      setConfirm(null)
      setConfirmRow(null)
      load(page)

      // Resumen post-eliminación: solo se muestra si hay algo que el
      // administrador deba revisar (reintegro parcial o cobros de CC que
      // se perdieron junto con el saldo). El caso feliz (sin CC, reintegro
      // completo) no genera ruido en la UI.
      if (resultado.itemsNoReintegrados?.length || resultado.aplicacionesPagoEliminadas > 0) {
        const partes = []
        if (resultado.reintegrado) {
          partes.push(`Se reintegró stock de ${resultado.itemsReintegrados.length} ítem(s).`)
        }
        if (resultado.itemsNoReintegrados?.length) {
          partes.push(`${resultado.itemsNoReintegrados.length} ítem(s) no se pudieron reponer porque el producto ya no existe en el catálogo — revisar stock manualmente.`)
        }
        if (resultado.aplicacionesPagoEliminadas > 0) {
          partes.push(`Se eliminaron ${resultado.aplicacionesPagoEliminadas} cobro(s) de cuenta corriente por ${fmt(resultado.montoAplicacionesEliminadas)} asociados a este presupuesto.`)
        }
        setResumenEliminacion(partes.join(' '))
      }
    } catch (e) {
      // ErrorOperacion ya trae un mensaje saneado apto para mostrar tal cual.
      setDeleteError(e instanceof ErrorOperacion ? e.message : 'No se pudo eliminar el presupuesto.')
    } finally {
      setDeleting(false)
    }
  }

  function handleConfirm(r) {
    idempotencyKeyRef.current = crypto.randomUUID()
    setDeleteError('')
    setConfirm(r.idPresupuesto)
    setConfirmRow(r)
  }

  function cerrarConfirm() {
    if (deleting) return // no cerrar en medio de una eliminación en curso
    setConfirm(null)
    setConfirmRow(null)
    setDeleteError('')
  }

  const paged = rows

  const showCCWarning = editRow && ES_CC(editRow.metodoPago)
    && editRow.estado !== originalEstado && editRow.estado !== 'rechazado'
  const showCCRechazo = editRow && ES_CC(editRow.metodoPago)
    && editRow.estado !== originalEstado && editRow.estado === 'rechazado'

  return (
    <div className="space-y-4">
      {resumenEliminacion && (
        <InfoBanner message={resumenEliminacion} onClose={() => setResumenEliminacion(null)} />
      )}

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center w-full">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ID o cliente…"
            className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="w-full sm:w-auto bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-brand-500 [color-scheme:dark]" />
        </div>
        <div>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="w-full sm:w-auto bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-brand-500 [color-scheme:dark]" />
        </div>
        <div>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={dropdownClass + ' sm:w-auto'}>
            <option value="">Todos los estados</option>
            {['borrador','aprobado','pagado','rechazado'].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div ref={tableAnchorRef}>
      <Card>
        <Table headers={['#', 'Fecha', 'Cliente', 'Método', 'Monto', 'Estado', '']}
          empty={!loading && paged.length === 0 ? 'Sin presupuestos' : null}>
          {loading
            ? (
              <Tr>
                <Td colSpan={7} className="text-center text-surface-400 py-6 text-sm">Cargando…</Td>
              </Tr>
            )
            : paged.map(r => (
              <Tr key={r.idPresupuesto}>
                <Td className="text-surface-500 font-mono text-xs">#{r.idPresupuesto}</Td>
                <Td className="text-surface-400">{formatearFecha(r.fecha)}</Td>
                <Td>{r.clienteNombre}</Td>
                <Td className="text-surface-400">{METODO_LABEL[r.metodoPago] ?? r.metodoPago}</Td>
                <Td>{fmt(r.monto)}</Td>
                <Td><Badge color={ESTADO_COLOR[r.estado] ?? 'gray'}>{r.estado.charAt(0).toUpperCase() + r.estado.slice(1)}</Badge></Td>
                <Td>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(r)} />
                    <Button variant="ghost" size="sm" icon={Trash2} className="hover:text-red-400" onClick={() => handleConfirm(r)} />
                  </div>
                </Td>
              </Tr>
            ))
          }
        </Table>
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} onNavigate={scrollToStart} />
      </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Editar presupuesto">
        {editRow && (
          <div className="space-y-4">
            <p className="text-surface-400 text-xs">Presupuesto #{editRow.idPresupuesto} — {editRow.clienteNombre}</p>

            {showCCWarning && (
              <InfoBanner message="Atención: estás modificando solo el estado del presupuesto. El saldo de cuenta corriente asociado NO se actualiza automáticamente — podés revisarlo y ajustarlo en la sección Saldos." />
            )}
            {showCCRechazo && (
              <InfoBanner message="Al rechazar este presupuesto de cuenta corriente, el saldo asociado será eliminado automáticamente." />
            )}

            <Select label="Estado" value={editRow.estado}
              onChange={e => setEditRow(p => ({ ...p, estado: e.target.value }))}>
              {['borrador','aprobado','pagado','rechazado'].map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </Select>
            <Select label="Método de pago" value={editRow.metodoPago}
              onChange={e => setEditRow(p => ({ ...p, metodoPago: e.target.value }))}>
              {Object.entries(METODO_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select label="Excepción" value={editRow.esExcepcion}
              onChange={e => setEditRow(p => ({ ...p, esExcepcion: Number(e.target.value) }))}>
              <option value={0}>No</option>
              <option value={1}>Sí</option>
            </Select>
            <div className="flex gap-3 pt-3 mt-2 -mx-6 -mb-6 px-6 pb-6 sticky bottom-0 bg-surface-800 border-t border-surface-700/60 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0 sm:pt-2 sm:mt-0 sm:border-t-0 sm:bg-transparent">
              <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={save}>Guardar</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal open={!!confirm} onClose={cerrarConfirm} onConfirm={() => del(confirm)}
        loading={deleting}
        error={deleteError}
        details={confirmRow ? [
          ['ID', `#${confirmRow.idPresupuesto}`],
          ['Cliente', confirmRow.clienteNombre],
          ['Fecha', formatearFecha(confirmRow.fecha)],
          ['Monto', fmt(confirmRow.monto)],
          ['Estado', confirmRow.estado],
        ] : []}
        message="¿Eliminar este presupuesto y todos sus detalles?"
        // ⚠️ Esta acción borra el presupuesto ENTERO (detalle, saldo y cobros
        // de CC incluidos) — no confundir con "Eliminar saldo" de la pestaña
        // Saldos, que solo revierte el cobro y deja el presupuesto intacto.
        // El texto lo aclara explícitamente para evitar ese error.
        warning={confirmRow && REINTEGRA_ESTADO(confirmRow.estado)
          ? `Este presupuesto está "${confirmRow.estado}" y ya descontó stock. Al eliminarlo (no solo su saldo — el PRESUPUESTO COMPLETO) el sistema reintegrará automáticamente las cantidades al stock disponible${confirmRow.saldoEstado ? ', y se eliminará también el saldo de cuenta corriente asociado (incluyendo cualquier cobro parcial ya registrado)' : ''}. Si solo querés revertir el cobro sin borrar el presupuesto, cancelá y usá "Eliminar saldo" desde la pestaña Saldos. Esta acción no se puede deshacer.`
          : ''}
        requireAck={!!(confirmRow && REINTEGRA_ESTADO(confirmRow.estado))}
        ackLabel="Entiendo que esto elimina el presupuesto completo (no solo el saldo) y no se puede deshacer"
      />
    </div>
  )
}
