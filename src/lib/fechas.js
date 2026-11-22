// src/lib/fechas.js
// Utilidades PURAS de fechas de calendario («date» de Postgres, sin hora).
//
// POR QUÉ EXISTE (Escenario 12 – zona horaria)
//   `new Date().toISOString().slice(0, 10)` devuelve el día en UTC. En Argentina (UTC-3)
//   a partir de las 21:00 locales ya es «mañana» en UTC, así que un cobro registrado a las
//   22:00 quedaba guardado con la fecha del día siguiente. Todo lo que representa «hoy» para
//   el negocio debe calcularse en America/Argentina/Buenos_Aires.
//
// REGLA DE ORO: una fecha de calendario viaja SIEMPRE como texto 'AAAA-MM-DD'. Nunca se
//   convierte a `Date` para mostrarla ni para compararla (comparar ISO como texto es
//   correcto y no depende del huso horario del navegador).

export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

const ISO_ESTRICTO = /^(\d{4})-(\d{2})-(\d{2})$/

const formateadorHoy = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Fecha de hoy (AAAA-MM-DD) en la zona horaria del negocio, sin importar el huso del dispositivo.
 * @param {Date} [ahora]  Inyectable para testear.
 * @returns {string}
 */
export function hoyISO(ahora = new Date()) {
  const partes = Object.fromEntries(
    formateadorHoy.formatToParts(ahora).map(({ type, value }) => [type, value]),
  )
  return `${partes.year}-${partes.month}-${partes.day}`
}

/**
 * ¿Es un texto AAAA-MM-DD que además existe en el calendario? (rechaza 2026-02-30, 2026-13-01…)
 * @param {unknown} valor
 * @returns {valor is string}
 */
export function esFechaISO(valor) {
  const m = ISO_ESTRICTO.exec(String(valor ?? ''))
  if (!m) return false
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])]
  // UTC solo como calculadora de calendario: no hay huso involucrado en la verificación.
  const f = new Date(Date.UTC(anio, mes - 1, dia))
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia
}

/**
 * AAAA-MM-DD → dd/mm/aaaa reordenando el TEXTO (sin `new Date`, sin desfases de un día).
 * Valores nulos, vacíos o inválidos devuelven `vacio` (por defecto «—»): jamás «01/01/1970»,
 * «Invalid Date» ni una excepción (Escenario 2).
 * @param {string|null|undefined} iso
 * @param {string} [vacio]
 * @returns {string}
 */
export function formatearFechaDMA(iso, vacio = '—') {
  if (!esFechaISO(iso)) return vacio
  const [anio, mes, dia] = String(iso).split('-')
  return `${dia}/${mes}/${anio}`
}
