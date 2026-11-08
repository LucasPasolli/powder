// src/pages/admin/abmc/Saldos.jsx
// Migrado desde ABMC.jsx sin cambios funcionales (Task 2).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Input, Select, Modal, Table, Tr, Td, Badge, Card } from '../../../components/ui'
import DateField from '../../../components/ui/DateField'
import { useScrollAnchor } from '../../../hooks/useScrollToTopOnChange'
import { Pencil, Trash2 } from 'lucide-react'
import { obtenerSaldos, actualizarSaldo, eliminarSaldo } from '../../../services/saldosService'
import { buscadorClass, PAGE_SIZE, fmt, formatearFecha, normalizarTexto, Pagination, ConfirmModal, InfoBanner, dropdownClass } from './comunes'

// ═══════════════════════════════════════════════════════════════════════════════
// SALDOS
// ═══════════════════════════════════════════════════════════════════════════════

export default function Saldos() {
  const [allRows, setAllRows] = useState([])
  const [modal, setModal] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [page, setPage] = useState(1)
  const { anchorRef: tableAnchorRef, scrollToStart } = useScrollAnchor()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // Edición: estado con el que se abrió el modal (para detectar transiciones
  // reales), confirmación explícita de la reversión y feedback de guardado.
  const [originalEstado, setOriginalEstado] = useState(null)
  const [ackRevertir, setAckRevertir] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [resumenOperacion, setResumenOperacion] = useState('')

  const load = useCallback(async () => {
    try {
      // Traemos todos los saldos sin filtros de servidor para que el filtrado
      // local (igual que el original) funcione de la misma forma.
      const data = await obtenerSaldos({ orden: 'asc', limite: 1000 })
      // El service mapea clienteNombre y clienteApellido por separado;
      // construimos el campo clienteNombre completo que usa la tabla.
      setAllRows(data.map(s => ({
        ...s,
        clienteNombre: [s.clienteNombre, s.clienteApellido].filter(Boolean).join(' ') || '—',
        // El original usaba r.fechaFin — en el service el campo es fechaVto
        fechaFin: s.fechaVto,
      })))
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo, filtroEstado])

  function openEdit(r) {
    setEditRow({ ...r })
    setOriginalEstado(r.estado)
    setAckRevertir(false)
    setSaveError('')
    setModal(true)
  }

  function cerrarEdit() {
    if (saving) return
    setModal(false)
    setSaveError('')
  }

  // Volver a "Pendiente" un saldo que ya tenía cobros (pagado o parcial) es una
  // reversión con efectos colaterales: requiere confirmación explícita.
  const revierteCobros = !!editRow && editRow.estado === 'pendiente'
    && (originalEstado === 'pagado' || originalEstado === 'parcial')

  async function save() {
    setSaveError('')

    // Solo actuamos sobre el estado si el usuario lo CAMBIÓ. Antes, guardar un
    // saldo 'pendiente'/'parcial' (p. ej. para editar solo el vencimiento)
    // caía en el else y ejecutaba revertirPagoSaldo igualmente.
    const pasaAPendiente = editRow.estado === 'pendiente' && originalEstado !== 'pendiente'

    if (editRow.estado === 'pagado' && !editRow.fechaPago) {
      setSaveError('Ingresá la fecha real de pago para marcar el saldo como pagado.')
      return
    }
    if (pasaAPendiente && revierteCobros && !ackRevertir) {
      setSaveError('Confirmá que entendés las consecuencias de revertir el pago.')
      return
    }

    setSaving(true)
    try {
      await actualizarSaldo(editRow.idSaldo, {
        monto:    editRow.monto,
        fechaVto: editRow.fechaVto ?? null,
      })
      // Importación dinámica: mantiene el scope del módulo liviano.
      const { marcarSaldoPagado, revertirPagoSaldo } = await import('../../../services/saldosService')
      if (editRow.estado === 'pagado') {
        await marcarSaldoPagado(editRow.idSaldo, editRow.idPresupuesto, editRow.fechaPago)
      } else if (pasaAPendiente) {
        const r = await revertirPagoSaldo(editRow.idSaldo)
        const partes = [`Saldo #${r.idSaldo} vuelto a "Pendiente" por su monto completo.`]
        if (r.presupuestoRevertido) {
          partes.push(`El presupuesto #${r.idPresupuesto} volvió de "Pagado" a "Aprobado".`)
        }
        if (r.aplicacionesEliminadas > 0) {
          partes.push(`Se eliminaron ${r.aplicacionesEliminadas} cobro(s) por ${fmt(r.montoAplicacionesEliminadas)}.`)
        }
        setResumenOperacion(partes.join(' '))
      }
      setModal(false)
      await load()
    } catch (e) {
      // Mensaje ya saneado por el service; antes el error se perdía en consola.
      setSaveError(e?.message || 'No se pudo guardar el saldo.')
    } finally {
      setSaving(false)
    }
  }

  // Cobrado hasta el momento sobre un saldo (monto original − remanente).
  const cobradoDe = (r) => Math.max(0, Number(r.monto) - Number(r.montoPendiente ?? r.monto))

  // Eliminar un saldo pagado (o con cobros) tiene efectos colaterales sobre el
  // presupuesto y sobre los KPIs: se exige confirmación explícita.
  const requiereAck = (r) => !!r && (r.estado === 'pagado' || cobradoDe(r) > 0)

  function advertenciaEliminacion(r) {
    if (!r) return ''
    if (r.estado === 'pagado') {
      return `Este saldo figura como PAGADO. Al eliminarlo se revertirá el estado de pago del presupuesto #${r.idPresupuesto} (volverá a "Aprobado", sin fecha de pago) y se eliminarán los cobros registrados contra este saldo: dejarán de contarse en Estadísticas y en Facturación. Esta acción no se puede deshacer.`
    }
    if (cobradoDe(r) > 0) {
      return `Este saldo ya tiene cobros parciales por ${fmt(cobradoDe(r))}. Al eliminarlo, esos cobros se eliminan también y dejarán de contarse en Estadísticas y en Facturación. Esta acción no se puede deshacer.`
    }
    return ''
  }

  async function del(id) {
    setDeleting(true)
    setDeleteError('')
    try {
      const r = await eliminarSaldo(id)
      setConfirm(null)

      const partes = [`Saldo #${r.idSaldo} eliminado.`]
      if (r.presupuestoRevertido) {
        partes.push(`El presupuesto #${r.idPresupuesto} volvió de "Pagado" a "Aprobado": ya podés registrar el cobro nuevamente desde Historial.`)
      }
      if (r.aplicacionesEliminadas > 0) {
        partes.push(`Se eliminaron ${r.aplicacionesEliminadas} cobro(s) por ${fmt(r.montoAplicacionesEliminadas)}.`)
      }
      setResumenOperacion(partes.join(' '))
      await load()
    } catch (e) {
      // El service ya devuelve un mensaje saneado; se muestra en el modal
      // (antes el error se tragaba y el modal se cerraba como si hubiera salido bien).
      setDeleteError(e?.message || 'No se pudo eliminar el saldo.')
    } finally {
      setDeleting(false)
    }
  }

  function cerrarConfirm() {
    if (deleting) return
    setConfirm(null)
    setDeleteError('')
  }

  const fe = (k) => (e) => setEditRow(p => ({ ...p, [k]: e.target.value }))

  const filtered = useMemo(() => allRows.filter(r => {
    const q = normalizarTexto(search)
    const matchEstado = !filtroEstado || r.estado === filtroEstado
    const matchFrom = !dateFrom || r.fechaFin >= dateFrom
    const matchTo = !dateTo || r.fechaFin <= dateTo
    if (!q) return matchEstado && matchFrom && matchTo
    if (/^\d+$/.test(q)) return String(r.idSaldo) === q && matchEstado && matchFrom && matchTo
    const matchQ = normalizarTexto(r.clienteNombre || '').includes(q)
    return matchQ && matchEstado && matchFrom && matchTo
  }), [allRows, search, filtroEstado, dateFrom, dateTo])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const confirmRow = allRows.find(r => r.idSaldo === confirm)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center w-full">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ID o nombre de cliente…"
            className={buscadorClass}
          />
        </div>
        <DateField label="Desde" value={dateFrom} onChange={setDateFrom} />
        <DateField label="Hasta" value={dateTo} onChange={setDateTo} />
        <div>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className={dropdownClass + ' sm:w-auto'}>
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="pagado">Pagado</option>
          </select>
        </div>
      </div>

      {resumenOperacion && (
        <div role="status" aria-live="polite">
          <InfoBanner message={resumenOperacion} onClose={() => setResumenOperacion('')} />
        </div>
      )}

      <div ref={tableAnchorRef}>
      <Card>
        <Table headers={['#', 'Cliente', 'Presup.', 'Monto', 'Vence', 'Estado', '']}
          empty={paged.length === 0 ? 'Sin saldos' : null}>
          {paged.map(r => (
            <Tr key={r.idSaldo}>
              <Td className="text-surface-500 font-mono text-xs">#{r.idSaldo}</Td>
              <Td>{r.clienteNombre}</Td>
              <Td className="text-surface-400 font-mono text-xs">#{r.idPresupuesto}</Td>
              <Td>{fmt(r.monto)}</Td>
              <Td className="text-surface-400">{formatearFecha(r.fechaFin)}</Td>
              <Td><Badge color={r.estado === 'pagado' ? 'green' : 'yellow'}>{r.estado.charAt(0).toUpperCase() + r.estado.slice(1)}</Badge></Td>
              <Td>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(r)} />
                  <Button variant="ghost" size="sm" icon={Trash2} className="hover:text-red-400" aria-label={`Eliminar saldo #${r.idSaldo}`}
                    onClick={() => { setDeleteError(''); setConfirm(r.idSaldo) }} />
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} onNavigate={scrollToStart} />
      </Card>
      </div>

      <Modal open={modal} onClose={cerrarEdit} title="Editar saldo">
        {editRow && (
          <div className="space-y-4">
            <p className="text-surface-400 text-xs">Saldo #{editRow.idSaldo} — {editRow.clienteNombre} — {fmt(editRow.monto)}</p>
            <Select label="Estado" value={editRow.estado} onChange={fe('estado')}>
              <option value="pendiente">Pendiente</option>
              {/* 'parcial' lo genera el motor de pagos; se muestra (no elegible)
                  para que el select refleje el estado real y no parezca 'Pendiente'. */}
              {originalEstado === 'parcial' && <option value="parcial" disabled>Parcial</option>}
              <option value="pagado">Pagado</option>
            </Select>
            <Input label="Fecha de pago" type="date" value={editRow.fechaPago || ''} onChange={fe('fechaPago')} />

            {revierteCobros && (
              <div className="space-y-3">
                <InfoBanner message={originalEstado === 'pagado'
                  ? `Al volver a "Pendiente" se revertirá el pago: el presupuesto #${editRow.idPresupuesto} volverá a "Aprobado" (sin fecha de pago), el saldo deberá su monto completo y se eliminarán los cobros registrados contra él (dejan de contarse en Estadísticas y Facturación). No se puede deshacer.`
                  : `Este saldo tiene cobros parciales. Al volver a "Pendiente" se eliminan esos cobros y el saldo deberá su monto completo (dejan de contarse en Estadísticas y Facturación). No se puede deshacer.`} />
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={ackRevertir} onChange={e => setAckRevertir(e.target.checked)} disabled={saving}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-red-500 focus:outline-none focus:ring-2 focus:ring-red-400" />
                  <span className="text-surface-200 text-xs font-body leading-relaxed">Entiendo que se revertirá el estado de pago y se eliminarán los cobros asociados</span>
                </label>
              </div>
            )}

            {saveError && <p role="alert" className="text-red-400 text-xs font-body">{saveError}</p>}
            <div className="flex gap-3 pt-3 mt-2 -mx-6 -mb-6 px-6 pb-6 sticky bottom-0 bg-surface-800 border-t border-surface-700/60 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0 sm:pt-2 sm:mt-0 sm:border-t-0 sm:bg-transparent">
              <Button variant="secondary" className="flex-1" onClick={cerrarEdit} disabled={saving}>Cancelar</Button>
              <Button className="flex-1" onClick={save} disabled={saving || (revierteCobros && !ackRevertir)}>
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal open={!!confirm} onClose={cerrarConfirm} onConfirm={() => del(confirm)}
        loading={deleting}
        error={deleteError}
        details={confirmRow ? [
          ['ID saldo', `#${confirmRow.idSaldo}`],
          ['Presupuesto', `#${confirmRow.idPresupuesto}`],
          ['Cliente', confirmRow.clienteNombre],
          ['Monto', fmt(confirmRow.monto)],
          ['Estado', confirmRow.estado],
        ] : []}
        message="¿Eliminar este saldo?"
        warning={advertenciaEliminacion(confirmRow)}
        requireAck={requiereAck(confirmRow)}
        ackLabel="Entiendo que se revertirá el estado de pago y se eliminarán los cobros asociados"
      />
    </div>
  )
}
