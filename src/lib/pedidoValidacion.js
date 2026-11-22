// src/lib/pedidoValidacion.js
//
// Validaciones de los formularios «Registrar factura» y «Registrar recepción».
// Puras y con UN mensaje por campo (criterios T1 esc. 6 y T3 esc. 7). El servidor
// vuelve a validar todo: esto sólo da feedback inmediato.

const MAX_CANTIDAD = 1_000_000
const MAX_LINEAS = 500

export const MENSAJES = Object.freeze({
  cantidadVacia: 'Ingresá una cantidad.',
  cantidadNoNumerica: 'La cantidad debe ser un número entero.',
  cantidadNegativa: 'La cantidad no puede ser negativa.',
  cantidadCero: 'La cantidad debe ser mayor a 0 (quitá la línea si no se factura).',
  cantidadMaxima: 'La cantidad es demasiado grande.',
  precioVacio: 'Ingresá el precio.',
  precioInvalido: 'El precio debe ser un número mayor a 0.',
  descuentoInvalido: 'El precio con descuento debe ser un número mayor a 0.',
  descuentoMayor: 'El precio con descuento no puede superar el precio de lista.',
  medidaRequerida: 'Elegí una medida.',
  sinLineas: 'El pedido debe tener al menos una línea.',
  demasiadasLineas: `El pedido no puede tener más de ${MAX_LINEAS} líneas.`,
  recepcionVacia: 'Al menos una línea debe tener cantidad recibida mayor a 0.',
})

const esVacio = (v) => v === null || v === undefined || String(v).trim() === ''

/**
 * Entero ≥ 0 desde texto. Acepta sólo dígitos: rechaza decimales, notación
 * científica, texto y negativos (con mensaje específico).
 * @returns {{valor: number|null, error: string|null}}
 */
export function parsearCantidad(texto) {
  if (esVacio(texto)) return { valor: null, error: MENSAJES.cantidadVacia }
  const t = String(texto).trim()
  if (/^-\s*\d/.test(t)) return { valor: null, error: MENSAJES.cantidadNegativa }
  if (!/^\d+$/.test(t)) return { valor: null, error: MENSAJES.cantidadNoNumerica }
  const n = Number(t)
  if (!Number.isSafeInteger(n) || n > MAX_CANTIDAD) return { valor: null, error: MENSAJES.cantidadMaxima }
  return { valor: n, error: null }
}

/** Precio positivo desde texto (admite coma decimal). @returns {number|null} */
export function parsearPrecio(texto) {
  if (esVacio(texto)) return null
  const t = String(texto).trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Valida las líneas del formulario de facturación.
 * @param {Array<{cantidad: string|number, precioUnitario: string|number, precioConDescuento?: string|number|null,
 *                tieneMedidas?: boolean, medida?: string|null}>} lineas
 * @returns {{ok: boolean, general: string|null, errores: Record<number, {cantidad?: string, precio?: string, descuento?: string, medida?: string}>}}
 */
export function validarFactura(lineas) {
  const errores = {}
  let general = null

  if (!Array.isArray(lineas) || lineas.length === 0) general = MENSAJES.sinLineas
  else if (lineas.length > MAX_LINEAS) general = MENSAJES.demasiadasLineas

  ;(lineas ?? []).forEach((l, i) => {
    const e = {}

    const c = parsearCantidad(l.cantidad)
    if (c.error) e.cantidad = c.error
    else if (c.valor === 0) e.cantidad = MENSAJES.cantidadCero

    let precio = null
    if (esVacio(l.precioUnitario)) e.precio = MENSAJES.precioVacio
    else {
      precio = parsearPrecio(l.precioUnitario)
      if (precio === null) e.precio = MENSAJES.precioInvalido
    }

    if (!esVacio(l.precioConDescuento)) {
      const d = parsearPrecio(l.precioConDescuento)
      if (d === null) e.descuento = MENSAJES.descuentoInvalido
      else if (precio !== null && d > precio) e.descuento = MENSAJES.descuentoMayor
    }

    if (l.tieneMedidas && esVacio(l.medida)) e.medida = MENSAJES.medidaRequerida

    if (Object.keys(e).length) errores[i] = e
  })

  return { ok: general === null && Object.keys(errores).length === 0, general, errores }
}

/**
 * Valida la recepción y arma las advertencias previas a confirmar (T3 esc. 5, 6, 7).
 * @param {Array<{cantidadFacturada: number, cantidadRecibida: string|number}>} lineas
 * @returns {{ok: boolean, general: string|null, errores: Record<number, string>,
 *            advertencias: Array<{indice: number, facturada: number, recibida: number, tipo: 'menor'|'mayor'}>}}
 */
export function validarRecepcion(lineas) {
  const errores = {}
  const advertencias = []
  let suma = 0
  let todasValidas = true

  ;(lineas ?? []).forEach((l, i) => {
    const { valor, error } = parsearCantidad(l.cantidadRecibida)
    if (error) {
      errores[i] = error
      todasValidas = false
      return
    }
    suma += valor
    if (valor !== l.cantidadFacturada) {
      advertencias.push({ indice: i, facturada: l.cantidadFacturada, recibida: valor, tipo: valor < l.cantidadFacturada ? 'menor' : 'mayor' })
    }
  })

  // «Todas en 0» sólo se informa cuando el resto del formulario es válido.
  const general = todasValidas && (lineas ?? []).length > 0 && suma === 0 ? MENSAJES.recepcionVacia : null
  return { ok: Object.keys(errores).length === 0 && general === null, general, errores, advertencias }
}
