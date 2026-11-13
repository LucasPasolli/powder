// src/lib/busquedaProductos.js
// Reglas PURAS de los buscadores de producto del Presupuestador (sin React ni Supabase:
// se testean sin mocks). Dos buscadores independientes, cada uno sobre UN solo atributo:
//   · Nombre → solo `nombre`. Sin tildes ni mayúsculas, varias palabras en cualquier orden.
//   · ID     → solo `id_producto`. Solo dígitos, coincidencia exacta.

/** Mayor valor representable por una columna `int4` (id_producto). */
export const MAX_ID_PRODUCTO = 2147483647

/** Cantidad de dígitos de MAX_ID_PRODUCTO: tope de caracteres del campo "Buscar por ID". */
export const MAX_DIGITOS_ID = 10

/** Cantidad máxima de resultados que se dibujan (el total real se informa aparte). */
export const LIMITE_RESULTADOS = 30

/**
 * Normaliza para comparar: sin tildes/diacríticos, en minúsculas y con los espacios colapsados.
 * @param {unknown} valor
 * @returns {string}
 */
export function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Palabras de la consulta, normalizadas y sin repetir.
 * @param {unknown} consulta
 * @returns {string[]}
 */
export function tokenizarConsulta(consulta) {
  const normalizada = normalizarTexto(consulta)
  return normalizada ? [...new Set(normalizada.split(' '))] : []
}

/**
 * Deja solo dígitos (también ante pegados con letras/espacios/símbolos) y corta al máximo.
 * @param {unknown} valor
 * @returns {string}
 */
export function sanitizarDigitosId(valor) {
  return String(valor ?? '').replace(/\D/g, '').slice(0, MAX_DIGITOS_ID)
}

/**
 * Convierte el texto del campo ID en un id utilizable, o `null` si no puede existir
 * (vacío, 0, o fuera del rango de `int4`: evita un request que el servidor rechazaría).
 * @param {unknown} texto
 * @returns {number | null}
 */
export function parsearIdProducto(texto) {
  const limpio = String(texto ?? '')
  if (!/^\d{1,10}$/.test(limpio)) return null
  const n = Number(limpio)
  return n >= 1 && n <= MAX_ID_PRODUCTO ? n : null
}

/**
 * Agrega `nombreNormalizado` a cada producto para no normalizar el catálogo en cada tecla.
 * @template {{ nombre: string }} T
 * @param {T[]} productos
 * @returns {Array<T & { nombreNormalizado: string }>}
 */
export function prepararCatalogo(productos) {
  return (productos ?? []).map((p) => ({ ...p, nombreNormalizado: normalizarTexto(p.nombre) }))
}

/**
 * ¿Están TODAS las palabras en el nombre, en cualquier orden?
 * @param {string} nombreNormalizado
 * @param {string[]} tokens
 */
export function coincidePorNombre(nombreNormalizado, tokens) {
  return tokens.length > 0 && tokens.every((t) => nombreNormalizado.includes(t))
}

// 0 = el nombre empieza con la consulta; 1 = cada palabra empieza una palabra del nombre; 2 = el resto.
function puntaje(nombreNormalizado, tokens, frase) {
  if (nombreNormalizado.startsWith(frase)) return 0
  const conEspacio = ` ${nombreNormalizado}`
  return tokens.every((t) => conEspacio.includes(` ${t}`)) ? 1 : 2
}

/**
 * Busca por NOMBRE en un catálogo preparado (ver `prepararCatalogo`). Nunca mira el ID.
 * @template {{ nombreNormalizado: string }} T
 * @param {T[]} catalogo
 * @param {string} consulta
 * @param {{ limite?: number }} [opciones]
 * @returns {{ items: T[], total: number }} `total` = coincidencias reales (pueden superar `items`).
 */
export function buscarPorNombre(catalogo, consulta, { limite = LIMITE_RESULTADOS } = {}) {
  const tokens = tokenizarConsulta(consulta)
  if (tokens.length === 0) return { items: [], total: 0 }

  const frase = tokens.join(' ')
  const coincidentes = []
  for (const p of catalogo) {
    if (coincidePorNombre(p.nombreNormalizado, tokens)) {
      coincidentes.push({ p, rango: puntaje(p.nombreNormalizado, tokens, frase) })
    }
  }
  coincidentes.sort((a, b) =>
    a.rango - b.rango
    || (a.p.nombreNormalizado < b.p.nombreNormalizado ? -1 : a.p.nombreNormalizado > b.p.nombreNormalizado ? 1 : 0))

  return { items: coincidentes.slice(0, limite).map((c) => c.p), total: coincidentes.length }
}
