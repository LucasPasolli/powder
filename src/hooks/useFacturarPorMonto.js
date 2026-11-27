// src/hooks/useFacturarPorMonto.js
// Orquesta «Facturar por monto»: formulario → RPC → listado editable.
//
//  · Máquina de fases: inicial → cargando → listo | sin_base | error.
//  · Descarta respuestas viejas (red móvil: pueden llegar desordenadas) y aborta
//    la consulta anterior al generar de nuevo o al desmontar.
//  · La edición (TASK 2) vive en un reducer puro (lib/facturarPorMonto): todo
//    ocurre del lado del cliente, sin tocar la base.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { logger } from '../lib/logger'
import { firstOfMonth, today } from '../lib/facturas'
import {
  ESTADO_EDICION_INICIAL, calcularResumen, hayCambios, hayEdicionesSinExportar, reducirEdicion, validarDoc,
  validarFormulario,
} from '../lib/facturarPorMonto'
import { generarFacturaPorMonto } from '../services/facturarPorMontoService'

/** @typedef {'inicial'|'cargando'|'listo'|'sin_base'|'error'} Fase */

export function useFacturarPorMonto() {
  const [form, setForm] = useState(() => ({ cliente: null, desde: firstOfMonth(), hasta: today(), montoTexto: '' }))
  const [errores, setErrores] = useState(/** @type {Record<string,string>} */ ({}))
  const [fase, setFase] = useState(/** @type {Fase} */ ('inicial'))
  const [mensajeError, setMensajeError] = useState('')
  /** Resultado de la última generación (sin los docs editables) + parámetros usados. */
  const [meta, setMeta] = useState(/** @type {any} */ (null))
  const [edicion, dispatch] = useReducer(reducirEdicion, ESTADO_EDICION_INICIAL)

  const reqRef = useRef(0)
  const ctrlRef = useRef(/** @type {AbortController|null} */ (null))

  useEffect(() => () => { ctrlRef.current?.abort() }, [])

  const setCampo = useCallback((campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }))
    setErrores((e) => {
      if (!e[campo]) return e
      const { [campo]: _quitado, ...resto } = e
      return resto
    })
  }, [])

  /**
   * @param {{permitirSinBase?: boolean}} [opciones]
   * @returns {Promise<boolean>} true si se generó un listado
   */
  const generar = useCallback(async ({ permitirSinBase = false } = {}) => {
    const { errores: errs, montoCentavos, valido } = validarFormulario(form)
    setErrores(errs)
    if (!valido) return false

    ctrlRef.current?.abort()
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const reqId = ++reqRef.current

    setFase('cargando')
    setMensajeError('')
    try {
      const modelo = await generarFacturaPorMonto({
        idCliente: form.cliente.idCliente, desde: form.desde, hasta: form.hasta,
        montoCentavos, permitirSinBase, signal: ctrl.signal,
      })
      if (reqId !== reqRef.current) return false

      const { docs, ...resto } = modelo
      setMeta({ ...resto, desdeHabituales: Boolean(permitirSinBase && modelo.sinBase) })

      if (!docs) {
        dispatch({ tipo: 'limpiar' })
        setFase('sin_base')
        return false
      }
      dispatch({ tipo: 'cargar', docs })
      setFase('listo')
      return true
    } catch (e) {
      if (reqId !== reqRef.current || e?.name === 'AbortError') return false
      logger.error('facturar_por_monto.generar_error', { error: e })
      setMensajeError(e?.mensajeUsuario ?? 'No se pudo generar el listado. Reintentá en unos segundos.')
      setFase('error')
      return false
    }
  }, [form])

  const docs = edicion.docs

  const resumen = useMemo(
    () => (docs && meta ? calcularResumen(docs, meta.montoIngresadoCentavos, meta.alicuota) : null),
    [docs, meta],
  )

  const validacion = useMemo(() => {
    if (!docs || !edicion.original) return null
    const noEfectivo = validarDoc(docs.noEfectivo, edicion.original.noEfectivo)
    const efectivo = validarDoc(docs.efectivo, edicion.original.efectivo)
    return { noEfectivo, efectivo, hayErrores: noEfectivo.hayErrores || efectivo.hayErrores }
  }, [docs, edicion.original])

  return {
    form, setCampo, errores,
    fase, mensajeError, meta, docs, resumen, validacion,
    original: edicion.original,
    hayCambios: hayCambios(edicion),
    sinExportar: hayEdicionesSinExportar(edicion),
    generar,
    editarCantidad: useCallback((doc, clave, texto) => dispatch({ tipo: 'cantidad', doc, clave, texto }), []),
    editarPrecio: useCallback((doc, clave, texto) => dispatch({ tipo: 'precio', doc, clave, texto }), []),
    eliminarLinea: useCallback((doc, clave) => dispatch({ tipo: 'eliminar', doc, clave }), []),
    agregarProducto: useCallback((doc, producto) => dispatch({ tipo: 'agregar', doc, producto }), []),
    restablecer: useCallback(() => dispatch({ tipo: 'restablecer' }), []),
    marcarExportado: useCallback(() => dispatch({ tipo: 'exportado' }), []),
  }
}

export default useFacturarPorMonto
