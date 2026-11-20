// src/lib/saldosFiltros.js
// Reglas PURAS del filtro «Fecha de pago» y del orden del listado de Saldos.
// Viven fuera del componente para que escritorio, mobile/tablet y el service apliquen
// EXACTAMENTE la misma regla (DRY) y para testearlas sin renderizar nada.

import { esFechaISO } from './fechas'

// ─── Rango de fecha de pago ─────────────────────────────────────────────────

export const MENSAJE_RANGO_INVERTIDO = 'La fecha "Hasta" no puede ser anterior a "Desde".'
export const MENSAJE_FECHA_INVALIDA = 'Ingresá fechas de pago válidas.'

/**
 * Valida el rango «Fecha de pago desde / hasta». Cualquiera de los dos extremos puede faltar
 * (rango abierto, Escenario 5). Las fechas ISO se comparan como texto (sin `Date`, sin huso).
 * @param {string|null|undefined} desde
 * @param {string|null|undefined} hasta
 * @returns {string} Mensaje de error o '' si el rango es coherente.
 */
export function validarRangoFechaPago(desde, hasta) {
  if ((desde && !esFechaISO(desde)) || (hasta && !esFechaISO(hasta))) return MENSAJE_FECHA_INVALIDA
  if (desde && hasta && hasta < desde) return MENSAJE_RANGO_INVERTIDO
  return ''
}

// ─── Orden ──────────────────────────────────────────────────────────────────
// Un único valor serializado `campo:direccion` (p. ej. 'fechaPago:desc'). Una sola fuente de
// verdad para escritorio (botón de urgencia + encabezado de columna) y mobile (chips del panel).

export const CAMPO_URGENCIA = 'urgencia'
export const CAMPO_FECHA_PAGO = 'fechaPago'
export const ORDEN_DEFAULT = `${CAMPO_URGENCIA}:asc`

const CAMPOS = [CAMPO_URGENCIA, CAMPO_FECHA_PAGO]

/**
 * Descompone un orden serializado. Cualquier valor desconocido cae al orden por defecto
 * (el valor puede venir de un estado viejo o manipulado: se valida contra lista cerrada).
 * @param {unknown} valor
 * @returns {{ campo: 'urgencia'|'fechaPago', dir: 'asc'|'desc' }}
 */
export function parseOrden(valor) {
  const partes = String(valor ?? '').split(':')
  const [campo, dir] = partes
  if (partes.length !== 2 || !CAMPOS.includes(campo) || (dir !== 'asc' && dir !== 'desc')) {
    return { campo: CAMPO_URGENCIA, dir: 'asc' }
  }
  return { campo, dir }
}

/** Clic en un orden: si ya era el campo activo invierte la dirección; si no, arranca ascendente. */
function alternarCampo(actual, campo) {
  const p = parseOrden(actual)
  const dir = p.campo === campo && p.dir === 'asc' ? 'desc' : 'asc'
  return `${campo}:${dir}`
}

/** @param {string} actual Orden vigente. @returns {string} Nuevo orden al hacer clic en «Fecha de pago». */
export const alternarOrdenFechaPago = (actual) => alternarCampo(actual, CAMPO_FECHA_PAGO)

/** @param {string} actual Orden vigente. @returns {string} Nuevo orden al hacer clic en «urgencia». */
export const alternarOrdenUrgencia = (actual) => alternarCampo(actual, CAMPO_URGENCIA)

const OPCIONES_URGENCIA = Object.freeze([
  { value: 'urgencia:asc', label: 'Más urgentes' },
  { value: 'urgencia:desc', label: 'Menos urgentes' },
])

const OPCIONES_FECHA_PAGO = Object.freeze([
  { value: 'fechaPago:asc', label: 'Pago más antiguo' },
  { value: 'fechaPago:desc', label: 'Pago más reciente' },
])

// Las opciones dependen del estado elegido (la urgencia solo tiene sentido con deuda activa y la
// fecha de pago solo con saldos cobrados):
//   · Pendientes / Parciales → urgencia (más / menos urgentes). Sin fecha de pago: aún no se cobró.
//   · Cobrados               → fecha de pago (más antiguo / más reciente). Sin urgencia: no hay deuda.
//   · Todos                  → las cuatro opciones.
const ESTADOS_CON_DEUDA = Object.freeze(['pendiente', 'parcial'])

/**
 * Opciones de orden (selector de escritorio y chips del panel mobile/tablet). La dirección va
 * incluida en cada etiqueta, así no hace falta un segundo control para «ascendente/descendente».
 * @param {string} estado 'pendiente' | 'parcial' | 'pagado' | 'all'
 */
export function opcionesOrden(estado) {
  if (estado === 'pagado') return [...OPCIONES_FECHA_PAGO]
  if (ESTADOS_CON_DEUDA.includes(estado)) return [...OPCIONES_URGENCIA]
  return [...OPCIONES_URGENCIA, ...OPCIONES_FECHA_PAGO]
}

/**
 * Orden por defecto de cada estado. «Cobrados» arranca por el pago más reciente (el equivalente
 * natural de lo que antes se llamaba «Más recientes»); el resto, por urgencia.
 * @param {string} estado
 * @returns {string}
 */
export const ordenPorDefecto = (estado) => (estado === 'pagado' ? `${CAMPO_FECHA_PAGO}:desc` : ORDEN_DEFAULT)

/**
 * Garantiza que el orden sea uno de los ofrecidos para el estado. Si el orden vigente ya no
 * existe (p. ej. quedó «Pago más antiguo» y el usuario pasó a «Pendientes»), cae al defecto del
 * estado. Así el selector, el encabezado de la tabla y la consulta nunca discrepan.
 * @param {unknown} orden
 * @param {string} estado
 * @returns {string}
 */
export function normalizarOrden(orden, estado) {
  const { campo, dir } = parseOrden(orden)
  const valor = `${campo}:${dir}`
  return opcionesOrden(estado).some((o) => o.value === valor) ? valor : ordenPorDefecto(estado)
}

/** ¿El estado ofrece ordenar por fecha de pago? (habilita el clic en el encabezado de la columna). */
export const permiteOrdenFechaPago = (estado) =>
  opcionesOrden(estado).some((o) => parseOrden(o.value).campo === CAMPO_FECHA_PAGO)
