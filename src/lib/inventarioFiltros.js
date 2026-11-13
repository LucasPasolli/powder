// src/lib/inventarioFiltros.js
// Reglas PURAS de búsqueda y filtrado del módulo Inventario (sin React ni Supabase: se testean sin mocks).
//
// Patrón: "Specification" compilada. `compilarCriterios` convierte el estado de la UI (strings) en
// criterios ya tipados UNA sola vez por cambio de filtros; `cumpleCriterios` los evalúa por producto
// sin re-tokenizar ni re-parsear en cada fila.
//
// Reglas de negocio (criterios de aceptación):
//   · Nombre → SOLO `nombre`. Sin tildes ni mayúsculas, todas las palabras presentes, en cualquier
//     orden (mismo motor que el Presupuestador: lib/busquedaProductos).  "100" NO mira el ID.
//   · ID     → SOLO `idProducto`. Solo dígitos, coincidencia EXACTA (nunca parcial).
//   · Todo se combina con AND: nombre Y ID Y categoría Y proveedor Y stock Y bajo stock.
//   · Filtros dependientes: cada desplegable ofrece únicamente valores que dejan al menos un
//     producto dadas TODAS las demás condiciones (faceted search). "Todos" siempre está disponible.

import {
  normalizarTexto, tokenizarConsulta, coincidePorNombre, sanitizarDigitosId, parsearIdProducto,
} from './busquedaProductos'
import { esBajoStock } from './inventarioUtils'

/** Valor del "sin filtro" de cada desplegable. */
export const TODOS = 'all'

/** Valores válidos del filtro de stock. */
export const VALORES_STOCK = /** @type {const} */ (['all', 'con', 'sin'])

/** Tope de caracteres del buscador por nombre (evita pegados absurdos; los nombres reales son cortos). */
export const MAX_CARACTERES_NOMBRE = 120

/** Desplegables que participan de la dependencia entre filtros. */
export const FACETAS = /** @type {const} */ (['categoria', 'proveedor', 'stock'])

/** Estado inicial de TODOS los filtros (mismas claves que usa `inventarioUtils.hayFiltrosActivos`). */
export const FILTROS_INICIALES = Object.freeze({
  searchNombre: '',
  searchId: '',
  filterCat: TODOS,
  filterProveedor: TODOS,
  filterStock: TODOS,
  filterBajoStock: false,
})

// Clave de estado de cada faceta.
const CLAVE_FACETA = { categoria: 'filterCat', proveedor: 'filterProveedor', stock: 'filterStock' }

/**
 * @typedef {typeof FILTROS_INICIALES} Filtros
 *
 * @typedef {object} Criterios
 * @property {string[]} tokens          Palabras normalizadas del buscador por nombre (vacío = sin criterio).
 * @property {boolean}  conId           El campo ID tiene dígitos.
 * @property {number|null} idProducto   ID utilizable, o null si no puede existir (0 / fuera de rango).
 * @property {number|null} idCategoria
 * @property {number|null} idProveedor
 * @property {'all'|'con'|'sin'} stock
 * @property {boolean}  bajoStock
 */

/** @param {unknown} valor @returns {number|null} */
function aEnteroOTodos(valor) {
  if (valor === TODOS || valor === '' || valor == null) return null
  const n = Number(valor)
  // Un valor corrupto (no numérico) jamás debe interpretarse como "Todos": no coincide con nada.
  return Number.isInteger(n) ? n : Number.NaN
}

/**
 * Convierte el estado de la UI en criterios tipados.
 * @param {Partial<Filtros>} filtros
 * @returns {Criterios}
 */
export function compilarCriterios(filtros) {
  const f = { ...FILTROS_INICIALES, ...filtros }
  const textoId = sanitizarDigitosId(f.searchId)
  return {
    tokens: tokenizarConsulta(f.searchNombre),
    conId: textoId !== '',
    idProducto: textoId !== '' ? parsearIdProducto(textoId) : null,
    idCategoria: aEnteroOTodos(f.filterCat),
    idProveedor: aEnteroOTodos(f.filterProveedor),
    stock: VALORES_STOCK.includes(f.filterStock) ? f.filterStock : TODOS,
    bajoStock: f.filterBajoStock === true,
  }
}

/** @param {{ proveedores?: Array<{ idProveedor: number }> }} p @param {number} idProveedor */
const tieneProveedor = (p, idProveedor) => (p.proveedores ?? []).some((pv) => pv.idProveedor === idProveedor)

/**
 * ¿El producto cumple TODOS los criterios (AND)?
 * @param {any} p  Producto (idealmente con `nombreNormalizado`, ver `prepararCatalogo`).
 * @param {Criterios} c
 * @param {'categoria'|'proveedor'|'stock'|null} [omitir]  Faceta que se ignora (para contar sus opciones).
 */
export function cumpleCriterios(p, c, omitir = null) {
  // ID exacto. Si el ID tecleado no puede existir (`idProducto === null`) nada coincide.
  if (c.conId && p.idProducto !== c.idProducto) return false
  // Nombre: nunca toca el ID.
  if (c.tokens.length > 0 && !coincidePorNombre(p.nombreNormalizado ?? normalizarTexto(p.nombre), c.tokens)) return false

  if (omitir !== 'categoria' && c.idCategoria !== null && p.idCategoria !== c.idCategoria) return false
  if (omitir !== 'proveedor' && c.idProveedor !== null && !tieneProveedor(p, c.idProveedor)) return false
  if (omitir !== 'stock') {
    if (c.stock === 'con' && !(p.stockTotal > 0)) return false
    if (c.stock === 'sin' && p.stockTotal !== 0) return false
  }
  if (c.bajoStock && !esBajoStock(p)) return false
  return true
}

/**
 * Cuenta cuántos productos quedarían por cada valor posible de UNA faceta, aplicando todas las demás
 * condiciones. Es la base de "no se ofrecen combinaciones imposibles".
 *
 * @param {any[]} catalogo
 * @param {Partial<Filtros>} filtros
 * @param {'categoria'|'proveedor'|'stock'} faceta
 * @returns {Map<string, number>}  clave = valor del desplegable ('12', 'con', ...)
 */
export function contarFaceta(catalogo, filtros, faceta) {
  const criterios = compilarCriterios(filtros)
  /** @type {Map<string, number>} */
  const cuenta = new Map()
  const sumar = (clave) => cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)

  for (const p of catalogo) {
    if (!cumpleCriterios(p, criterios, faceta)) continue
    if (faceta === 'categoria') sumar(String(p.idCategoria))
    else if (faceta === 'proveedor') new Set((p.proveedores ?? []).map((pv) => pv.idProveedor)).forEach((id) => sumar(String(id)))
    else sumar(p.stockTotal > 0 ? 'con' : 'sin') // stock >= 0 por esquema; 0 = sin stock
  }
  return cuenta
}

/**
 * Opciones coherentes de un desplegable: "Todos" + los valores con al menos un producto.
 * El valor actualmente elegido SIEMPRE se conserva (aunque un buscador de texto lo deje en 0), para que
 * el <select> nunca muestre un valor que no está en su lista.
 *
 * @param {object} p
 * @param {any[]} p.catalogo
 * @param {Partial<Filtros>} p.filtros
 * @param {'categoria'|'proveedor'|'stock'} p.faceta
 * @param {Array<{ value: string, label: string }>} p.universo  Todas las opciones posibles (sin "Todos").
 * @param {string} p.etiquetaTodos
 * @returns {Array<{ value: string, label: string, cantidad: number|null }>}
 */
export function opcionesFaceta({ catalogo, filtros, faceta, universo, etiquetaTodos }) {
  const cuenta = contarFaceta(catalogo, filtros, faceta)
  const elegido = String({ ...FILTROS_INICIALES, ...filtros }[CLAVE_FACETA[faceta]])
  const opciones = universo
    .filter((o) => (cuenta.get(o.value) ?? 0) > 0 || o.value === elegido)
    .map((o) => ({ value: o.value, label: o.label, cantidad: cuenta.get(o.value) ?? 0 }))
  return [{ value: TODOS, label: etiquetaTodos, cantidad: null }, ...opciones]
}

/**
 * Deja coherentes los DESPLEGABLES entre sí (ignora los buscadores de texto): si el valor de uno ya no
 * deja ningún producto dadas las otras elecciones, vuelve a "Todos". Se usa al restaurar una vista
 * guardada o tras recargar datos (p. ej. se borró el último producto de un proveedor).
 * Reinicia lo MÍNIMO: tras cada reinicio recalcula, porque aflojar un filtro puede volver válido a otro.
 *
 * No se usa al tipear en los buscadores: ahí un resultado vacío es la respuesta correcta, no un error.
 *
 * @param {Filtros} filtros
 * @param {any[]} catalogo
 * @returns {Filtros}  El MISMO objeto si ya era coherente (identidad estable → sin re-render).
 */
export function reconciliarDesplegables(filtros, catalogo) {
  let actual = filtros
  for (const faceta of FACETAS) {
    const clave = CLAVE_FACETA[faceta]
    if (actual[clave] === TODOS) continue
    const sinTexto = { ...actual, searchNombre: '', searchId: '' }
    if ((contarFaceta(catalogo, sinTexto, faceta).get(String(actual[clave])) ?? 0) === 0) {
      actual = { ...actual, [clave]: TODOS }
    }
  }
  return actual
}

/**
 * Criterios activos en forma legible, para el resumen "se aplican todas a la vez (Y)".
 * @param {Filtros} f
 * @param {{ nombreCategoria?: (id: string) => string, nombreProveedor?: (id: string) => string }} [resolvedores]
 * @returns {Array<{ clave: keyof Filtros, etiqueta: string, valor: string }>}
 */
export function describirCriterios(f, { nombreCategoria = (x) => x, nombreProveedor = (x) => x } = {}) {
  const lista = []
  const nombre = String(f.searchNombre ?? '').trim()
  const id = sanitizarDigitosId(f.searchId)
  if (nombre) lista.push({ clave: 'searchNombre', etiqueta: 'Nombre', valor: nombre })
  if (id) lista.push({ clave: 'searchId', etiqueta: 'ID', valor: id })
  if (f.filterCat !== TODOS) lista.push({ clave: 'filterCat', etiqueta: 'Categoría', valor: nombreCategoria(String(f.filterCat)) })
  if (f.filterProveedor !== TODOS) lista.push({ clave: 'filterProveedor', etiqueta: 'Proveedor', valor: nombreProveedor(String(f.filterProveedor)) })
  if (f.filterStock !== TODOS) lista.push({ clave: 'filterStock', etiqueta: 'Stock', valor: f.filterStock === 'con' ? 'Con stock' : 'Sin stock' })
  if (f.filterBajoStock) lista.push({ clave: 'filterBajoStock', etiqueta: 'Bajo stock', valor: 'Sí' })
  return lista
}

/**
 * Texto de apoyo bajo el "Sin resultados" del listado. Distingue el caso del ID (exacto: "no existe")
 * del de condiciones combinadas ("ninguno cumple todas a la vez").
 * @param {Filtros} f
 * @returns {string}
 */
export function mensajeSinResultados(f) {
  const criterios = describirCriterios(f)
  const id = sanitizarDigitosId(f.searchId)
  if (criterios.length === 1 && id) return `No existe un producto con el ID ${id}.`
  if (criterios.length > 1) return 'Ningún producto cumple todas las condiciones a la vez. Probá quitar alguna.'
  return ''
}
