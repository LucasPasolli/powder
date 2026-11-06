// src/hooks/usePagoSplit.js
// Estado del Split Payment dentro del modal "Registrar pago". Toda la
// aritmética vive en lib/pagoSplit.js (pura); acá sólo hay estado + derivados.
import { useCallback, useMemo, useState } from 'react'
import { resolverSplit } from '../lib/pagoSplit'

/**
 * @param {number} total Total del presupuesto.
 */
export function usePagoSplit(total) {
  const [activo, setActivo] = useState(false)
  const [origen, setOrigen] = useState(/** @type {import('../lib/pagoSplit').OrigenSplit|null} */ (null))

  const estado = useMemo(() => resolverSplit(total, activo ? origen : null), [total, activo, origen])

  /** Activar/desactivar. Al desactivar se descarta lo tipeado. */
  const alternar = useCallback((valor) => {
    setActivo(Boolean(valor))
    if (!valor) setOrigen(null)
  }, [])

  /** Cada edición pasa a ser la que prevalece (Escenario 8). */
  const editar = useCallback((metodo, campo, texto) => setOrigen({ metodo, campo, texto }), [])

  /** Estado de fábrica: desactivado y vacío (se llama al abrir el modal). */
  const reiniciar = useCallback(() => { setActivo(false); setOrigen(null) }, [])

  return {
    activo, alternar, editar, reiniciar,
    ...estado,
    /** Sin split → siempre confirmable; con split → sólo si es válido. */
    confirmable: !activo || estado.valido,
  }
}

export default usePagoSplit
