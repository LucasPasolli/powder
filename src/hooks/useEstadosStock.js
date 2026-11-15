// src/hooks/useEstadosStock.js
// Calcula, para una lista de líneas, su estado de stock VIGENTE (ver lib/stockPresupuesto.js).
//
// La fuente del stock se INYECTA (`cargarStock`), así el mismo hook sirve al Presupuestador (que
// ya tiene un caché por producto) y al detalle del Historial (consulta por lote):
//
//   cargarStock(ids: number[]) => Promise<Map<number, StockProducto>>
//
// Es solo INFORMATIVO: si la carga falla (offline, error de red) no hay advertencias y nada se
// bloquea; el error se registra. Las respuestas viejas se descartan (carreras al tipear).
//
// `lineas` puede ser un array nuevo en cada render: el efecto depende de una firma serializada.

import { useEffect, useMemo, useRef, useState } from 'react'
import { evaluarLineas } from '../lib/stockPresupuesto'
import { logger } from '../lib/logger'

const SIN_ESTADOS = Object.freeze([])

/**
 * @param {import('../lib/stockPresupuesto').LineaStock[]} lineas
 * @param {(ids: number[]) => Promise<Map<number, import('../lib/stockPresupuesto').StockProducto>>} cargarStock
 * @param {{ habilitado?: boolean }} [opciones]
 * @returns {{ estados: import('../lib/stockPresupuesto').EstadoStock[], cargando: boolean, error: boolean }}
 *   `estados[i]` corresponde a `lineas[i]`; vacío mientras no hay datos.
 */
export function useEstadosStock(lineas, cargarStock, { habilitado = true } = {}) {
  const [respuesta, setRespuesta] = useState({ firma: '', claves: '', estados: SIN_ESTADOS, error: false })
  const lineasRef = useRef(lineas)
  lineasRef.current = lineas

  const claves = (lineas ?? []).map((l) => l.clave).join('|')
  const firma = useMemo(
    () => JSON.stringify((lineas ?? []).map((l) => [l.clave, l.idProducto, l.medida ?? null, l.cantidad])),
    [lineas],
  )

  useEffect(() => {
    if (!habilitado) return undefined
    const actuales = lineasRef.current ?? []
    const ids = [...new Set(actuales.map((l) => Number.parseInt(l.idProducto, 10)).filter(Number.isFinite))]
    if (ids.length === 0) { setRespuesta({ firma, claves, estados: SIN_ESTADOS, error: false }); return undefined }

    let cancelado = false
    cargarStock(ids)
      .then((porId) => {
        if (cancelado) return
        setRespuesta({ firma, claves, estados: evaluarLineas(actuales, (id) => porId.get(id)), error: false })
      })
      .catch((err) => {
        logger.error('presupuesto.stock_informativo.error', { error: err })
        if (!cancelado) setRespuesta({ firma, claves, estados: SIN_ESTADOS, error: true })
      })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `claves` y `lineas` están contenidas en `firma`
  }, [firma, habilitado, cargarStock])

  // Mientras se resuelve una firma nueva se conserva la respuesta previa (sin parpadeo), salvo que
  // el conjunto/orden de líneas haya cambiado: en ese caso los índices ya no se corresponden.
  const vigente = respuesta.claves === claves ? respuesta.estados : SIN_ESTADOS
  return { estados: vigente, cargando: habilitado && respuesta.firma !== firma, error: respuesta.error }
}

export default useEstadosStock
