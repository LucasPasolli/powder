// src/hooks/useCatalogoProductos.js
// Catálogo liviano de productos ACTIVOS para el buscador por nombre. Se carga una vez al montar
// y se refresca en segundo plano cuando está "vencido" (para que el stock mostrado no envejezca).
// Una falla en el refresco NO borra lo ya cargado: se sigue buscando con los últimos datos.
//
// estado: 'cargando' | 'listo' | 'error'

import { useCallback, useEffect, useRef, useState } from 'react'
import { obtenerCatalogoParaBusqueda } from '../services/productosService'
import { prepararCatalogo } from '../lib/busquedaProductos'
import { logger } from '../lib/logger'

/**
 * @param {{ ttlMs?: number }} [opciones]
 */
export function useCatalogoProductos({ ttlMs = 60_000 } = {}) {
  const [estado, setEstado] = useState('cargando')
  const [productos, setProductos] = useState([])
  const cargadoEnRef = useRef(0)
  const enCursoRef = useRef(null) // evita cargas simultáneas (StrictMode, foco + reintento)
  const montadoRef = useRef(false)

  const cargar = useCallback(({ silencioso = false } = {}) => {
    if (enCursoRef.current) return enCursoRef.current
    if (!silencioso) setEstado('cargando')

    const promesa = obtenerCatalogoParaBusqueda()
      .then((filas) => {
        if (!montadoRef.current) return
        setProductos(prepararCatalogo(filas))
        cargadoEnRef.current = Date.now()
        setEstado('listo')
      })
      .catch((err) => {
        logger.error('presupuestador.catalogo_busqueda.error', { error: err })
        if (!montadoRef.current) return
        // Refresco silencioso fallido: se conservan los datos anteriores.
        setEstado((previo) => (silencioso && previo === 'listo' ? 'listo' : 'error'))
      })
      .finally(() => { enCursoRef.current = null })

    enCursoRef.current = promesa
    return promesa
  }, [])

  useEffect(() => {
    montadoRef.current = true
    cargar()
    return () => { montadoRef.current = false }
  }, [cargar])

  const refrescarSiVencido = useCallback(() => {
    if (cargadoEnRef.current && Date.now() - cargadoEnRef.current > ttlMs) cargar({ silencioso: true })
  }, [cargar, ttlMs])

  return { estado, productos, reintentar: () => cargar(), refrescarSiVencido }
}

export default useCatalogoProductos
