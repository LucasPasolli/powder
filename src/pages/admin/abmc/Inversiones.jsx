// src/pages/admin/abmc/Inversiones.jsx
// Migrado desde ABMC.jsx sin cambios funcionales (Task 2).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Input, Select, Modal, Table, Tr, Td, Badge, Card } from '../../../components/ui'
import DateField from '../../../components/ui/DateField'
import { useScrollAnchor } from '../../../hooks/useScrollToTopOnChange'
import { Plus, Pencil, Trash2, ArrowDownCircle } from 'lucide-react'
import { obtenerInversiones, crearInversion, actualizarInversion, eliminarInversion } from '../../../services/movimientosService'
import { buscadorClass, PAGE_SIZE, fmt, formatearFecha, cap, normalizarTexto, Pagination, ConfirmModal, dropdownClass } from './comunes'

// ═══════════════════════════════════════════════════════════════════════════════
// INVERSIONES
// ═══════════════════════════════════════════════════════════════════════════════

const CATEGORIAS_INV = ['FCI', 'Plazo fijo', 'Acciones', 'Otro']
const INV_BLANK = { fecha: new Date().toISOString().slice(0, 10), categoria: 'FCI', descripcion: '', monto: '' }

export default function Inversiones() {
  const [allRows, setAllRows] = useState([])
  const [modal, setModal] = useState(false)
  const [modalRetiro, setModalRetiro] = useState(false)
  const [form, setForm] = useState(INV_BLANK)
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filtCat, setFiltCat] = useState('')
  const [page, setPage] = useState(1)
  const { anchorRef: tableAnchorRef, scrollToStart } = useScrollAnchor()
  const [retirarCat, setRetirarCat] = useState('FCI')
  const [retirarMonto, setRetirarMonto] = useState('')
  const [retirarFecha, setRetirarFecha] = useState(new Date().toISOString().slice(0, 10))
  const [errorRetiro, setErrorRetiro] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await obtenerInversiones({ orden: 'desc', limite: 1000 })
      setAllRows(data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo, filtCat])

  function openCreate() { setForm({ ...INV_BLANK }); setEditId(null); setError(''); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditId(r.idInversion); setError(''); setModal(true) }

  async function save() {
    if (!form.descripcion.trim()) { setError('La descripción es obligatoria.'); return }
    if (!form.monto || Number(form.monto) <= 0) { setError('El monto debe ser mayor a 0.'); return }
    const descripcion = cap(form.descripcion)
    try {
      if (editId) {
        const original = allRows.find(r => r.idInversion === editId)
        if (original?.estado === 'retirado') {
          // Para retiros: solo fecha y monto, preservar categoría/estado/descripción
          const disponibleSinEste = allRows
            .filter(r => r.categoria === original.categoria && r.idInversion !== editId)
            .reduce((a, r) => a + (r.estado === 'invertido' ? r.monto : -r.monto), 0)
          if (Number(form.monto) > disponibleSinEste) {
            setError(`El retiro no puede superar el disponible de ${fmt(disponibleSinEste)}.`); return
          }
          await actualizarInversion(editId, {
            fecha:       form.fecha,
            categoria:   original.categoria,
            descripcion: original.descripcion,
            monto:       Number(form.monto),
            estado:      'retirado',
          })
        } else {
          await actualizarInversion(editId, {
            fecha:       form.fecha,
            categoria:   form.categoria,
            descripcion,
            monto:       Number(form.monto),
            estado:      form.estado ?? 'invertido',
          })
        }
      } else {
        await crearInversion({
          fecha:       form.fecha,
          categoria:   form.categoria,
          descripcion,
          monto:       Number(form.monto),
          estado:      'invertido',
        })
      }
      setModal(false); load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function del(id) {
    try {
      await eliminarInversion(id)
    } catch (e) {
      console.error(e)
    }
    setConfirm(null); load()
  }

  function abrirRetiro() {
    setRetirarCat('FCI'); setRetirarMonto('')
    setRetirarFecha(new Date().toISOString().slice(0, 10))
    setErrorRetiro(''); setModalRetiro(true)
  }

  async function guardarRetiro() {
    const monto = Number(retirarMonto)
    if (!retirarMonto || monto <= 0) { setErrorRetiro('El monto debe ser mayor a 0.'); return }
    const disponible = allRows
      .filter(r => r.categoria === retirarCat)
      .reduce((a, r) => a + (r.estado === 'invertido' ? r.monto : -Math.abs(r.monto)), 0)
    if (monto > disponible) {
      setErrorRetiro(`El monto supera el disponible de ${fmt(disponible)} en ${retirarCat}.`); return
    }
    try {
      await crearInversion({
        fecha:       retirarFecha,
        categoria:   retirarCat,
        descripcion: `Retiro ${retirarCat}`,
        monto,
        estado:      'retirado',
      })
      setModalRetiro(false); load()
    } catch (e) {
      setErrorRetiro(e.message)
    }
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))
  const fn = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value === '' ? '' : Number(e.target.value) }))

  const totalesPorCat = CATEGORIAS_INV.map(cat => {
    const rows = allRows.filter(r => r.categoria === cat)
    const invertido = rows.filter(r => r.estado === 'invertido').reduce((a, r) => a + r.monto, 0)
    const retirado  = rows.filter(r => r.estado === 'retirado').reduce((a, r) => a + r.monto, 0)
    return { cat, neto: invertido - retirado, invertido, retirado }
  }).filter(t => t.invertido > 0 || t.retirado > 0)

  const totalGeneral = totalesPorCat.reduce((a, t) => a + t.neto, 0)

  const filtered = useMemo(() => allRows.filter(r => {
    const q = normalizarTexto(search)
    const matchCat = !filtCat || r.categoria === filtCat
    const matchFrom = !dateFrom || r.fecha >= dateFrom
    const matchTo = !dateTo || r.fecha <= dateTo
    if (!q) return matchCat && matchFrom && matchTo
    if (/^\d+$/.test(q)) return String(r.idInversion) === q && matchCat && matchFrom && matchTo
    return (normalizarTexto(r.descripcion).includes(q) || normalizarTexto(r.categoria).includes(q)) && matchCat && matchFrom && matchTo
  }), [allRows, search, filtCat, dateFrom, dateTo])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const confirmRow = allRows.find(r => r.idInversion === confirm)

  return (
    <div className="space-y-4">
      <div className="border-t border-surface-700/60" />
      <div className="space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {CATEGORIAS_INV.map(cat => {
            const t = totalesPorCat.find(t => t.cat === cat)
            const neto = t?.neto ?? 0
            return (
              <div key={cat} className="rounded-2xl p-4" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <p className="text-xs uppercase tracking-widest font-body" style={{ color: '#a5b4fc' }}>{cat}</p>
                <p className="font-mono font-bold text-2xl mt-1" style={{ color: neto > 0 ? '#c7d2fe' : neto < 0 ? '#f87171' : '#6b7280' }}>
                  {fmt(neto)}
                </p>
              </div>
            )
          })}
        </div>
        <div className="rounded-2xl px-5 py-4 flex items-center justify-between" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)' }}>
          <div>
            <p className="text-xs uppercase tracking-widest font-body" style={{ color: '#c4b5fd' }}>Total invertido neto</p>
          </div>
          <p className="font-mono font-bold text-2xl" style={{ color: totalGeneral > 0 ? '#ddd6fe' : totalGeneral < 0 ? '#f87171' : '#6b7280' }}>
            {fmt(totalGeneral)}
          </p>
        </div>
      </div>

      <div className="border-t border-surface-700/60" />

      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center w-full">
        <div className="flex-1 min-w-[160px]">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ID o descripción…"
            className={buscadorClass} />
        </div>
        <DateField label="Desde" value={dateFrom} onChange={setDateFrom} />
        <DateField label="Hasta" value={dateTo} onChange={setDateTo} />
        <div>
          <select value={filtCat} onChange={e => setFiltCat(e.target.value)} className={dropdownClass + ' sm:w-auto'}>
            <option value="">Todas las categorías</option>
            {CATEGORIAS_INV.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Button icon={ArrowDownCircle} variant="secondary" onClick={abrirRetiro}>Registrar retiro</Button>
        <Button icon={Plus} onClick={openCreate} className="bg-teal-600/80 hover:bg-teal-500/90 border-teal-500/50 text-white">Nueva inversión</Button>
      </div>

      <div ref={tableAnchorRef}>
      <Card>
        <Table headers={['#', 'Fecha', 'Categoría', 'Descripción', 'Estado', 'Monto', '']}
          empty={paged.length === 0 ? 'Sin inversiones registradas' : null}>
          {paged.map(r => (
            <Tr key={r.idInversion}>
              <Td className="text-surface-500 font-mono text-xs">#{r.idInversion}</Td>
              <Td className="text-surface-400">{formatearFecha(r.fecha)}</Td>
              <Td><Badge color="violet">{r.categoria}</Badge></Td>
              <Td>{r.descripcion}</Td>
              <Td><Badge color={r.estado === 'invertido' ? 'green' : 'red'}>{r.estado.charAt(0).toUpperCase() + r.estado.slice(1)}</Badge></Td>
              <Td className={`font-semibold ${r.estado === 'invertido' ? 'text-emerald-300' : 'text-red-300'}`}>
                {r.estado === 'retirado' ? '−' : ''}{fmt(r.monto)}
              </Td>
              <Td>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(r)} />
                  <Button variant="ghost" size="sm" icon={Trash2} className="hover:text-red-400" onClick={() => setConfirm(r.idInversion)} />
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} onNavigate={scrollToStart} />
      </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar inversión' : 'Nueva inversión'}>
        <div className="space-y-4">
          {(() => {
            const original = allRows.find(r => r.idInversion === editId)
            const esRetiro = original?.estado === 'retirado'
            const disponibleSinEste = esRetiro
              ? allRows.filter(r => r.categoria === original.categoria && r.idInversion !== editId)
                  .reduce((a, r) => a + (r.estado === 'invertido' ? r.monto : -r.monto), 0)
              : null
            return (
              <>
                {editId ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-surface-700/40 rounded-xl p-3">
                      <div>
                        <p className="text-surface-500 text-xs font-body mb-0.5">Categoría</p>
                        <p className="text-surface-300 text-sm font-body">{form.categoria}</p>
                      </div>
                      <div>
                        <p className="text-surface-500 text-xs font-body mb-0.5">Estado</p>
                        <Badge color={form.estado === 'invertido' ? 'green' : 'red'}>{form.estado}</Badge>
                      </div>
                    </div>
                    <Input label="Fecha *" type="date" value={form.fecha} onChange={f('fecha')} />
                    {!esRetiro && (
                      <Input label="Descripción *" value={form.descripcion} onChange={f('descripcion')}
                        placeholder="Ej: FCI Renta Variable — Apertura" />
                    )}
                    <div>
                      <Input
                        label={esRetiro ? `Monto a retirar * (máx. ${fmt(disponibleSinEste)})` : 'Monto *'}
                        type="number" min="0"
                        placeholder="Ej: 100000"
                        value={form.monto === '' ? '' : form.monto}
                        onChange={e => setForm(p => ({ ...p, monto: e.target.value === '' ? '' : Number(e.target.value) }))}
                        className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      {esRetiro && Number(form.monto) > disponibleSinEste && form.monto !== '' && (
                        <p className="text-red-400 text-xs mt-1">Supera el disponible de {fmt(disponibleSinEste)}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input label="Fecha *" type="date" value={form.fecha} onChange={f('fecha')} />
                      <Select label="Categoría" value={form.categoria} onChange={f('categoria')}>
                        {CATEGORIAS_INV.map(c => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    </div>
                    <Input label="Descripción *" value={form.descripcion} onChange={f('descripcion')}
                      placeholder="Ej: FCI Renta Variable — Apertura" />
                    <Input label="Monto *" type="number" min="0"
                      placeholder="Ej: 100000"
                      value={form.monto === '' ? '' : form.monto}
                      onChange={e => setForm(p => ({ ...p, monto: e.target.value === '' ? '' : Number(e.target.value) }))}
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  </>
                )}
              </>
            )
          })()}
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-3 mt-2 -mx-6 -mb-6 px-6 pb-6 sticky bottom-0 bg-surface-800 border-t border-surface-700/60 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0 sm:pt-2 sm:mt-0 sm:border-t-0 sm:bg-transparent">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={save}>Guardar</Button>
          </div>
        </div>
      </Modal>

      <Modal open={modalRetiro} onClose={() => setModalRetiro(false)} title="Registrar retiro de inversión">
        <div className="space-y-4">
          <Select label="Categoría a retirar" value={retirarCat} onChange={e => { setRetirarCat(e.target.value); setRetirarMonto(0); setErrorRetiro('') }}>
            {CATEGORIAS_INV.map(c => {
              const t = totalesPorCat.find(t => t.cat === c)
              return <option key={c} value={c}>{c}{t ? ` — disponible ${fmt(t.neto)}` : ' — sin fondos'}</option>
            })}
          </Select>
          <Input label="Fecha *" type="date" value={retirarFecha} onChange={e => setRetirarFecha(e.target.value)} />
          <div>
            {(() => {
              const disponible = totalesPorCat.find(t => t.cat === retirarCat)?.neto ?? 0
              const excede = Number(retirarMonto) > disponible
              return (
                <>
                  <Input
                    label={`Monto a retirar * (máx. ${fmt(disponible)})`}
                    type="number" min="0" max={disponible}
                    placeholder="Ej: 50000"
                    value={retirarMonto}
                    onChange={e => { setRetirarMonto(e.target.value); setErrorRetiro('') }}
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  {excede && retirarMonto !== '' && (
                    <p className="text-red-400 text-xs mt-1">Supera el disponible de {fmt(disponible)}</p>
                  )}
                </>
              )
            })()}
          </div>
          {errorRetiro && <p className="text-red-400 text-xs">{errorRetiro}</p>}
          <div className="flex gap-3 pt-3 mt-2 -mx-6 -mb-6 px-6 pb-6 sticky bottom-0 bg-surface-800 border-t border-surface-700/60 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0 sm:pt-2 sm:mt-0 sm:border-t-0 sm:bg-transparent">
            <Button variant="secondary" className="flex-1" onClick={() => setModalRetiro(false)}>Cancelar</Button>
            <Button variant="danger" className="flex-1" onClick={guardarRetiro}>Confirmar retiro</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => del(confirm)}
        details={confirmRow ? [
          ['ID', `#${confirmRow.idInversion}`],
          ['Fecha', formatearFecha(confirmRow.fecha)],
          ['Categoría', confirmRow.categoria],
          ['Descripción', confirmRow.descripcion],
          ['Monto', fmt(confirmRow.monto)],
          ['Estado', confirmRow.estado],
        ] : []}
        message="¿Eliminar este registro de inversión?"
      />
    </div>
  )
}
