// src/hooks/useNotas.js
/**
 * Estado y acciones de las notas de UN registro (listar / crear / editar / eliminar).
 *
 * Contrato: las acciones NUNCA lanzan; devuelven `{ ok: true, ... }` o
 * `{ ok: false, error: ErrorNota }`, así cada formulario decide cómo mostrarlo
 * sin try/catch dispersos (y el texto escrito jamás se pierde por una excepción).
 *
 * Idempotencia de alta (Escenario 9/10): `intentoRef` guarda { idNota, texto }
 * del último intento NO confirmado.
 *   · Mismo texto  → se reutiliza el UUID: si la respuesta anterior se perdió,
 *     el servidor devuelve la nota ya creada en lugar de duplicarla.
 *   · Texto editado entre intentos → es otra intención: UUID nuevo.
 *
 * @module hooks/useNotas
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { nuevaClaveIdempotencia } from '../lib/idempotency'
import { logger } from '../lib/logger'
import { validarNota, mensajeErrorNota } from '../lib/notas'
import { ErrorNota, listarNotas, crearNota, editarNota, eliminarNota } from '../services/notasService'

/** @param {unknown} err @returns {ErrorNota} */
function comoErrorNota(err) {
  if (err instanceof ErrorNota) return err
  if (err && typeof err === 'object' && err.codigo === 'TIMEOUT') {
    return new ErrorNota('TIMEOUT', 'La operación está tardando más de lo normal.')
  }
  return new ErrorNota('DESCONOCIDO')
}

/**
 * @param {string} tipo       Clave de TIPOS_REGISTRO.
 * @param {number} idRegistro
 */
export function useNotas(tipo, idRegistro) {
  const [notas,  setNotas]  = useState(/** @type {import('../services/notasService').Nota[]} */ ([]))
  const [estado, setEstado] = useState(/** @type {'cargando'|'ok'|'error'} */ ('cargando'))

  const estadoRef    = useRef(estado)
  const solicitudRef = useRef(0)   // descarta respuestas de cargas obsoletas
  const intentoRef   = useRef(/** @type {{ idNota: string, texto: string } | null} */ (null))
  estadoRef.current = estado

  const cargar = useCallback(async () => {
    const solicitud = ++solicitudRef.current
    setEstado((e) => (e === 'ok' ? e : 'cargando'))
    try {
      const filas = await listarNotas(tipo, idRegistro)
      if (solicitud !== solicitudRef.current) return
      setNotas(filas)
      setEstado('ok')
    } catch (err) {
      if (solicitud !== solicitudRef.current) return
      logger.error('notas.listar_error', { tipo, idRegistro, error: err })
      // Si ya había datos mostrados, se conservan (no se pisa la UI por un refresh fallido).
      setEstado((e) => (e === 'ok' ? e : 'error'))
    }
  }, [tipo, idRegistro])

  useEffect(() => {
    cargar()
    return () => { solicitudRef.current += 1 }
  }, [cargar])

  const crear = useCallback(async (textoCrudo) => {
    const v = validarNota(textoCrudo)
    if (!v.valido) return { ok: false, error: new ErrorNota('INVALIDA', mensajeErrorNota(v)) }

    if (!intentoRef.current || intentoRef.current.texto !== v.texto) {
      intentoRef.current = { idNota: nuevaClaveIdempotencia(), texto: v.texto }
    }
    try {
      const nota = await crearNota({ tipo, idRegistro, texto: v.texto, idNota: intentoRef.current.idNota })
      intentoRef.current = null // confirmado: el próximo guardado es otra intención
      setNotas((prev) => (prev.some((n) => n.idNota === nota.idNota) ? prev : [nota, ...prev]))
      if (estadoRef.current !== 'ok') cargar()
      logger.info('notas.creada', { tipo, idRegistro })
      return { ok: true, nota }
    } catch (err) {
      const error = comoErrorNota(err)
      if (error.codigo === 'CLAVE_REUTILIZADA') intentoRef.current = null
      logger.error('notas.crear_error', { tipo, idRegistro, codigo: error.codigo, error: err })
      return { ok: false, error }
    }
  }, [tipo, idRegistro, cargar])

  const editar = useCallback(async (idNota, textoCrudo) => {
    const v = validarNota(textoCrudo)
    if (!v.valido) return { ok: false, error: new ErrorNota('INVALIDA', mensajeErrorNota(v)) }

    const actual = notas.find((n) => n.idNota === idNota)
    if (actual && actual.texto === v.texto) return { ok: true, sinCambios: true, nota: actual }

    try {
      const nota = await editarNota({ idNota, texto: v.texto })
      setNotas((prev) => prev.map((n) => (n.idNota === idNota ? nota : n)))
      logger.info('notas.editada', { tipo, idRegistro })
      return { ok: true, nota }
    } catch (err) {
      const error = comoErrorNota(err)
      if (error.codigo === 'NO_ENCONTRADA') cargar()
      logger.error('notas.editar_error', { tipo, idRegistro, codigo: error.codigo, error: err })
      return { ok: false, error }
    }
  }, [notas, tipo, idRegistro, cargar])

  const eliminar = useCallback(async (idNota) => {
    try {
      const eliminada = await eliminarNota(idNota)
      setNotas((prev) => prev.filter((n) => n.idNota !== idNota))
      if (!eliminada) {
        // Nada que borrar: ya no existía (o no hay permiso). Se resincroniza la lista.
        cargar()
        return { ok: false, error: new ErrorNota('NO_ENCONTRADA') }
      }
      logger.info('notas.eliminada', { tipo, idRegistro })
      return { ok: true }
    } catch (err) {
      const error = comoErrorNota(err)
      logger.error('notas.eliminar_error', { tipo, idRegistro, codigo: error.codigo, error: err })
      return { ok: false, error }
    }
  }, [tipo, idRegistro, cargar])

  return { notas, estado, recargar: cargar, crear, editar, eliminar }
}

export default useNotas
