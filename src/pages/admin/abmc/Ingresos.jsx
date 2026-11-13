// src/pages/admin/abmc/Ingresos.jsx
// Migrado desde ABMC.jsx sin cambios funcionales (Task 2).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Input, Select, Modal, Table, Tr, Td, Badge, Card } from '../../../components/ui'
import DateField from '../../../components/ui/DateField'
import { useScrollAnchor } from '../../../hooks/useScrollToTopOnChange'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { obtenerIngresos, crearIngreso, actualizarIngreso, eliminarIngreso } from '../../../services/movimientosService'
import { buscadorClass, PAGE_SIZE, fmt, formatearFecha, cap, normalizarTexto, Pagination, ConfirmModal, dropdownClass } from './comunes'
import { FiltrosGestionMovil, opcionesTodas } from './comunes'
import { useBreakpoint } from '../../../hooks/useBreakpoint'

// ═══════════════════════════════════════════════════════════════════════════════
// INGRESOS
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORIAS_INGRESO = ['FCI', 'Plazo fijo', 'Acciones', 'Otro']
const INGRESO_BLANK = { fecha: new Date().toISOString().slice(0, 10), categoria: 'Otro', descripcion: '', monto: '' }

export default function Ingresos() {
  const [allRows, setAllRows] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(INGRESO_BLANK)
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const { isCompact } = useBreakpoint()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtCat, setFiltCat] = useState('')
  const [page, setPage] = useState(1)
  const { anchorRef: tableAnchorRef, scrollToStart } = useScrollAnchor()

  const load = useCallback(async () => {
    try {
      const data = await obtenerIngresos({ orden: 'desc', limite: 1000 })
      setAllRows(data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo, filtCat])

  function openCreate() { setForm({ ...INGRESO_BLANK }); setEditId(null); setError(''); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditId(r.idIngreso); setError(''); setModal(true) }

  async function save() {
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria.'); return }
    if (!form.monto || Number(form.monto) <= 0) { setError('El monto debe ser mayor a 0.'); return }
    const descripcion = cap(form.descripcion)
    try {
      if (editId) {
        await actualizarIngreso(editId, { fecha: form.fecha, categoria: form.categoria, descripcion, monto: Number(form.monto) })
      } else {
        await crearIngreso({ fecha: form.fecha, categoria: form.categoria, descripcion, monto: Number(form.monto) })
      }
      setModal(false); load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function del(id) {
    try {
      await eliminarIngreso(id)
    } catch (e) {
      console.error(e)
    }
    setConfirm(null); load()
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  const fn = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value === '' ? '' : Number(e.target.value) }))

  const filtered = useMemo(() => allRows.filter(r => {
    const q = normalizarTexto(search)
    const matchCat = !filtCat || r.categoria === filtCat
    const matchFrom = !dateFrom || r.fecha >= dateFrom
    const matchTo = !dateTo || r.fecha <= dateTo
    if (!q) return matchCat && matchFrom && matchTo
    if (/^\d+$/.test(q)) return String(r.idIngreso) === q && matchCat && matchFrom && matchTo
    const matchQ = normalizarTexto(r.descripcion).includes(q) || normalizarTexto(r.categoria || '').includes(q)
    return matchQ && matchCat && matchFrom && matchTo
  }), [allRows, search, filtCat, dateFrom, dateTo])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const confirmRow = allRows.find(r => r.idIngreso === confirm)

  return (
    <div className="space-y-4">
      {/* Mobile/tablet (≤ 1024px): patrón único de filtros (buscador + botón «Filtros» + panel).
          Desktop: barra inline original, aplicación inmediata (sin cambios). */}
      {isCompact ? (
        <FiltrosGestionMovil
          search={search} onSearch={setSearch} placeholder="Buscar por ID o descripción…"
          valores={{ desde: dateFrom, hasta: dateTo, categoria: filtCat }}
          onApply={(b) => { setDateFrom(b.desde); setDateTo(b.hasta); setFiltCat(b.categoria) }}
          selects={[{ clave: 'categoria', etiqueta: 'Categoría', opciones: opcionesTodas(CATEGORIAS_INGRESO, 'Todas') }]}
          acciones={<Button icon={Plus} onClick={openCreate}>Nuevo ingreso</Button>}
        />
      ) : (
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center w-full">
        <div className="flex-1 min-w-[160px]">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ID o descripción…"
            className={buscadorClass}
          />
        </div>
        <DateField label="Desde" value={dateFrom} onChange={setDateFrom} />
        <DateField label="Hasta" value={dateTo} onChange={setDateTo} />
        <div>
          <select value={filtCat} onChange={e => setFiltCat(e.target.value)} className={dropdownClass + ' sm:w-auto'}>
            <option value="">Todas las categorías</option>
            {CATEGORIAS_INGRESO.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Button icon={Plus} onClick={openCreate}>Nuevo ingreso</Button>
      </div>
      )}

      <div ref={tableAnchorRef}>
      <Card>
        <Table headers={['#', 'Fecha', 'Categoría', 'Descripción', 'Monto', '']}
          empty={paged.length === 0 ? 'Sin ingresos registrados' : null}>
          {paged.map(r => (
            <Tr key={r.idIngreso}>
              <Td className="text-surface-500 font-mono text-xs">#{r.idIngreso}</Td>
              <Td className="text-surface-400">{formatearFecha(r.fecha)}</Td>
              <Td><Badge color="blue">{r.categoria ?? 'Otro'}</Badge></Td>
              <Td>{r.descripcion}</Td>
              <Td className="text-green-300 font-semibold">{fmt(r.monto)}</Td>
              <Td>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(r)} />
                  <Button variant="ghost" size="sm" icon={Trash2} className="hover:text-red-400" onClick={() => setConfirm(r.idIngreso)} />
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} onNavigate={scrollToStart} />
      </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar ingreso' : 'Nuevo ingreso'}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Fecha *" type="date" value={form.fecha} onChange={f('fecha')} />
            <Select label="Categoría" value={form.categoria} onChange={f('categoria')}>
              {CATEGORIAS_INGRESO.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <Input label="Descripción *" value={form.descripcion} onChange={f('descripcion')}
            placeholder="Ej: Ingreso de FCI — Renta Variable" />
          <Input label="Monto *" type="number" min="0" value={form.monto} onChange={fn('monto')}
            placeholder="Ej: 120000"
            className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-3 mt-2 -mx-6 -mb-6 px-6 pb-6 sticky bottom-0 bg-surface-800 border-t border-surface-700/60 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0 sm:pt-2 sm:mt-0 sm:border-t-0 sm:bg-transparent">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={save}>Guardar</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => del(confirm)}
        details={confirmRow ? [
          ['ID', `#${confirmRow.idIngreso}`],
          ['Fecha', formatearFecha(confirmRow.fecha)],
          ['Categoría', confirmRow.categoria ?? '—'],
          ['Descripción', confirmRow.descripcion],
          ['Monto', fmt(confirmRow.monto)],
        ] : []}
        message="¿Eliminar este ingreso?"
      />
    </div>
  )
}
