// src/components/encargos/CancelarEncargoDialog.jsx
// TASK 2 — Cancelar encargo (Escenarios 5 y 7).
//   · «Pendiente»  → pide confirmación; al aceptar pasa a «Cancelado».
//   · «En proceso» → ADVIERTE que el encargo está asociado a un pedido de compra activo antes de
//                    permitir la cancelación. El servidor lo exige también (p_confirmar_en_proceso).
// Si el estado cambió mientras el diálogo estaba abierto (otro usuario lo vinculó a un pedido), el
// servidor responde `encargo_en_proceso` y el diálogo pasa a modo advertencia sin cancelar nada.

import { useRef, useState } from 'react'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import { Button, Modal } from '../ui'
import { TOUCH } from '../pedidos/pedidosPresentacion'
import { cancelarEncargo } from '../../services/encargosService'
import { nombreCompletoCliente } from '../../lib/encargos'
import { logger } from '../../lib/logger'

/**
 * @param {object} props
 * @param {import('../../services/encargosService').Encargo} props.encargo
 * @param {()=>void} props.onClose
 * @param {(encargo: object)=>void} props.onCancelado
 * @param {()=>void} [props.onDesactualizado]  El encargo ya no se puede cancelar (p. ej. completado): refrescar el listado.
 */
export default function CancelarEncargoDialog({ encargo, onClose, onCancelado, onDesactualizado }) {
  const [idPedido, setIdPedido] = useState(encargo.estado === 'en_proceso' ? encargo.idPedido : null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)

  const enProceso = idPedido != null
  const cliente = nombreCompletoCliente(encargo.cliente)

  async function confirmar() {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true); setError('')
    try {
      const res = await cancelarEncargo({ idEncargo: encargo.idEncargo, confirmarEnProceso: enProceso })
      onCancelado(res)
    } catch (err) {
      if (err?.code === 'encargo_en_proceso') {
        // Cambió mientras se confirmaba: se muestra la advertencia y se exige OTRA confirmación.
        setIdPedido(Number(err.detalle) || 0)
        setError('')
      } else {
        logger.warn('encargos.cancelar_fallo_ui', { codigo: err?.code })
        setError(err?.message || 'No se pudo cancelar el encargo.')
        if (err?.code === 'encargo_completado' || err?.code === 'encargo_no_encontrado') onDesactualizado?.()
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} busy={saving} title={enProceso ? 'Cancelar encargo en proceso' : 'Cancelar encargo'}>
      <div className="space-y-4">
        {enProceso ? (
          <div role="alert" className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-amber-200 text-sm font-body space-y-2">
              <p>
                <strong>Atención:</strong> el encargo #{encargo.idEncargo} de {cliente} está asociado
                {idPedido ? <> al pedido de compra activo <strong>#{idPedido}</strong></> : ' a un pedido de compra activo'}.
              </p>
              <p>Cancelarlo <strong>no modifica ese pedido</strong>: si ya no necesitás esa mercadería, editá o eliminá el pedido por separado.</p>
            </div>
          </div>
        ) : (
          <p className="text-surface-200 text-sm font-body">
            ¿Querés cancelar el encargo #{encargo.idEncargo} de <strong className="text-white">{cliente}</strong>? Dejará de estar disponible para nuevos pedidos y no se puede deshacer.
          </p>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />{error}
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="secondary" className={`flex-1 ${TOUCH}`} onClick={onClose} disabled={saving}>Volver</Button>
          <Button variant="danger" className={`flex-1 ${TOUCH}`} onClick={confirmar} loadingText="Cancelando el encargo…">
            {enProceso ? 'Entiendo, cancelar encargo' : 'Sí, cancelar encargo'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
