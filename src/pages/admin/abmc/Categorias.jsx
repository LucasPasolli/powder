// src/pages/admin/abmc/Categorias.jsx
// Migrado desde ABMC.jsx sin cambios funcionales (Task 2).
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Input, Modal, Table, Tr, Td, Card } from '../../../components/ui'
import { useScrollAnchor } from '../../../hooks/useScrollToTopOnChange'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { obtenerCategorias, crearCategoria, actualizarCategoria, eliminarCategoria, obtenerProductos } from '../../../services/productosService'
import { PAGE_SIZE, cap, normalizarTexto, Pagination, ConfirmModal } from './comunes'

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORÍAS DE PRODUCTO
// ═══════════════════════════════════════════════════════════════════════════════

const CAT_BLANK = { nombre: '' }

export default function Categorias() {
  const [allRows, setAllRows] = useState([])
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(CAT_BLANK)
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { anchorRef: tableAnchorRef, scrollToStart } = useScrollAnchor()

  const load = useCallback(async () => {
    try {
      // obtenerCategorias no devuelve cantProductos — lo calculamos
      // cruzando con obtenerProductos(), igual que hacía el JOIN original.
      const [cats, prods] = await Promise.all([obtenerCategorias(), obtenerProductos()])
      const countMap = prods.reduce((m, p) => {
        m[p.idCategoria] = (m[p.idCategoria] ?? 0) + 1
        return m
      }, {})
      setAllRows(cats.map(c => ({ ...c, cantProductos: countMap[c.idCategoria] ?? 0 })))
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [search])

  function openCreate() { setForm(CAT_BLANK); setEditId(null); setError(''); setModal(true) }
  function openEdit(r) { setForm({ nombre: r.nombre }); setEditId(r.idCategoria); setError(''); setModal(true) }

  async function save() {
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    const nombre = cap(form.nombre)
    try {
      if (editId) {
        await actualizarCategoria(editId, nombre)
      } else {
        await crearCategoria(nombre)
      }
      setModal(false); load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function del(id) {
    try {
      await eliminarCategoria(id)
    } catch {
      alert('No se puede eliminar: tiene productos asociados.')
    }
    setConfirm(null); load()
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const filtered = useMemo(() => {
    const q = normalizarTexto(search)
    if (!q) return allRows
    if (/^\d+$/.test(q)) return allRows.filter(r => String(r.idCategoria) === q)
    return allRows.filter(r => normalizarTexto(r.nombre).includes(q))
  }, [allRows, search])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const confirmRow = allRows.find(r => r.idCategoria === confirm)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center w-full">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por ID o nombre…"
            className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500"
          />
        </div>
        <Button icon={Plus} onClick={openCreate}>Nueva categoría</Button>
      </div>

      <div ref={tableAnchorRef}>
      <Card>
        <Table headers={['ID', 'Nombre', 'Productos', '']}
          empty={paged.length === 0 ? 'Sin categorías' : null}>
          {paged.map(r => (
            <Tr key={r.idCategoria}>
              <Td className="text-surface-500 font-mono text-xs">#{r.idCategoria}</Td>
              <Td>{r.nombre}</Td>
              <Td className="text-surface-400">{r.cantProductos}</Td>
              <Td>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(r)} />
                  <Button variant="ghost" size="sm" icon={Trash2} className="hover:text-red-400" onClick={() => setConfirm(r.idCategoria)} />
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} onNavigate={scrollToStart} />
      </Card>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar categoría' : 'Nueva categoría'}>
        <div className="space-y-4">
          <Input label="Nombre *" value={form.nombre} onChange={f('nombre')}
            placeholder="Ej: Filtros, Frenos, Eléctrico…" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-3 mt-2 -mx-6 -mb-6 px-6 pb-6 sticky bottom-0 bg-surface-800 border-t border-surface-700/60 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0 sm:pt-2 sm:mt-0 sm:border-t-0 sm:bg-transparent">
            <Button variant="secondary" className="flex-1" onClick={() => setModal(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={save}>Guardar</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => del(confirm)}
        details={confirmRow ? [
          ['ID', `#${confirmRow.idCategoria}`],
          ['Nombre', confirmRow.nombre],
          ['Productos asociados', confirmRow.cantProductos],
        ] : []}
        message="¿Eliminar esta categoría?"
      />
    </div>
  )
}
