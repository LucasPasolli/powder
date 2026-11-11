// src/lib/pctExcepcion.js
// Signo del porcentaje de la "Excepción" de método de pago.
//
// CONVENCIÓN (la existente, sin cambios): `pct` es el texto tal como lo escribe el usuario.
//   "10"  → 10 % de DESCUENTO      (factor 0,90)
//   "-10" → 10 % de RECARGO        (factor 1,10)
//
// POR QUÉ EXISTE: en iOS el teclado decimal (`inputMode="decimal"`) NO tiene la tecla "−",
// así que desde un iPhone era imposible cargar un recargo. En pantallas táctiles la UI
// ofrece un selector "Descuento | Recargo" que usa estas funciones; el cálculo
// (`1 - pct/100`) y el formato guardado son exactamente los mismos que en escritorio.

/** @param {string} pct */
export const esRecargoPct = (pct) => typeof pct === 'string' && pct.trim().startsWith('-')

/**
 * Devuelve `pct` con el signo del tipo pedido, conservando la magnitud ya escrita.
 * @param {string} pct
 * @param {'descuento'|'recargo'} tipo
 * @returns {string} texto válido para la expresión /^-?\d*\.?\d*$/ que ya valida el campo.
 */
export function aplicarSignoPct(pct, tipo) {
  const magnitud = String(pct ?? '').trim().replace(/^-+/, '')
  if (tipo === 'recargo') return `-${magnitud}`
  return magnitud
}
