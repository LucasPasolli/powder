// src/pages/admin/abmc/Proveedores.jsx
// Migrado desde ABMC.jsx sin cambios funcionales (Task 2).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Input, Modal, Table, Tr, Td, Card } from '../../../components/ui'
import { useScrollAnchor } from '../../../hooks/useScrollToTopOnChange'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { obtenerProveedores, crearProveedor, actualizarProveedor, eliminarProveedor } from '../../../services/proveedoresService'
import { PAGE_SIZE, cap, normalizarTexto, Pagination, ConfirmModal } from './comunes'

// ═══════════════════════════════════════════════════════════════════════════════
// PROVEEDORES
// ═══════════════════════════════════════════════════════════════════════════════

const PROV_BLANK = { nombreFiscal: '', nombreComercial: '', identificacionTributaria: '', telefono: '', email: '' }

export default function Proveedores() {
  const [allRows, setAllRows] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(PROV_BLANK)
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { anchorRef: tableAnchorRef, scrollToStart } = useScrollAnchor()

  const load = useCallback(async () => {
    try {
      const data = await obtenerProveedores()
      setAllRows(data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search])

  function openCreate() { setForm(PROV_BLANK); setEditId(null); setError(''); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditId(r.idProveedor); setError(''); setModal(true) }

  async function save() {
    if (!form.nombreFiscal.trim()) { setError('Nombre fiscal obligatorio.'); return }
    const nombreFiscal    = cap(form.nombreFiscal)
    const nombreComercial = cap(form.nombreComercial)
    try {
      if (editId) {
        await actualizarProveedor(editId, { nombreFiscal, nombreComercial, identificacionTributaria: form.identificacionTributaria, telefono: form.telefono, email: form.email })
      } else {
        await crearProveedor({ nombreFiscal, nombreComercial, identificacionTributaria: form.identificacionTributaria, telefono: form.telefono, email: form.email })
      }
      setModal(false); load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function del(id) {
    try {
      await eliminarProveedor(id)
    } catch (e) {
      console.error(e)
    }
    setConfirm(null); load()
  }

  const f = (k) => (e) => {
    let val = e.target.value
    if (k === 'identificacionTributaria') {
      val = val.replace(/[^0-9-]/g, '')
    } else if (k === 'telefono') {
      val = val.replace(/[^0-9]/g, '')
    }
    setForm(p => ({ ...p, [k]: val }))
  }

  const filtered = useMemo(() => {
    const q = normalizarTexto(search)
    if (!q) return allRows
    if (/^\d+$/.test(q)) return allRows.filter(r => String(r.idProveedor) === q)
    return allRows.filter(r =>
      normalizarTexto(r.nombreFiscal).includes(q) ||
      normalizarTexto(r.nombreComercial || '').includes(q)
    )
  }, [allRows, search])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const confirmRow = allRows.find(r => r.idProveedor === confirm)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center w-full">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ID, nombre fiscal o comercial…"
            className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
        </div>
        <Button icon={Plus} onClick={openCreate}>Nuevo proveedor</Button>
      </div>

      <div ref={tableAnchorRef}>
      <Card>
        <Table headers={['ID', 'Nombre fiscal', 'Nombre comercial', 'CUIT/RUT', 'Teléfono', 'Email', '']}
          empty={paged.length === 0 ? 'Sin proveedores' : null}>
          {paged.map(r => (
            <Tr key={r.idProveedor}>
              <Td className="text-surface-500 font-mono text-xs">#{r.idProveedor}</Td>
              <Td>{r.nombreFiscal}</Td>
              <Td className="text-surface-400">{r.nombreComercial || '—'}</Td>
              <Td className="text-surface-400">{r.identificacionTributaria || '—'}</Td>
              <Td className="text-surface-400">{r.telefono || '—'}</Td>
              <Td className="text-surface-400">{r.email || '—'}</Td>
              <Td>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(r)} />
                  <Button variant="ghost" size="sm" icon={Trash2} className="hover:text-red-400" onClick={() => setConfirm(r.idProveedor)} />
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} onNavigate={scrollToStart} />
      </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar proveedor' : 'Nuevo proveedor'}>
        <div className="space-y-4">
          <Input label="Nombre fiscal *" value={form.nombreFiscal} onChange={f('nombreFiscal')} />
          <Input label="Nombre comercial" value={form.nombreComercial} onChange={f('nombreComercial')} />
          <Input label="CUIT / RUT" value={form.identificacionTributaria} onChange={f('identificacionTributaria')} type="tel" inputMode="numeric" pattern="[0-9-]*" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Teléfono" value={form.telefono} onChange={f('telefono')} type="tel" inputMode="numeric" pattern="[0-9+\-() ]*" />
            <Input label="Email" value={form.email} onChange={f('email')} />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-3 mt-2 -mx-6 -mb-6 px-6 pb-6 sticky bottom-0 bg-surface-800 border-t border-surface-700/60 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0 sm:pt-2 sm:mt-0 sm:border-t-0 sm:bg-transparent">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={save}>Guardar</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => del(confirm)}
        details={confirmRow ? [
          ['ID', `#${confirmRow.idProveedor}`],
          ['Nombre fiscal', confirmRow.nombreFiscal],
          ['Nombre comercial', confirmRow.nombreComercial || '—'],
        ] : []}
        message="¿Estas seguro de ELIMINAR este proveedor?"
      />
    </div>
  )
}
