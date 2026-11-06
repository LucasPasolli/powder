// src/services/pagoSplitService.js
// Repository del Split Payment. Una única operación de escritura (RPC atómica
// e idempotente) y dos lecturas. No importa otros services → sin ciclos.

import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { METODOS_SPLIT } from '../lib/pagoSplit'

/** Mensajes seguros para el usuario: nunca se filtra detalle de infraestructura. */
const MENSAJES = Object.freeze({
  clave_reutilizada:      'Esta confirmación quedó asociada a otros importes. Volvé a confirmar.',
  sin_permiso:            'No tenés permisos para registrar pagos.',
  no_autenticado:         'Tu sesión venció. Ingresá nuevamente.',
  presupuesto_inexistente:'El presupuesto ya no existe. Actualizá la lista.',
  presupuesto_no_pagable: 'El presupuesto ya no está pendiente de pago. Actualizá la pantalla.',
  metodo_no_elegible:     'Este presupuesto no admite Split Payment.',
  fecha_invalida:         'La fecha de pago no es válida.',
  split_payload_invalido: 'Los importes del Split Payment no son válidos.',
  split_total_no_coincide:'Los importes no coinciden con el total del presupuesto.',
  split_porcentaje_invalido:'Los porcentajes deben sumar 100 %.',
})
const GENERICO = 'No se pudo registrar el pago. Intentá nuevamente.'

export class ErrorPagoSplit extends Error {
  /** @param {string} codigo */
  constructor(codigo) {
    super(MENSAJES[codigo] ?? GENERICO)
    this.name = 'ErrorPagoSplit'
    this.codigo = codigo
    /** Texto apto para mostrar tal cual en la UI. */
    this.mensajeUsuario = this.message
    /** La clave de idempotencia quedó atada a otro contenido: hay que rotarla. */
    this.rotarClave = codigo === 'clave_reutilizada'
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Marca un presupuesto como pagado dividiendo el cobro entre efectivo y
 * transferencia, en UNA operación atómica (RPC `fn_registrar_pago_split`).
 * Reintentar con la misma `clave` devuelve lo ya aplicado (Escenario 12).
 *
 * @param {object} p
 * @param {string} p.clave            UUID de idempotencia (una por intención).
 * @param {number} p.idPresupuesto
 * @param {string} p.fechaPago        'YYYY-MM-DD'
 * @param {import('../lib/pagoSplit').PayloadSplit} p.split
 * @returns {Promise<{estadoNuevo: string, fechaPago: string, total: number, split: import('../lib/pagoSplit').PayloadSplit, reproducido: boolean}>}
 * @throws {ErrorPagoSplit}
 */
export async function registrarPagoSplit({ clave, idPresupuesto, fechaPago, split }) {
  if (!UUID.test(String(clave))) throw new ErrorPagoSplit('split_payload_invalido')
  if (!Number.isInteger(Number(idPresupuesto))) throw new ErrorPagoSplit('presupuesto_inexistente')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaPago))) throw new ErrorPagoSplit('fecha_invalida')
  if (!METODOS_SPLIT.every((m) => Number.isFinite(split?.[m]?.monto) && Number.isFinite(split?.[m]?.porcentaje))) {
    throw new ErrorPagoSplit('split_payload_invalido')
  }

  const { data, error } = await supabase.rpc('fn_registrar_pago_split', {
    p_clave:          clave,
    p_id_presupuesto: Number(idPresupuesto),
    p_fecha_pago:     fechaPago,
    p_split:          {
      efectivo:      { monto: split.efectivo.monto,      porcentaje: split.efectivo.porcentaje },
      transferencia: { monto: split.transferencia.monto, porcentaje: split.transferencia.porcentaje },
    },
  })

  if (error) {
    // El detalle técnico va sólo al log; la UI recibe un mensaje mapeado.
    logger.error('pago_split.error', { error, idPresupuesto })
    const codigo = Object.hasOwn(MENSAJES, error.message) ? error.message : 'desconocido'
    throw new ErrorPagoSplit(codigo)
  }

  return {
    estadoNuevo: data.estadoNuevo,
    fechaPago:   data.fechaPago,
    total:       Number(data.total),
    split:       data.split,
    reproducido: Boolean(data.reproducido),
  }
}

const mapFilas = (filas) => {
  const porId = new Map()
  for (const f of filas ?? []) {
    const acc = porId.get(f.id_presupuesto) ?? {}
    acc[f.metodo_pago] = { monto: Number(f.monto), porcentaje: Number(f.porcentaje) }
    porId.set(f.id_presupuesto, acc)
  }
  return porId
}

/**
 * Split de un presupuesto (o null si se pagó con un único método).
 * @returns {Promise<import('../lib/pagoSplit').PayloadSplit|null>}
 */
export async function obtenerPagoSplit(idPresupuesto) {
  const { data, error } = await supabase
    .from('presupuesto_pago_split')
    .select('id_presupuesto, metodo_pago, monto, porcentaje')
    .eq('id_presupuesto', idPresupuesto)
  if (error) {
    logger.error('pago_split.lectura_error', { error, idPresupuesto })
    throw new Error('No se pudo leer el detalle del pago.')
  }
  const s = mapFilas(data).get(idPresupuesto)
  return s?.efectivo && s?.transferencia ? s : null
}

const LOTE = 150 // evita URLs gigantes en `.in()`

/**
 * Splits de varios presupuestos en pocas consultas (Facturas).
 * @param {number[]} ids
 * @returns {Promise<Map<number, import('../lib/pagoSplit').PayloadSplit>>}
 */
export async function obtenerSplitsPorPresupuestos(ids) {
  const unicos = [...new Set(ids)]
  const lotes = []
  for (let i = 0; i < unicos.length; i += LOTE) lotes.push(unicos.slice(i, i + LOTE))

  const respuestas = await Promise.all(lotes.map((lote) =>
    supabase.from('presupuesto_pago_split')
      .select('id_presupuesto, metodo_pago, monto, porcentaje')
      .in('id_presupuesto', lote)))

  const filas = []
  for (const { data, error } of respuestas) {
    if (error) {
      logger.error('pago_split.lectura_lote_error', { error })
      throw new Error('No se pudieron leer los pagos divididos.')
    }
    filas.push(...(data ?? []))
  }
  return mapFilas(filas)
}
