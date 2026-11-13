// src/hooks/useProductoPorId.js
// Búsqueda EXACTA por id_producto con debounce. Consulta al servidor (dato fresco: precio y stock).
//
// estado: 'inactivo' | 'buscando' | 'encontrado' | 'no_encontrado' | 'error'
// Un id que no puede existir (0, fuera de int4) se resuelve como 'no_encontrado' sin request.

import { useEffect, useState } from 'react'
import { useDebounce } from './useDebounce'
import { buscarProductoActivoPorId } from '../services/productosService'
import { parsearIdProducto } from '../lib/busquedaProductos'
import { logger } from '../lib/logger'

const INACTIVO = { clave: '', estado: 'inactivo', producto: null }

/**
 * @param {string} textoId  Solo dígitos (ya sanitizado por el campo).
 * @param {{ demora?: number }} [opciones]
 */
export function useProductoPorId(textoId, { demora = 250 } = {}) {
  const idDebounceado = useDebounce(textoId, demora)
  const [respuesta, setRespuesta] = useState(INACTIVO)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!idDebounceado) { setRespuesta(INACTIVO); return undefined }

    const id = parsearIdProducto(idDebounceado)
    if (id === null) {
      setRespuesta({ clave: idDebounceado, estado: 'no_encontrado', producto: null })
      return undefined
    }

    let cancelado = false
    setRespuesta({ clave: idDebounceado, estado: 'buscando', producto: null })
    buscarProductoActivoPorId(id)
      .then((producto) => {
        if (cancelado) return
        setRespuesta({ clave: idDebounceado, estado: producto ? 'encontrado' : 'no_encontrado', producto })
      })
      .catch((err) => {
        logger.error('presupuestador.buscar_por_id.error', { idProducto: id, error: err })
        if (!cancelado) setRespuesta({ clave: idDebounceado, estado: 'error', producto: null })
      })
    return () => { cancelado = true }
  }, [idDebounceado, intento])

  // Mientras el usuario sigue tipeando, la respuesta guardada es de OTRO id: no se muestra.
  const vigente = textoId !== '' && textoId === respuesta.clave
  return {
    estado: textoId === '' ? 'inactivo' : vigente ? respuesta.estado : 'buscando',
    producto: vigente ? respuesta.producto : null,
    reintentar: () => setIntento((n) => n + 1),
  }
}

export default useProductoPorId
