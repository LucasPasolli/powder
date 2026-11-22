// src/hooks/useAvisoNotas.js
/**
 * Aviso "este registro tiene notas" para los diálogos de eliminación (Escenario 11).
 * Pasar `null`/`undefined` como id mientras no hay un registro seleccionado.
 *
 * Si no se puede verificar (error de red/permiso), el aviso lo dice explícitamente
 * en vez de callar: el usuario decide con la información disponible.
 *
 * @module hooks/useAvisoNotas
 */
import { useEffect, useState } from 'react'
import { logger } from '../lib/logger'
import { textoAvisoNotas } from '../lib/notas'
import { contarNotasAfectadas } from '../services/notasService'

const AVISO_NO_VERIFICADO =
  'No se pudo verificar si este registro tiene notas asociadas. Si las tiene, también se eliminarán.'

/**
 * @param {string} tipo
 * @param {number|string|null|undefined} idRegistro
 * @returns {{ aviso: string, cantidad: number }}
 */
export function useAvisoNotas(tipo, idRegistro) {
  const [estado, setEstado] = useState({ cantidad: 0, aviso: '' })

  useEffect(() => {
    if (idRegistro == null) { setEstado({ cantidad: 0, aviso: '' }); return undefined }

    let cancelado = false
    setEstado({ cantidad: 0, aviso: '' })

    contarNotasAfectadas(tipo, idRegistro)
      .then((c) => {
        if (cancelado) return
        setEstado({ cantidad: c.propias + c.deSaldo, aviso: textoAvisoNotas(c) })
      })
      .catch((err) => {
        logger.warn('notas.contar_error', { tipo, idRegistro, error: err })
        if (!cancelado) setEstado({ cantidad: 0, aviso: AVISO_NO_VERIFICADO })
      })

    return () => { cancelado = true }
  }, [tipo, idRegistro])

  return estado
}

export default useAvisoNotas
