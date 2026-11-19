// src/hooks/useEncargosPendientes.js
/**
 * Cantidad de encargos «Pendiente» para el contador del botón «Encargos».
 * Es decorativo: si la consulta falla (sin red, sin permisos, migración sin aplicar) devuelve
 * `null` y la pantalla simplemente no muestra el número — nunca bloquea el módulo de pedidos.
 *
 * @param {number} [refrescarClave]  Cambiar este valor vuelve a consultar (tras crear/cancelar/vincular).
 * @returns {number|null}
 */
import { useEffect, useState } from 'react'
import { contarEncargosPendientes } from '../services/encargosService'
import { logger } from '../lib/logger'

export function useEncargosPendientes(refrescarClave = 0) {
  const [cantidad, setCantidad] = useState(/** @type {number|null} */ (null))

  useEffect(() => {
    let cancelado = false
    contarEncargosPendientes()
      .then((n) => { if (!cancelado) setCantidad(n) })
      .catch((err) => {
        logger.warn('encargos.contador_no_disponible', { error: err })
        if (!cancelado) setCantidad(null)
      })
    return () => { cancelado = true }
  }, [refrescarClave])

  return cantidad
}

export default useEncargosPendientes
