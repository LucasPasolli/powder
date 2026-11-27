// src/services/facturarPorMontoService.js
// Repository de «Facturar por monto». UNA sola operación, de SÓLO LECTURA: la RPC
// `fn_facturar_por_monto` calcula en el servidor (base de Facturas + ajuste al monto).
// No escribe stock, presupuestos, pagos ni saldos.

import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { MONTO_MAX_CENTAVOS, mapearRespuesta } from '../lib/facturarPorMonto'

/** Mensajes seguros para el usuario: nunca se filtra detalle de infraestructura. */
const MENSAJES = Object.freeze({
  cliente_invalido: 'Seleccioná un cliente válido.',
  cliente_inexistente: 'El cliente ya no existe. Elegí otro.',
  periodo_invalido: 'El período no es válido.',
  monto_invalido: 'El monto no es válido.',
})
const GENERICO = 'No se pudo generar el listado. Reintentá en unos segundos.'
const SIN_CONEXION = 'Sin conexión. Revisá tu internet e intentá de nuevo.'

export class ErrorFacturarPorMonto extends Error {
  /** @param {string} codigo */
  constructor(codigo, mensaje) {
    super(mensaje ?? MENSAJES[codigo] ?? GENERICO)
    this.name = 'ErrorFacturarPorMonto'
    this.codigo = codigo
    /** Texto apto para mostrar tal cual en la UI. */
    this.mensajeUsuario = this.message
  }
}

/**
 * Genera el listado a facturar.
 *
 * @param {object} p
 * @param {number} p.idCliente
 * @param {string} p.desde            'YYYY-MM-DD'
 * @param {string} p.hasta            'YYYY-MM-DD'
 * @param {number} p.montoCentavos    Monto CON IVA, en centavos enteros.
 * @param {boolean} [p.permitirSinBase=false]  Generar desde productos habituales si no hay base.
 * @param {AbortSignal} [p.signal]
 * @returns {Promise<ReturnType<typeof mapearRespuesta>>}
 * @throws {ErrorFacturarPorMonto}
 */
export async function generarFacturaPorMonto({ idCliente, desde, hasta, montoCentavos, permitirSinBase = false, signal }) {
  // Defensa en profundidad: la RPC vuelve a validar todo.
  if (!Number.isInteger(idCliente) || idCliente < 1) throw new ErrorFacturarPorMonto('cliente_invalido')
  if (!desde || !hasta || desde > hasta) throw new ErrorFacturarPorMonto('periodo_invalido')
  if (!Number.isSafeInteger(montoCentavos) || montoCentavos <= 0 || montoCentavos > MONTO_MAX_CENTAVOS) {
    throw new ErrorFacturarPorMonto('monto_invalido')
  }

  let query = supabase.rpc('fn_facturar_por_monto', {
    p_id_cliente: idCliente,
    p_desde: desde,
    p_hasta: hasta,
    p_monto: montoCentavos / 100,          // numeric con 2 decimales exactos
    p_permitir_sin_base: Boolean(permitirSinBase),
  })
  if (signal) query = query.abortSignal(signal)

  const { data, error } = await query

  if (error) {
    const codigo = String(error.message ?? '')
    logger.error('facturar_por_monto.rpc_error', { codigo: error.code, mensaje: codigo, idCliente })
    if (Object.hasOwn(MENSAJES, codigo)) throw new ErrorFacturarPorMonto(codigo)
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    throw new ErrorFacturarPorMonto('desconocido', offline ? SIN_CONEXION : GENERICO)
  }
  if (!data || typeof data !== 'object') {
    logger.error('facturar_por_monto.respuesta_vacia', { idCliente })
    throw new ErrorFacturarPorMonto('desconocido')
  }
  return mapearRespuesta(data)
}
