// src/services/pedidosFlujoService.js
//
// Acceso a datos del flujo  Original → Facturado → Recibido.
//   · registrarFactura      → RPC registrar_factura_pedido_compra   (Original → Facturado)
//   · registrarRecepcion    → RPC recibir_pedido_compra             (Facturado → Recibido)
//   · obtenerPedidoParaFlujo→ pedido + líneas vigentes + original, en UNA consulta
//
// Mismo contrato que pedidosGuardadoService: el servidor devuelve códigos de error
// en `error.message`; acá se traducen a mensajes seguros (nunca se filtran nombres
// de tablas ni constraints) y se reintenta sólo con la MISMA clave de idempotencia.

import { supabase } from '../lib/supabase'
import { serializarCanonico } from '../lib/idempotency'
import { mapPedido, mapDetallePedido } from './pedidosService'

// ─── Errores ──────────────────────────────────────────────────────────────────

const MSG_GENERICO = 'No se pudo completar la operación. Intentá de nuevo en unos segundos.'
const MSG_RED = 'No hay conexión con el servidor. Revisá tu conexión y reintentá: no se duplicará la operación.'
const MSG_STALE = 'El pedido cambió de etapa (por ejemplo, desde otra pestaña). Actualizá la pantalla.'

/** Código del servidor → mensaje. `detalle` llega de `error.details` (sin datos sensibles). */
const MENSAJES = {
  no_autorizado:              () => 'Tu sesión no es válida. Volvé a iniciar sesión.',
  pedido_no_encontrado:       () => 'El pedido no existe o fue eliminado desde otra pestaña.',
  pedido_invalido:            () => 'El pedido indicado no es válido.',
  estado_invalido:            () => MSG_STALE,
  transicion_no_permitida:    () => MSG_STALE,
  pedido_no_editable:         () => 'Este pedido ya no admite cambios en sus líneas.',
  detalles_vacios:            () => 'El pedido debe tener al menos una línea.',
  demasiados_items:           () => 'El pedido supera el máximo de líneas permitido.',
  item_invalido:              () => 'Hay una línea con una cantidad o un precio inválido. Revisá el formulario.',
  descuento_invalido:         () => 'Hay un precio con descuento inválido: debe ser mayor a 0 y no superar el precio de lista.',
  producto_inexistente:       () => 'Alguno de los productos ya no existe. Quitá esa línea e intentá de nuevo.',
  medida_invalida:            () => 'Hay una medida que no es válida.',
  medida_requerida:           () => 'Hay productos con medidas sin medida asignada. Elegí la medida de cada línea.',
  monto_congelado:            () => 'El pedido ya tiene pagos registrados: el total facturado debe coincidir con el total del pedido.',
  fecha_invalida:             () => 'La fecha no puede ser anterior a la fecha del pedido.',
  original_ya_registrado:     () => 'Este pedido ya tiene su versión original registrada.',
  original_vacio:             () => 'El pedido original no tiene líneas.',
  linea_invalida:             () => 'Las líneas no coinciden con las del pedido. Actualizá la pantalla e intentá de nuevo.',
  recepcion_vacia:            () => 'Al menos una línea debe tener cantidad recibida mayor a 0.',
  idempotency_key_reutilizada: () => 'Los datos cambiaron durante el envío. Revisá el formulario y volvé a intentar.',
  idempotency_key_requerida:  () => MSG_GENERICO,
}

export class FlujoPedidoError extends Error {
  constructor(message, { code = 'desconocido', detalle, reintentable = false } = {}) {
    super(message)
    this.name = 'FlujoPedidoError'
    this.code = code
    this.detalle = detalle
    this.reintentable = reintentable
  }
}

/** Traduce un error de supabase-js/PostgREST. Pura y exportada para testear. */
export function traducirErrorFlujo(error) {
  const code = (error?.message ?? '').trim()
  const fn = MENSAJES[code]
  if (fn) return new FlujoPedidoError(fn(error?.details ?? undefined), { code, detalle: error?.details })

  // Falla de transporte: la transacción pudo o no confirmarse. Reintentar con la
  // MISMA clave es seguro en ambos casos (el servidor devuelve la respuesta guardada).
  if (/fetch|network|timeout|failed to|load failed|abort/i.test(code)) {
    return new FlujoPedidoError(MSG_RED, { code: 'red', reintentable: true })
  }
  return new FlujoPedidoError(MSG_GENERICO, { code: 'desconocido', reintentable: true })
}

// ─── Serialización UI → RPC (puras) ───────────────────────────────────────────

const aNumero = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}
const vacio = (v) => v === null || v === undefined || String(v).trim() === ''

export function construirArgumentosFactura({ idPedido, detalles, idempotencyKey, fechaFacturacion = null }) {
  return {
    p_id_pedido: idPedido,
    p_detalles: detalles.map((d) => ({
      id_producto:          aNumero(d.idProducto),
      nombre_producto:      d.nombreProducto || null,
      medida:               d.medida || null,
      cantidad:             aNumero(d.cantidad),
      precio_unitario:      aNumero(d.precioUnitario),
      precio_con_descuento: vacio(d.precioConDescuento) ? null : aNumero(d.precioConDescuento),
    })),
    p_idempotency_key: idempotencyKey,
    p_fecha_facturacion: fechaFacturacion ?? null,
  }
}

export function construirArgumentosRecepcion({ idPedido, lineas, idempotencyKey, fechaRecepcion = null }) {
  return {
    p_id_pedido: idPedido,
    p_lineas: lineas.map((l) => ({
      id_detalle_pedido: l.idDetallePedido,
      cantidad_recibida: aNumero(l.cantidadRecibida),
    })),
    p_idempotency_key: idempotencyKey,
    p_fecha_recepcion: fechaRecepcion ?? null,
  }
}

/** Huella del contenido (sin la clave): misma huella → misma clave de idempotencia. */
export const huellaDeArgumentos = (args) => {
  const { p_idempotency_key: _omitida, ...resto } = args // eslint-disable-line no-unused-vars
  return serializarCanonico(resto)
}

// ─── Mapeo ────────────────────────────────────────────────────────────────────

export function mapDetalleOriginal(row) {
  if (!row) return null
  return {
    idDetalleOriginal: row.id_detalle_original,
    idPedido:          row.id_pedido,
    idProducto:        row.id_producto,
    nombreProducto:    row.nombre_producto,
    medida:            row.medida,
    cantidad:          row.cantidad,
    precioUnitario:    Number(row.precio_unitario),
    subtotal:          Number(row.subtotal),
  }
}

function mapRespuestaRpc(data) {
  return {
    ...mapPedido(data),
    detalles:    (data.detalles ?? []).map(mapDetallePedido),
    reutilizado: Boolean(data.reutilizado),
  }
}

// ─── Escritura ────────────────────────────────────────────────────────────────

async function invocarRpc(nombre, args) {
  const { data, error } = await supabase.rpc(nombre, args)
  if (error) {
    // Log técnico sólo para el desarrollador (sin datos del pedido).
    console.error(`[pedidosFlujoService] ${nombre}:`, error.message, error.code ?? '')
    throw traducirErrorFlujo(error)
  }
  return mapRespuestaRpc(data)
}

/**
 * Original → Facturado. Congela el original, guarda la versión facturada y
 * recalcula el plan de cuotas sobre el total facturado, todo en UNA transacción.
 * Seguro de reintentar con la misma `idempotencyKey`.
 * @throws {FlujoPedidoError}
 */
export async function registrarFactura(params) {
  if (!params?.idempotencyKey) throw new FlujoPedidoError(MSG_GENERICO, { code: 'idempotency_key_requerida' })
  return invocarRpc('registrar_factura_pedido_compra', construirArgumentosFactura(params))
}

/**
 * Facturado → Recibido. Guarda lo recibido por línea y suma al stock EXACTAMENTE
 * esas cantidades, atómicamente. Seguro de reintentar con la misma clave.
 * @throws {FlujoPedidoError}
 */
export async function registrarRecepcion(params) {
  if (!params?.idempotencyKey) throw new FlujoPedidoError(MSG_GENERICO, { code: 'idempotency_key_requerida' })
  return invocarRpc('recibir_pedido_compra', construirArgumentosRecepcion(params))
}

// ─── Lectura ──────────────────────────────────────────────────────────────────

const SELECT_PEDIDO_FLUJO = `
  *,
  detalle_pedido_compra (
    *,
    producto ( id_producto, tiene_medidas )
  ),
  detalle_pedido_compra_original ( * )
`

/**
 * Pedido + líneas vigentes (con `tieneMedidas` actual de cada producto) + líneas
 * del original, en UNA consulta. Alimenta facturación, recepción y comparación.
 * @returns {Promise<{pedido: object, detalles: object[], original: object[]}>}
 */
export async function obtenerPedidoParaFlujo(idPedido) {
  const { data, error } = await supabase
    .from('pedido_compra')
    .select(SELECT_PEDIDO_FLUJO)
    .eq('id_pedido', idPedido)
    .maybeSingle()

  if (error) {
    console.error('[pedidosFlujoService] obtenerPedidoParaFlujo:', error.message)
    throw traducirErrorFlujo(error)
  }
  if (!data) throw new FlujoPedidoError(MENSAJES.pedido_no_encontrado(), { code: 'pedido_no_encontrado' })

  const detalles = [...(data.detalle_pedido_compra ?? [])]
    .sort((a, b) => a.id_detalle_pedido - b.id_detalle_pedido)
    .map((row) => ({ ...mapDetallePedido(row), tieneMedidas: Boolean(row.producto?.tiene_medidas) }))

  const original = [...(data.detalle_pedido_compra_original ?? [])]
    .sort((a, b) => a.id_detalle_original - b.id_detalle_original)
    .map(mapDetalleOriginal)

  return { pedido: mapPedido(data), detalles, original }
}
