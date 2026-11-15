// src/lib/pedidoFlujo.js
//
// FUENTE ÚNICA de las reglas del flujo del pedido de compra:
//
//     Original ──► Facturado ──► Recibido        (sin saltos ni retrocesos)
//
// Funciones puras: sin React ni red. La base de datos las hace cumplir con
// triggers (sql/20261114_01_flujo_pedido_compra.sql); esto sólo decide qué
// acciones muestra la UI. «Anular» un pedido = eliminarlo (eliminarPedido).

export const ESTADO = Object.freeze({
  ORIGINAL: 'original',
  FACTURADO: 'facturado',
  RECIBIDO: 'recibido',
})

/** Transiciones válidas. Cualquier otra la rechaza el servidor. */
export const TRANSICIONES = Object.freeze({
  [ESTADO.ORIGINAL]: [ESTADO.FACTURADO],
  [ESTADO.FACTURADO]: [ESTADO.RECIBIDO],
  [ESTADO.RECIBIDO]: [],
})

/** @param {string} desde @param {string} hacia */
export const puedeTransicionar = (desde, hacia) => (TRANSICIONES[desde] ?? []).includes(hacia)

const estadoDe = (pedido) => pedido?.estadoLogistico ?? null

/** ¿Hay versión original registrada? (NULL en monto_original = pedido anterior al flujo). */
export const tieneOriginal = (pedido) => pedido?.montoOriginal != null

/** Pedido anterior al nuevo flujo: ya facturado/recibido pero sin original. */
export const esAnteriorAlFlujo = (pedido) =>
  (estadoDe(pedido) === ESTADO.FACTURADO || estadoDe(pedido) === ESTADO.RECIBIDO) && !tieneOriginal(pedido)

/** «Registrar factura»: sólo desde Original. */
export const puedeRegistrarFactura = (pedido) => estadoDe(pedido) === ESTADO.ORIGINAL

/** «Registrar recepción»: sólo desde Facturado; en Original no existe. */
export const puedeRegistrarRecepcion = (pedido) => estadoDe(pedido) === ESTADO.FACTURADO

/** «Comparar original vs facturado»: pedidos Facturado o Recibido. */
export const puedeVerComparacion = (pedido) =>
  estadoDe(pedido) === ESTADO.FACTURADO || estadoDe(pedido) === ESTADO.RECIBIDO

/**
 * Edición libre de líneas: en Original (aún no se facturó) y en los Facturados
 * migrados (sin original), que conservan su comportamiento de siempre.
 * Un Facturado con original queda fijo: se factura una sola vez.
 */
export const puedeEditarLineas = (pedido) =>
  estadoDe(pedido) === ESTADO.ORIGINAL ||
  (estadoDe(pedido) === ESTADO.FACTURADO && !tieneOriginal(pedido))

/** Costo unitario real = precio con descuento si existe, si no el de lista. */
export const costoUnitarioReal = (linea) => linea?.precioConDescuento ?? linea?.precioUnitario ?? 0

/**
 * Fecha local (no UTC) en formato YYYY-MM-DD. `toISOString()` devuelve la fecha UTC,
 * que de noche en Argentina ya es «mañana»: acá se usa la fecha del dispositivo.
 * @param {Date} [fecha]
 */
export function hoyLocalISO(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`
}
