// src/lib/notas.js
/**
 * Lógica PURA (sin React ni red) de las notas al pie de un registro.
 * Vive aparte para poder testearla sin mocks y reutilizarla en servicio,
 * hook y componentes (DRY: una sola definición de límite y de validación).
 *
 * Seguridad (OWASP A03 – Injection / XSS):
 *  · Las notas son TEXTO PLANO. Nunca se renderizan como HTML: la UI las
 *    muestra como hijo de texto de React (escapado) con `white-space: pre-wrap`.
 *  · Se eliminan caracteres de control (incluido NUL, que Postgres rechaza) y
 *    los de override bidireccional (U+202A–202E, U+2066–2069), que permiten
 *    "invertir" visualmente un texto para engañar a quien lo lee.
 *
 * @module lib/notas
 */

export const LIMITE_NOTA = 400
/** Desde cuántos caracteres restantes el contador pasa a "advertencia". */
export const UMBRAL_AVISO_RESTANTES = 40
/** Notas visibles antes de "Ver todas". */
export const NOTAS_VISIBLES_INICIAL = 3

/**
 * Tipos de registro soportados → columna FK de `nota_registro`.
 * Agregar un tipo nuevo = una fila acá + una columna FK en la migración (OCP).
 */
export const TIPOS_REGISTRO = Object.freeze({
  presupuesto:   Object.freeze({ columna: 'id_presupuesto', etiqueta: 'presupuesto' }),
  saldo:         Object.freeze({ columna: 'id_saldo',       etiqueta: 'saldo' }),
  pedido_compra: Object.freeze({ columna: 'id_pedido',      etiqueta: 'pedido de compra' }),
})

// Control C0 salvo \t (09) y \n (0A); DEL y C1; override bidi.
// eslint-disable-next-line no-control-regex
const CARACTERES_PROHIBIDOS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g

const fmtNumero = (n) => Number(n).toLocaleString('es-AR')

/** Cuenta code points (igual que `char_length` de Postgres; un emoji = 1). */
export function contarCaracteres(texto) {
  return Array.from(texto).length
}

/**
 * Normaliza saltos de línea (CRLF/CR → LF) y quita caracteres prohibidos.
 * NO recorta los extremos: sirve para el contador "en vivo".
 * @param {unknown} crudo
 * @returns {string}
 */
export function limpiarTextoNota(crudo) {
  return String(crudo ?? '').replace(/\r\n?/g, '\n').replace(CARACTERES_PROHIBIDOS, '')
}

/**
 * @typedef {Object} ValidacionNota
 * @property {boolean} valido
 * @property {string}  texto      Texto a persistir (normalizado y recortado).
 * @property {number}  longitud   Caracteres que ve el usuario en el contador.
 * @property {number}  restantes  LIMITE_NOTA - longitud (negativo = excedido).
 * @property {'vacia'|'excede'|null} error
 */

/**
 * @param {unknown} crudo
 * @returns {ValidacionNota}
 */
export function validarNota(crudo) {
  const limpio    = limpiarTextoNota(crudo)
  const texto     = limpio.trim()
  const longitud  = contarCaracteres(limpio)
  const restantes = LIMITE_NOTA - longitud

  /** @type {ValidacionNota['error']} */
  let error = null
  if (texto === '')       error = 'vacia'
  else if (restantes < 0) error = 'excede'

  return { valido: error === null, texto, longitud, restantes, error }
}

/** @param {ValidacionNota} v @returns {string} */
export function mensajeErrorNota(v) {
  if (v.error === 'vacia') return 'La nota no puede estar vacía ni contener solo espacios.'
  if (v.error === 'excede') {
    return `La nota supera el límite de ${fmtNumero(LIMITE_NOTA)} caracteres por ${fmtNumero(-v.restantes)}.`
  }
  return ''
}

/** Estado visual del contador: 'ok' | 'cerca' | 'excedido'. */
export function estadoContador(v) {
  if (v.restantes < 0) return 'excedido'
  if (v.restantes <= UMBRAL_AVISO_RESTANTES) return 'cerca'
  return 'ok'
}

/** "15/11/2026 14:30" en hora local del usuario. '—' si la fecha es inválida. */
export function formatearFechaNota(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(', ', ' ')
}

/**
 * Texto del aviso previo a eliminar un registro (Escenario 11).
 * @param {{ propias?: number, deSaldo?: number }} cantidades
 *   `deSaldo`: notas del saldo que se elimina junto con un presupuesto.
 * @returns {string} '' si no hay notas.
 */
export function textoAvisoNotas({ propias = 0, deSaldo = 0 } = {}) {
  const total = propias + deSaldo
  if (total <= 0) return ''
  const sujeto = total === 1 ? 'Este registro tiene 1 nota asociada' : `Este registro tiene ${fmtNumero(total)} notas asociadas`
  const origen = deSaldo > 0 ? ' (incluye las de su saldo)' : ''
  const efecto = total === 1 ? 'la nota también se eliminará' : 'las notas también se eliminarán'
  return `${sujeto}${origen}. Al eliminarlo, ${efecto}.`
}
