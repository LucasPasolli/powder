// src/components/notas/NotaItem.jsx
/**
 * Una nota de la lista, como FILA liviana (sin caja propia): texto + metadatos
 * discretos y acciones de ícono. Lectura, edición en línea y eliminación con
 * confirmación.
 *
 * Seguridad (Escenario 6): el texto se muestra SIEMPRE como hijo de texto de
 * React (escapado). Jamás `dangerouslySetInnerHTML`. `whitespace-pre-wrap`
 * preserva saltos de línea; `[overflow-wrap:anywhere]` evita scroll horizontal.
 *
 * @module components/notas/NotaItem
 */
import { useState } from 'react'
import { AlertCircle, Pencil, Trash2 } from 'lucide-react'
import { Button, Modal } from '../ui'
import NotaEditor from './NotaEditor'
import { formatearFechaNota } from '../../lib/notas'

const TOUCH = 'min-h-[44px] min-[1025px]:min-h-0 justify-center'

// Botón de ícono: 44×44 en touch (área táctil), 32×32 en desktop.
const ICONO = `inline-flex items-center justify-center shrink-0 rounded-lg text-surface-500
  h-11 w-11 min-[1025px]:h-8 min-[1025px]:w-8 transition-colors
  hover:text-white hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60`

/**
 * @param {Object} props
 * @param {import('../../services/notasService').Nota} props.nota
 * @param {(idNota: string, texto: string) => Promise<{ ok: boolean, error?: Error }>} props.onEditar
 * @param {(idNota: string) => Promise<{ ok: boolean, error?: Error }>} props.onEliminar
 */
export default function NotaItem({ nota, onEditar, onEliminar }) {
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando, setEliminando] = useState(false)
  const [errorEliminar, setErrorEliminar] = useState('')

  const fecha = formatearFechaNota(nota.creadaEn)

  async function confirmarEliminar() {
    setEliminando(true)
    setErrorEliminar('')
    const res = await onEliminar(nota.idNota)
    if (res.ok) return // el ítem se desmonta al salir de la lista
    setEliminando(false)
    setErrorEliminar(res.error?.message ?? 'No se pudo eliminar la nota.')
  }

  function cerrarConfirmacion() {
    if (eliminando) return
    setConfirmando(false)
    setErrorEliminar('')
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      {editando ? (
        <NotaEditor
          valorInicial={nota.texto}
          etiqueta="Editar nota"
          etiquetaGuardar="Guardar cambios"
          autoFocus
          onCancel={() => setEditando(false)}
          onSubmit={async (texto) => {
            const res = await onEditar(nota.idNota, texto)
            if (res.ok) setEditando(false)
            return res
          }}
        />
      ) : (
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-surface-100 text-base sm:text-sm font-body leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
              {nota.texto}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-surface-500 text-xs font-body">
              {/* Fecha ORIGINAL: no cambia al editar (Escenario 4). */}
              <time dateTime={nota.creadaEn} className="font-mono tabular-nums">{fecha}</time>
              {nota.editada && (
                <>
                  <span aria-hidden="true">·</span>
                  <span title={`Editada el ${formatearFechaNota(nota.editadaEn)}`}>editada</span>
                  <span className="sr-only">el {formatearFechaNota(nota.editadaEn)}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center shrink-0 -mr-2.5 min-[1025px]:-mr-1">
            <button type="button" className={ICONO} title="Editar" aria-label={`Editar la nota del ${fecha}`}
              onClick={() => setEditando(true)}>
              <Pencil size={15} aria-hidden="true" />
            </button>
            <button type="button" className={`${ICONO} hover:!text-red-400`} title="Eliminar"
              aria-label={`Eliminar la nota del ${fecha}`} onClick={() => setConfirmando(true)}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <Modal open={confirmando} onClose={cerrarConfirmacion} busy={eliminando} title="Eliminar nota" width="max-w-sm">
        <p className="text-surface-300 text-sm font-body mb-1">¿Eliminar esta nota?</p>
        <p className="text-surface-500 text-sm min-[1025px]:text-xs font-body mb-4">Esta acción no se puede deshacer.</p>
        {errorEliminar && (
          <div role="alert" className="flex items-start gap-2 text-red-400 text-sm min-[1025px]:text-xs bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 mb-4">
            <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />{errorEliminar}
          </div>
        )}
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="secondary" className={`flex-1 ${TOUCH}`} onClick={cerrarConfirmacion} disabled={eliminando}>
            Cancelar
          </Button>
          <Button variant="danger" icon={Trash2} className={`flex-1 ${TOUCH}`} onClick={confirmarEliminar}
            loading={eliminando} loadingText="Eliminando la nota, aguardá un momento">
            Eliminar
          </Button>
        </div>
      </Modal>
    </li>
  )
}
