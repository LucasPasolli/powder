// src/lib/stockPresupuesto.js
// Reglas PURAS (sin React ni Supabase: se testean sin mocks) del stock como dato INFORMATIVO
// dentro de un presupuesto.
//
// Principio rector: el stock NUNCA bloquea un presupuesto. Cotizar mercadería que se puede
// encargar al proveedor es un caso de uso legítimo; el stock solo se informa. Este módulo no
// toca precios, promociones, descuentos ni totales (calculoPresupuesto.js no lo importa), y
// tampoco descuenta nada: el descuento de stock sigue viviendo en el servidor
// (`cambiar_estado_presupuesto`).
//
// Es información INTERNA: no debe viajar al PDF ni a ninguna vista del cliente.

/** @enum {string} */
export const TIPO_STOCK = Object.freeze({
  OK:           'ok',           // alcanza
  SIN_STOCK:    'sin_stock',    // disponible = 0
  INSUFICIENTE: 'insuficiente', // 0 < disponible < solicitado
  DESCONOCIDO:  'desconocido',  // sin datos suficientes (p. ej. falta elegir la medida): no se advierte
})

/**
 * @typedef {object} StockProducto  Stock vigente de UN producto.
 * @property {boolean} tieneMedidas
 * @property {number}  cantidad     Stock total del producto.
 * @property {Array<{ medida: string, cantidad: number }>} [medidas]  Variantes (solo si tieneMedidas).
 */

/**
 * @typedef {object} LineaStock  Una línea del presupuesto, reducida a lo que importa para el stock.
 * @property {string}      clave       Identificador estable de la línea (uid del formulario o id_detalle).
 * @property {number|string} idProducto
 * @property {string|null} [medida]
 * @property {number|string} cantidad  Cantidad solicitada.
 */

/**
 * @typedef {object} EstadoStock
 * @property {string}      tipo        Uno de TIPO_STOCK.
 * @property {number|null} disponible  Stock disponible para esa línea (null si se desconoce).
 * @property {number}      solicitado  Cantidad pedida en la línea.
 * @property {number}      excedente   Unidades de ESTA línea que exceden el stock (0 si alcanza).
 */

const DESCONOCIDO = (solicitado = 0) => ({ tipo: TIPO_STOCK.DESCONOCIDO, disponible: null, solicitado, excedente: 0 })

function aEnteroNoNegativo(valor) {
  const n = Number.parseInt(valor, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function aStock(valor) {
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Stock disponible para una línea, o `null` si todavía no se puede saber.
 *  · Producto sin medidas → su cantidad.
 *  · Con medidas y medida elegida → la cantidad de esa variante (0 si la variante no existe).
 *  · Con medidas y sin medida elegida → 0 si NINGUNA variante tiene stock (ya es seguro que no hay);
 *    si alguna tiene, es indeterminado (depende de cuál elija) → `null`.
 *
 * @param {StockProducto|null|undefined} stock
 * @param {string|null|undefined} medida
 * @returns {number|null}
 */
export function disponibleParaLinea(stock, medida) {
  if (!stock) return null
  if (!stock.tieneMedidas) return aStock(stock.cantidad)

  const variantes = stock.medidas ?? []
  if (medida) {
    const variante = variantes.find((m) => m.medida === medida)
    return aStock(variante?.cantidad)
  }
  return variantes.some((m) => aStock(m.cantidad) > 0) ? null : 0
}

/**
 * Evalúa TODAS las líneas contra el stock vigente. Devuelve un `EstadoStock` por línea, en el
 * mismo orden que la entrada.
 *
 * Las líneas del mismo producto y medida se evalúan de forma ACUMULADA: con stock 5, dos líneas
 * de 3 unidades no pasan en silencio (cada una por separado "alcanzaría"); la segunda se marca
 * con 1 unidad de exceso. Con una única línea por producto, equivale a comparar cantidad vs stock.
 *
 * @param {LineaStock[]} lineas
 * @param {(idProducto: number) => StockProducto|null|undefined} obtenerStock
 * @returns {EstadoStock[]}
 */
export function evaluarLineas(lineas, obtenerStock) {
  const acumulado = new Map() // `${idProducto}|${medida}` -> unidades ya pedidas por líneas anteriores

  return (lineas ?? []).map((linea) => {
    const solicitado = aEnteroNoNegativo(linea.cantidad)
    const idProducto = Number.parseInt(linea.idProducto, 10)
    if (!Number.isFinite(idProducto) || solicitado === 0) return DESCONOCIDO(solicitado)

    const disponible = disponibleParaLinea(obtenerStock(idProducto), linea.medida ?? null)
    if (disponible === null) return DESCONOCIDO(solicitado)

    if (disponible === 0) {
      return { tipo: TIPO_STOCK.SIN_STOCK, disponible: 0, solicitado, excedente: solicitado }
    }

    const clave = `${idProducto}|${linea.medida ?? ''}`
    const previo = acumulado.get(clave) ?? 0
    const total = previo + solicitado
    acumulado.set(clave, total)

    if (total <= disponible) return { tipo: TIPO_STOCK.OK, disponible, solicitado, excedente: 0 }

    const excedente = Math.min(solicitado, total - disponible)
    return { tipo: TIPO_STOCK.INSUFICIENTE, disponible, solicitado, excedente }
  })
}

/** ¿La línea merece una advertencia? (OK y DESCONOCIDO no la tienen.) */
export function tieneAdvertencia(estado) {
  return estado?.tipo === TIPO_STOCK.SIN_STOCK || estado?.tipo === TIPO_STOCK.INSUFICIENTE
}

const plural = (n, singular, pluralForma) => (n === 1 ? singular : pluralForma)

/**
 * Texto corto de la etiqueta. `null` si no hay nada que advertir.
 *   "Sin stock"  |  "Stock insuficiente: disponible 5"
 * @param {EstadoStock|undefined} estado
 * @returns {string|null}
 */
export function etiquetaStock(estado) {
  if (estado?.tipo === TIPO_STOCK.SIN_STOCK) return 'Sin stock'
  if (estado?.tipo === TIPO_STOCK.INSUFICIENTE) return `Stock insuficiente: disponible ${estado.disponible}`
  return null
}

/**
 * Cuántas unidades exceden el stock. Solo para stock insuficiente (en "Sin stock" la línea
 * entera excede y repetirlo es ruido). `null` si no aplica.
 *   "Exceden el stock: 3 unidades"  |  "Excede el stock: 1 unidad"
 * @param {EstadoStock|undefined} estado
 * @returns {string|null}
 */
export function detalleExcedente(estado) {
  if (estado?.tipo !== TIPO_STOCK.INSUFICIENTE) return null
  const n = estado.excedente
  return `${plural(n, 'Excede', 'Exceden')} el stock: ${n} ${plural(n, 'unidad', 'unidades')}`
}

/**
 * @typedef {object} AdvertenciaStock
 * @property {string}      clave
 * @property {number|string} idProducto
 * @property {string}      nombre
 * @property {string|null} medida
 * @property {EstadoStock} estado
 */

/**
 * Cruza las líneas con sus estados y se queda con las que tienen advertencia. Es la base del
 * resumen ("N productos afectados") que se muestra al guardar o confirmar.
 *
 * @param {Array<LineaStock & { nombre?: string }>} lineas
 * @param {EstadoStock[]} estados  Misma longitud y orden que `lineas`.
 * @returns {{ total: number, sinStock: number, insuficientes: number, items: AdvertenciaStock[] }}
 */
export function resumirAdvertencias(lineas, estados) {
  const items = []
  ;(lineas ?? []).forEach((linea, i) => {
    const estado = estados?.[i]
    if (!tieneAdvertencia(estado)) return
    items.push({
      clave:      linea.clave,
      idProducto: linea.idProducto,
      nombre:     linea.nombre || `Producto #${linea.idProducto}`,
      medida:     linea.medida ?? null,
      estado,
    })
  })
  const sinStock = items.filter((a) => a.estado.tipo === TIPO_STOCK.SIN_STOCK).length
  return { total: items.length, sinStock, insuficientes: items.length - sinStock, items }
}
