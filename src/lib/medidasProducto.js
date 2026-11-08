// src/lib/medidasProducto.js
//
// Reglas de "cuadrante de medidas" de un producto, FUENTE ÚNICA para
// Pedidos de Compra e Inventario. Funciones puras: sin React, sin red.
//
// Por qué existe
// ──────────────
// El formulario de pedidos decidía mostrar el selector de medida según
// `medidas.length > 0`, es decir, según que existieran FILAS en
// `producto_medida`. Un producto cuyo atributo pasó a "con medidas"
// (`producto.tiene_medidas = true`) pero sin filas cargadas quedaba sin
// selector. Ahora la decisión sale del ATRIBUTO del producto (Escenario 2) y
// las opciones salen de este catálogo, no de lo que haya en la tabla.
//
// Esta lista espeja el CHECK de `producto_medida.medida` y la función SQL
// `sembrar_medidas_producto` (sql/20261107_medidas_producto_consistencia.sql).
// Si se agrega una medida, hay que tocar los tres lugares.

export const MEDIDAS_VALIDAS = Object.freeze([
  'standard', '0.25', '0.50', '0.75', '1.00', '1.25', '1.50', '1.75', '2.00',
])

const CATALOGO = new Set(MEDIDAS_VALIDAS)

/** @type {Readonly<{OCULTO:'oculto', EDITABLE:'editable', SOLO_LECTURA:'solo_lectura'}>} */
export const MODO_MEDIDAS = Object.freeze({
  OCULTO: 'oculto',
  EDITABLE: 'editable',
  SOLO_LECTURA: 'solo_lectura',
})

/** @param {unknown} valor */
export const esMedidaValida = (valor) => typeof valor === 'string' && CATALOGO.has(valor)

const hayValor = (v) => v !== null && v !== undefined && String(v).trim() !== ''

// ─── Estado del pedido ───────────────────────────────────────────────────────

/**
 * Pedido "cerrado" (Escenario 4): ya no se le exige ni habilita medida en sus
 * líneas existentes. Cualquier estado logístico distinto de 'encargado'
 * (recibido, revisar, o uno futuro como 'anulado') o un pedido ya pagado.
 * @param {{estadoLogistico?: string|null, estadoPago?: string|null}|null|undefined} pedido
 */
export function pedidoEstaCerrado(pedido) {
  if (!pedido) return false
  return (pedido.estadoLogistico ?? 'encargado') !== 'encargado' || pedido.estadoPago === 'pagado'
}

// ─── Estado de una línea ─────────────────────────────────────────────────────

/**
 * Una línea es "existente" si ya estaba guardada Y sigue apuntando al mismo
 * producto. Si el usuario cambia el producto de una línea guardada, pasa a
 * comportarse como línea nueva.
 * @param {{idDetallePedido?: unknown, idProductoOriginal?: unknown, idProducto?: unknown}} item
 */
export function esLineaExistente(item) {
  return (
    item?.idDetallePedido != null &&
    item.idProductoOriginal != null &&
    String(item.idProducto) === String(item.idProductoOriginal)
  )
}

/**
 * Cómo se presenta el cuadrante de medidas de una línea.
 *
 *  1. Línea existente de un pedido cerrado  → SOLO_LECTURA (Escenario 4).
 *  2. Producto hoy "con medidas"            → EDITABLE     (Escenarios 1, 2, 7).
 *  3. Línea existente con medida guardada de un producto hoy "sin medidas"
 *                                           → SOLO_LECTURA: el dato se conserva
 *                                             y se ve, no se pierde (Escenario 6).
 *  4. Cualquier otro caso                   → OCULTO (Escenario 6, línea nueva).
 *
 * @param {{tieneMedidas: boolean, existente: boolean, pedidoCerrado: boolean, medidaActual?: unknown}} p
 * @returns {'oculto'|'editable'|'solo_lectura'}
 */
export function resolverModoMedida({ tieneMedidas, existente, pedidoCerrado, medidaActual }) {
  if (existente && pedidoCerrado) return MODO_MEDIDAS.SOLO_LECTURA
  if (tieneMedidas) return MODO_MEDIDAS.EDITABLE
  if (existente && hayValor(medidaActual)) return MODO_MEDIDAS.SOLO_LECTURA
  return MODO_MEDIDAS.OCULTO
}

/**
 * Atajo sobre un ítem del formulario (`item.tieneMedidas` = atributo vigente
 * del producto, cargado al seleccionarlo o al abrir el pedido).
 * @param {object} item
 * @param {{pedidoCerrado?: boolean}} [opts]
 */
export function modoMedidaDeItem(item, { pedidoCerrado = false } = {}) {
  return resolverModoMedida({
    tieneMedidas: Boolean(item?.tieneMedidas),
    existente: esLineaExistente(item),
    pedidoCerrado,
    medidaActual: item?.medida,
  })
}

/**
 * Valor de `medida` a enviar al servidor. Una línea con cuadrante oculto
 * NUNCA envía medida (no se arrastran valores de un producto anterior).
 */
export function medidaParaEnvio(item, opts) {
  if (modoMedidaDeItem(item, opts) === MODO_MEDIDAS.OCULTO) return null
  return hayValor(item?.medida) ? String(item.medida).trim() : null
}

// ─── Validación (Escenario 7) ────────────────────────────────────────────────

/** ¿La línea viaja en el guardado? Mismo criterio que el formulario. */
export const lineaSeEnvia = (item) =>
  Boolean(item?.idProducto) && (parseInt(item?.cantidad, 10) || 0) > 0

/**
 * Mensaje (por campo) para un valor de medida inválido, o `null` si es válido.
 * Cubre vacío, negativo, no numérico y numérico fuera de catálogo.
 * @param {unknown} valor
 * @returns {string|null}
 */
export function mensajeErrorMedida(valor) {
  const txt = valor === null || valor === undefined ? '' : String(valor).trim()
  if (txt === '') return 'Seleccioná una medida.'
  if (CATALOGO.has(txt)) return null
  if (txt.startsWith('-')) return 'La medida no puede ser negativa.'
  if (!/^\d+([.,]\d+)?$/.test(txt)) return 'La medida debe ser un número (o «standard»).'
  return 'Esa medida no está entre las disponibles.'
}

/**
 * Valida las medidas de todas las líneas que se van a guardar. Sólo exige
 * medida donde el cuadrante está EDITABLE (nunca en líneas de pedidos
 * cerrados ni en productos "sin medidas").
 *
 * @param {object[]} items
 * @param {{pedidoCerrado?: boolean}} [opts]
 * @returns {Record<number, string>} índice de línea → mensaje. `{}` = todo OK.
 */
export function validarMedidasItems(items, { pedidoCerrado = false } = {}) {
  /** @type {Record<number, string>} */
  const errores = {}
  ;(items ?? []).forEach((item, i) => {
    if (!lineaSeEnvia(item)) return
    if (modoMedidaDeItem(item, { pedidoCerrado }) !== MODO_MEDIDAS.EDITABLE) return
    const msg = mensajeErrorMedida(item.medida)
    if (msg) errores[i] = msg
  })
  return errores
}
