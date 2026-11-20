// src/services/encargosService.js
/**
 * Acceso a datos de los encargos de cliente (tablas `encargo` y `detalle_encargo`).
 * Regla del proyecto: los componentes NUNCA hablan con Supabase directamente.
 *
 * Escritura → SIEMPRE por RPC transaccional (crear_encargo_cliente, cancelar_encargo_cliente);
 *             las tablas no aceptan INSERT/UPDATE/DELETE desde el cliente (ver la migración).
 * Lectura   → consultas con relaciones (UNA query por pantalla, no una por encargo).
 *
 * Seguridad:
 *  · Ningún mensaje de la base (constraints, tablas, funciones) llega a la UI: todo error se
 *    traduce a un `EncargoError` con texto seguro y un `code`.
 *  · Ningún texto del usuario se interpola en una consulta: la búsqueda del listado es en memoria.
 *
 * @module services/encargosService
 */
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { construirDetallesEncargo, estaDisponibleParaPedido } from '../lib/encargos'

// ─── Errores de dominio ──────────────────────────────────────────────────────

const MSG_GENERICO = 'No se pudo completar la operación. Tus datos siguen cargados: volvé a intentar.'
const MSG_RED = 'No pudimos conectar con el servidor. Tus datos siguen cargados: volvé a intentar en unos segundos.'

/** @type {Record<string, (detalle?: string) => string>} */
const MENSAJES = {
  no_autorizado:              () => 'No tenés permisos para realizar esta operación.',
  idempotency_key_requerida:  () => MSG_GENERICO,
  idempotency_key_reutilizada:() => MSG_GENERICO,
  cliente_requerido:          () => 'Seleccioná el cliente del encargo.',
  cliente_inexistente:        () => 'El cliente seleccionado ya no existe o está inactivo. Elegí otro.',
  detalles_vacios:            () => 'Agregá al menos un producto al encargo.',
  demasiados_items:           (n) => `Un encargo admite hasta ${n ?? 100} productos.`,
  item_invalido:              () => 'Hay un producto con cantidad inválida. Revisá las cantidades.',
  item_duplicado:             (id) => `El producto ID ${id} está repetido con la misma medida. Unilo en una sola línea.`,
  producto_inexistente:       (id) => `El producto ID ${id} no existe o fue dado de baja. Quitalo del encargo.`,
  medida_requerida:           (id) => `Elegí la medida del producto ID ${id}.`,
  medida_invalida:            (id) => `La medida del producto ID ${id} no es válida.`,
  encargo_no_encontrado:      () => 'El encargo no existe o fue eliminado por otro usuario.',
  // «En proceso»: la UI lo trata como ADVERTENCIA (pide confirmación), no como falla.
  encargo_en_proceso:         () => 'El encargo está asociado a un pedido de compra activo.',
  encargo_completado:         () => 'El encargo ya fue completado: no se puede cancelar.',
  encargo_inexistente:        () => 'Alguno de los encargos seleccionados ya no existe. Quitalo y volvé a intentar.',
  encargo_no_disponible:      (id) => `El encargo #${id} ya no está disponible (fue cancelado o añadido a otro pedido). Quitalo de la lista y volvé a guardar.`,
  demasiados_encargos:        (n) => `Un pedido admite hasta ${n ?? 50} encargos.`,
  transicion_no_permitida:    () => 'Ese cambio de estado no está permitido para el encargo.',
}

/** Códigos para los que reintentar EL MISMO envío es seguro (la clave de idempotencia evita duplicar). */
const REINTENTABLES = new Set(['red', 'desconocido'])

export class EncargoError extends Error {
  /**
   * @param {string} message  Mensaje SEGURO para mostrar al usuario.
   * @param {{ code?: string, detalle?: string }} [meta]
   */
  constructor(message, { code = 'desconocido', detalle } = {}) {
    super(message)
    this.name = 'EncargoError'
    this.code = code
    /** Dato de contexto (id de pedido, id de encargo…), nunca texto interno de la base. */
    this.detalle = detalle
    this.reintentable = REINTENTABLES.has(code)
  }
}

/**
 * Traduce un error de supabase-js/PostgREST a un EncargoError seguro. Pura y exportada para testear.
 * @param {{ message?: string, details?: string, code?: string }|null|undefined} error
 * @returns {EncargoError}
 */
export function traducirErrorEncargo(error) {
  const codigo = (error?.message ?? '').trim()

  const fn = MENSAJES[codigo]
  if (fn) {
    const detalle = error?.details ?? undefined
    return new EncargoError(fn(detalle), { code: codigo, detalle })
  }

  // Privilegios / RLS / JWT vencido.
  if (error?.code === '42501' || error?.code === 'PGRST301' || error?.code === 'PGRST303') {
    return new EncargoError(MENSAJES.no_autorizado(), { code: 'no_autorizado' })
  }

  const sinRed = (typeof navigator !== 'undefined' && navigator.onLine === false)
    || /failed to fetch|networkerror|network request failed|load failed|timeout|abort/i.test(codigo)
  if (sinRed) return new EncargoError(MSG_RED, { code: 'red' })

  return new EncargoError(MSG_GENERICO, { code: 'desconocido' })
}

// ─── Mapeo snake_case → camelCase ────────────────────────────────────────────

/**
 * @typedef {Object} DetalleEncargo
 * @property {number} idDetalleEncargo
 * @property {number} idProducto
 * @property {string} nombreProducto
 * @property {string|null} medida
 * @property {number} cantidad
 * @property {boolean} tieneMedidas       Atributo VIGENTE del producto (0 si no vino el JOIN).
 * @property {number} precioProveedor     Precio de proveedor VIGENTE (0 si no hay).
 * @property {boolean} productoActivo     `false` si el producto fue dado de baja.
 *
 * @typedef {Object} Encargo
 * @property {number} idEncargo
 * @property {number} idCliente
 * @property {{ idCliente:number, nombre:string, apellido:string, apodo:string|null, nombreComercio:string|null }|null} cliente
 * @property {string} fecha               YYYY-MM-DD (asignada por el servidor).
 * @property {'pendiente'|'en_proceso'|'completado'|'cancelado'} estado
 * @property {number|null} idPedido       Pedido de compra vinculado (si lo hay).
 * @property {string} creadoEn            ISO.
 * @property {DetalleEncargo[]} detalles
 */

/** @returns {DetalleEncargo|null} */
export function mapDetalleEncargo(row) {
  if (!row) return null
  return {
    idDetalleEncargo: row.id_detalle_encargo,
    idProducto:       row.id_producto,
    nombreProducto:   row.nombre_producto,
    medida:           row.medida ?? null,
    cantidad:         row.cantidad,
    tieneMedidas:     Boolean(row.producto?.tiene_medidas),
    precioProveedor:  Number(row.producto?.precio_proveedor ?? 0),
    // Sin JOIN (respuesta de un RPC) no se sabe: se asume activo y el servidor revalida.
    productoActivo:   row.producto ? row.producto.activo !== false : true,
  }
}

/** @returns {Encargo|null} */
export function mapEncargo(row) {
  if (!row) return null
  const c = row.cliente
  const detalles = row.detalle_encargo ?? row.detalles ?? []
  return {
    idEncargo: row.id_encargo,
    idCliente: row.id_cliente,
    cliente: c
      ? { idCliente: c.id_cliente, nombre: c.nombre, apellido: c.apellido, apodo: c.apodo ?? null, nombreComercio: c.nombre_comercio ?? null }
      : null,
    fecha:     row.fecha,
    estado:    row.estado,
    idPedido:  row.id_pedido ?? null,
    creadoEn:  row.created_at,
    detalles:  [...detalles].sort((a, b) => a.id_detalle_encargo - b.id_detalle_encargo).map(mapDetalleEncargo),
  }
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

const LIMITE_LISTADO = 500

// Columnas explícitas: `clave_idempotencia` y `creado_por` nunca viajan al navegador.
const SELECT_ENCARGO = `
  id_encargo, id_cliente, fecha, estado, id_pedido, created_at,
  cliente ( id_cliente, nombre, apellido, apodo, nombre_comercio ),
  detalle_encargo (
    id_detalle_encargo, id_producto, nombre_producto, medida, cantidad,
    producto ( id_producto, tiene_medidas, precio_proveedor, activo )
  )
`

/**
 * Listado de encargos (más recientes primero), con cliente y líneas en UNA consulta.
 * @param {{ estado?: string|null, limite?: number }} [opciones]
 * @returns {Promise<Encargo[]>}
 */
export async function obtenerEncargos({ estado = null, limite = LIMITE_LISTADO } = {}) {
  let q = supabase
    .from('encargo')
    .select(SELECT_ENCARGO)
    .order('fecha', { ascending: false })
    .order('id_encargo', { ascending: false })
    .limit(limite)
  if (estado) q = q.eq('estado', estado)

  const { data, error } = await q
  if (error) {
    logger.error('encargos.listar_error', { error })
    throw traducirErrorEncargo(error)
  }
  return (data ?? []).map(mapEncargo)
}

/**
 * Task 2 · E1 y E6: encargos disponibles para añadir a un pedido = SÓLO «Pendiente».
 * El filtro se hace en el servidor Y se reaplica acá (defensa en profundidad).
 * @returns {Promise<Encargo[]>}
 */
export async function obtenerEncargosDisponibles() {
  const encargos = await obtenerEncargos({ estado: 'pendiente' })
  // Antiguos primero: se atienden en el orden en que se pidieron.
  return encargos.filter(estaDisponibleParaPedido).sort((a, b) => a.idEncargo - b.idEncargo)
}

/**
 * Cantidad de encargos pendientes (para el contador del botón). No trae filas.
 * @returns {Promise<number>}
 */
export async function contarEncargosPendientes() {
  const { count, error } = await supabase
    .from('encargo')
    .select('id_encargo', { count: 'exact', head: true })
    .eq('estado', 'pendiente')
  if (error) {
    logger.error('encargos.contar_error', { error })
    throw traducirErrorEncargo(error)
  }
  return count ?? 0
}

// ─── Escritura ───────────────────────────────────────────────────────────────

/**
 * Argumentos del RPC `crear_encargo_cliente`. Pura (testeable).
 * No se envían nombre del producto ni fecha: los fija el servidor (fuente de verdad).
 * @param {{ idCliente: number, lineas: import('../lib/encargos').LineaForm[], idempotencyKey: string }} p
 */
export function construirArgumentosCrear({ idCliente, lineas, idempotencyKey }) {
  return {
    p_id_cliente: Number(idCliente),
    p_detalles: construirDetallesEncargo(lineas),
    p_idempotency_key: idempotencyKey,
  }
}

/**
 * Task 1 · E3: crea el encargo en estado «Pendiente», asociado al cliente, en UNA transacción.
 * Es seguro reintentar con la MISMA `idempotencyKey` (no duplica).
 * @param {{ idCliente: number, lineas: import('../lib/encargos').LineaForm[], idempotencyKey: string }} params
 * @returns {Promise<Encargo & { reutilizado: boolean }>}
 * @throws {EncargoError}
 */
export async function crearEncargo(params) {
  if (!params?.idempotencyKey) throw new EncargoError(MSG_GENERICO, { code: 'idempotency_key_requerida' })

  const { data, error } = await supabase.rpc('crear_encargo_cliente', construirArgumentosCrear(params))
  if (error) {
    logger.error('encargos.crear_error', { codigo: error.message, error })
    throw traducirErrorEncargo(error)
  }
  return { ...mapEncargo(data), reutilizado: Boolean(data.reutilizado) }
}

/**
 * Task 2 · E5 y E7: cancela un encargo.
 *  · «Pendiente»  → cancelación directa (la UI ya pidió confirmación).
 *  · «En proceso» → exige `confirmarEnProceso: true` (la UI ya mostró la advertencia del pedido
 *                   activo). Sin él, el servidor responde `encargo_en_proceso` con el id del pedido.
 * Idempotente: cancelar un encargo ya cancelado devuelve `reutilizado: true`.
 * @param {{ idEncargo: number, confirmarEnProceso?: boolean }} params
 * @returns {Promise<Encargo & { reutilizado: boolean }>}
 * @throws {EncargoError}
 */
export async function cancelarEncargo({ idEncargo, confirmarEnProceso = false }) {
  const id = Number(idEncargo)
  if (!Number.isInteger(id) || id <= 0) throw new EncargoError(MENSAJES.encargo_no_encontrado(), { code: 'encargo_no_encontrado' })

  const { data, error } = await supabase.rpc('cancelar_encargo_cliente', {
    p_id_encargo: id,
    p_confirmar_en_proceso: Boolean(confirmarEnProceso),
  })
  if (error) {
    // `encargo_en_proceso` es un flujo esperado (advertencia), no una falla: no se loguea como error.
    if (error.message === 'encargo_en_proceso') logger.info('encargos.cancelar_requiere_confirmacion', { idEncargo: id })
    else logger.error('encargos.cancelar_error', { codigo: error.message, error })
    throw traducirErrorEncargo(error)
  }
  return { ...mapEncargo(data), reutilizado: Boolean(data.reutilizado) }
}
