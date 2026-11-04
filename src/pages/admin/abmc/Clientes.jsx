// src/pages/admin/abmc/Clientes.jsx
// Migrado desde ABMC.jsx sin cambios funcionales (Task 2).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Input, Modal, Table, Tr, Td, Card } from '../../../components/ui'
import { useScrollAnchor } from '../../../hooks/useScrollToTopOnChange'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { obtenerClientesActivos, crearCliente, actualizarCliente, desactivarCliente } from '../../../services/clientesService'
import { PAGE_SIZE, cap, normalizarTexto, Pagination, ConfirmModal } from './comunes'

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════════════════════════════

const CLIENTE_BLANK = { nombre: '', apellido: '', apodo: '', nombreComercio: '', cuit: '', domicilio: '', telefono: '', mail: '' }

export default function Clientes() {
  const [allRows, setAllRows] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(CLIENTE_BLANK)
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { anchorRef: tableAnchorRef, scrollToStart } = useScrollAnchor()

  const load = useCallback(async () => {
    try {
      const data = await obtenerClientesActivos()
      setAllRows(data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search])

  function openCreate() { setForm(CLIENTE_BLANK); setEditId(null); setError(''); setModal(true) }
  function openEdit(r) { setForm({ ...r }); setEditId(r.idCliente); setError(''); setModal(true) }

  async function save() {
    if (!form.nombre.trim() || !form.apellido.trim()) { setError('Nombre y Apellido son obligatorios.'); return }
    const nombre         = cap(form.nombre)
    const apellido       = cap(form.apellido)
    const apodo          = cap(form.apodo)
    const nombreComercio = cap(form.nombreComercio)
    const domicilio      = (form.domicilio ?? '').replace(/\b\w/g, c => c.toUpperCase())
    try {
      if (editId) {
        await actualizarCliente(editId, { nombre, apellido, apodo, nombreComercio, cuit: form.cuit, domicilio, telefono: form.telefono, mail: form.mail })
      } else {
        await crearCliente({ nombre, apellido, apodo, nombreComercio, cuit: form.cuit, domicilio, telefono: form.telefono, mail: form.mail })
      }
      setModal(false); load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function del(id) {
    try {
      await desactivarCliente(id)
    } catch (e) {
      console.error(e)
    }
    setConfirm(null); load()
  }

  const f = (k) => (e) => {
    let val = e.target.value
    if (k === 'cuit') {
      val = val.replace(/[^0-9-]/g, '')
    } else if (k === 'telefono') {
      val = val.replace(/[^0-9]/g, '')
    } else if (k === 'domicilio') {
      val = val.replace(/\b\w/g, c => c.toUpperCase())
    }
    setForm(p => ({ ...p, [k]: val }))
  }

  const filtered = useMemo(() => {
    const q = normalizarTexto(search)
    if (!q) return allRows
    if (/^\d+$/.test(q)) return allRows.filter(r => String(r.idCliente) === q)
    return allRows.filter(r => {
      const nombreApellido = normalizarTexto(`${r.nombre} ${r.apellido}`)
      const apellidoNombre = normalizarTexto(`${r.apellido} ${r.nombre}`)
      return nombreApellido.includes(q) || apellidoNombre.includes(q) ||
        normalizarTexto(r.nombre).includes(q) || normalizarTexto(r.apellido).includes(q)
    })
  }, [allRows, search])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const confirmRow = allRows.find(r => r.idCliente === confirm)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center w-full">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ID, nombre o apellido…"
            className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
        </div>
        <Button icon={Plus} onClick={openCreate}>Nuevo cliente</Button>
      </div>

      <div ref={tableAnchorRef}>
      <Card>
        <Table headers={['ID', 'Apellido', 'Nombre', 'Apodo', 'Comercio', 'CUIT', 'Teléfono', '']}
          empty={paged.length === 0 ? 'Sin clientes registrados' : null}>
          {paged.map(r => (
            <Tr key={r.idCliente}>
              <Td className="text-surface-500 font-mono text-xs">#{r.idCliente}</Td>
              <Td>{r.apellido}</Td>
              <Td>{r.nombre}</Td>
              <Td className="text-surface-400">{r.apodo || '—'}</Td>
              <Td className="text-surface-400">{r.nombreComercio || '—'}</Td>
              <Td className="text-surface-400">{r.cuit || '—'}</Td>
              <Td className="text-surface-400">{r.telefono || '—'}</Td>
              <Td>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(r)} />
                  <Button variant="ghost" size="sm" icon={Trash2} className="hover:text-red-400" onClick={() => setConfirm(r.idCliente)} />
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} onNavigate={scrollToStart} />
      </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar cliente' : 'Nuevo cliente'}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Nombre *" value={form.nombre} onChange={f('nombre')} />
            <Input label="Apellido *" value={form.apellido} onChange={f('apellido')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Apodo" value={form.apodo} onChange={f('apodo')} />
            <Input label="Nombre de comercio" value={form.nombreComercio} onChange={f('nombreComercio')} />
          </div>
          <Input label="CUIT" value={form.cuit} onChange={f('cuit')} type="tel" inputMode="numeric" pattern="[0-9-]*" />
          <Input label="Domicilio" value={form.domicilio} onChange={f('domicilio')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Teléfono" value={form.telefono} onChange={f('telefono')} type="tel" inputMode="numeric" pattern="[0-9+\-() ]*" />
            <Input label="Mail" value={form.mail} onChange={f('mail')} />
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
          ['ID', `#${confirmRow.idCliente}`],
          ['Apellido y nombre', `${confirmRow.apellido}, ${confirmRow.nombre}`],
          ['CUIT', confirmRow.cuit || '—'],
        ] : []}
        message="¿Estas seguro de ELIMINAR este cliente?"
      />
    </div>
  )
}
