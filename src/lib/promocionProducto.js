// src/lib/promocionProducto.js
//
// Regla ÚNICA de "¿este producto tiene una promoción vigente y a qué precio queda?".
// Es la fuente de verdad que comparten el listado de Inventario y la exportación de la lista de
// precios (lib/listaPreciosExport), para que NO puedan divergir (escenario 13).
//
// Qué NO hace (a propósito): no decide la prioridad ni calcula el descuento. Eso sigue siendo
// `calcularPromocionParaItem` (services/promocionesService) — la misma función que usa el
// Presupuestador: promoción de producto > de categoría > global, redondeo a 2 decimales.
// Este módulo solo agrega las reglas de PRESENTACIÓN que ya regían en la lista de precios:
//   · una promo con `valor` incoherente se descarta ANTES de elegir ganadora (así no tapa a una válida);
//   · `precio_fijo` / % solo cuentan como promoción si BAJAN el precio (un "precio fijo" mayor no es oferta);
//   · `2x1` depende de la cantidad: se informa como promoción, pero no existe un precio unitario promocional.
//
// Funciones PURAS: sin React, sin red, sin fecha implícita (las promos ya llegan filtradas por vigencia
// desde `obtenerPromocionesVigentes(fecha)`). Se testean sin mocks de UI.

import { calcularPromocionParaItem } from '../services/promocionesService'

/** Redondeo a 2 decimales idéntico al de `calcularPromocionParaItem` y de la lista de precios. */
export const redondearPrecio = (n) => Math.round(n * 100) / 100

const formatoARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

/** Precio en pesos argentinos para mostrar. Único formateador de precios de esta funcionalidad. */
export const formatearPrecioARS = (n) => formatoARS.format(Number(n) || 0)

/**
 * @typedef {object} PromocionProducto
 * @property {number}  idPromocion
 * @property {string}  nombre
 * @property {'porcentaje_producto'|'precio_fijo'|'2x1'} tipo
 * @property {number|null} valor        % (porcentaje_producto), monto (precio_fijo) o null.
 * @property {number}  precioOriginal   Precio de venta guardado (redondeado). NUNCA se modifica en la BD.
 * @property {number}  precioFinal      Precio que se cobra por unidad (= original si no hay precio promocional).
 * @property {boolean} reducePrecio     `true` si `precioFinal < precioOriginal` (se muestra el original tachado).
 * @property {number}  descuentoMonto   `precioOriginal − precioFinal` (0 en 2x1).
 */

/**
 * Una promoción solo participa si su `valor` es coherente. `calcularPromocionParaItem` aplica
 * `Math.max(0, valor)`: un `precio_fijo` con valor null/inválido publicaría precio $0.
 * @param {any} promo
 */
export function promoEsCalculable(promo) {
  if (!promo) return false
  switch (promo.tipo) {
    case 'porcentaje_producto':
      return Number.isFinite(promo.valor) && promo.valor > 0 && promo.valor <= 100
    case 'precio_fijo':
      return Number.isFinite(promo.valor) && promo.valor > 0
    case '2x1':
      return true
    default:
      return false // tipo desconocido: no se aplica (fail-safe → precio regular)
  }
}

/**
 * Filtra UNA vez las promociones utilizables (se evita repetirlo por cada producto).
 * @param {Array<any> | null | undefined} promosVigentes  Resultado de `obtenerPromocionesVigentes(fecha)`.
 */
export const filtrarPromocionesCalculables = (promosVigentes) => (promosVigentes ?? []).filter(promoEsCalculable)

/**
 * Promoción que efectivamente se aplica a un producto (cantidad 1), o `null` si no tiene ninguna
 * informable. No muta el producto.
 *
 * @param {{ idProducto: number, idCategoria?: number|null, precioUnitario: number|string }} producto
 * @param {Array<any>} promosCalculables  Promos YA filtradas con `filtrarPromocionesCalculables`.
 * @returns {PromocionProducto | null}
 */
export function resolverPromocionProducto(producto, promosCalculables) {
  const precioOriginal = redondearPrecio(Number(producto.precioUnitario) || 0)

  const { promoAplicada, precioFinal } = calcularPromocionParaItem(
    {
      idProducto: producto.idProducto,
      idCategoria: producto.idCategoria,
      precioUnitario: precioOriginal,
      cantidad: 1,
    },
    promosCalculables,
  )
  if (!promoAplicada) return null

  const reducePrecio = precioFinal < precioOriginal
  const esDosPorUno = promoAplicada.tipo === '2x1'
  // Ni baja el precio ni es 2x1: no es una oferta real → se presenta como producto sin promoción.
  if (!reducePrecio && !esDosPorUno) return null

  const precioPromocional = reducePrecio ? precioFinal : precioOriginal
  return Object.freeze({
    idPromocion: promoAplicada.idPromocion,
    nombre: promoAplicada.nombre ?? '',
    tipo: promoAplicada.tipo,
    valor: promoAplicada.valor ?? null,
    precioOriginal,
    precioFinal: precioPromocional,
    reducePrecio,
    descuentoMonto: redondearPrecio(precioOriginal - precioPromocional),
  })
}

/**
 * Agrega `promocion` (PromocionProducto | null) a cada producto. Devuelve objetos NUEVOS.
 *
 * `null`      → se evaluó y NO tiene promoción vigente.
 * `undefined` → (productos que no pasaron por acá) la promoción no se evaluó: los filtros lo
 *               tratan como "sin información" y no excluyen nada (ver `cumpleCriterios`).
 *
 * @template {{ idProducto: number, idCategoria?: number|null, precioUnitario: number|string }} P
 * @param {P[]} productos
 * @param {Array<any>} promosVigentes
 * @returns {Array<P & { promocion: PromocionProducto | null }>}
 */
export function conPromocion(productos, promosVigentes) {
  const promos = filtrarPromocionesCalculables(promosVigentes)
  return (productos ?? []).map((p) => ({ ...p, promocion: resolverPromocionProducto(p, promos) }))
}

const formatoPorcentaje = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

/**
 * Texto del descuento para la etiqueta. `corto` va visible ("−15%", "−$ 1.200,00", "2×1");
 * `accesible` es la frase completa para lectores de pantalla (el signo "−" se lee mal).
 * @param {Pick<PromocionProducto, 'tipo'|'valor'|'descuentoMonto'>} promocion
 * @returns {{ corto: string, accesible: string }}
 */
export function describirPromocion(promocion) {
  switch (promocion.tipo) {
    case 'porcentaje_producto': {
      const pct = formatoPorcentaje.format(Number(promocion.valor) || 0)
      return { corto: `−${pct}%`, accesible: `${pct}% de descuento` }
    }
    case 'precio_fijo': {
      const monto = formatearPrecioARS(promocion.descuentoMonto)
      return { corto: `−${monto}`, accesible: `${monto} de descuento` }
    }
    case '2x1':
      return { corto: '2×1', accesible: '2×1' }
    default:
      return { corto: '', accesible: '' }
  }
}
