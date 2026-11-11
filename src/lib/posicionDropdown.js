// src/lib/posicionDropdown.js
// Cálculo PURO de la posición de un desplegable (resultados de búsqueda) anclado a un campo.
//
// POR QUÉ EXISTE
// ──────────────
// Los desplegables del Presupuestador se posicionaban con `left = rect.left` y
// `width = max(rect.width, 300)`. En un celular de 360 px, con el campo ya desplazado
// a la derecha dentro de la tarjeta, el borde derecho del desplegable quedaba FUERA de
// la pantalla (contenido cortado + scroll horizontal). Además, con el teclado virtual
// abierto, la lista nacía por debajo del área visible.
//
// Esta función recibe sólo números (sin DOM) para poder testearla sin navegador:
//   • recorta horizontalmente al ancho útil (margen a cada lado);
//   • en pantallas angostas ocupa todo el ancho útil (objetivo táctil cómodo);
//   • decide si abre hacia abajo o hacia ARRIBA según el espacio realmente visible
//     (descontando el teclado virtual) y limita la altura a ese espacio.
//
// Sistema de coordenadas: el de `getBoundingClientRect()` (viewport de layout) y el
// de `position: fixed`. El área visible se expresa en ese mismo sistema.

/** @typedef {{ top: number, bottom: number, left: number, width: number }} RectAncla */
/** @typedef {{ ancho: number, arriba: number, abajo: number }} AreaVisible
 *  `ancho`: ancho de layout disponible. `arriba`/`abajo`: bordes superior e inferior de la
 *  zona visible (con teclado abierto, `abajo` es el borde superior del teclado). */

/** Por debajo de este ancho el desplegable ocupa todo el ancho útil (celular). */
export const ANCHO_CELULAR_PX = 640

const acotar = (n, min, max) => Math.min(Math.max(n, min), max)

/**
 * @param {object} p
 * @param {RectAncla} p.ancla
 * @param {AreaVisible} p.area
 * @param {number} p.alturaLayout   `window.innerHeight` (referencia de `bottom` en position: fixed).
 * @param {number} [p.anchoMinimo]  Ancho mínimo deseado en pantallas no angostas.
 * @param {number} [p.margen]       Aire contra los bordes de pantalla.
 * @param {number} [p.separacion]   Distancia entre el campo y el desplegable.
 * @param {number} [p.alturaMaxima] Tope de altura del desplegable.
 * @param {number} [p.alturaMinima] Espacio que se prefiere tener antes de abrir hacia arriba.
 * @returns {{ left: number, width: number, maxHeight: number, arriba: boolean, top?: number, bottom?: number }}
 */
export function calcularPosicionDropdown({
  ancla,
  area,
  alturaLayout,
  anchoMinimo = 300,
  margen = 8,
  separacion = 4,
  alturaMaxima = 260,
  alturaMinima = 160,
}) {
  // ── Horizontal ────────────────────────────────────────────────────────────
  const anchoUtil = Math.max(0, area.ancho - margen * 2)
  const anchoDeseado = area.ancho < ANCHO_CELULAR_PX ? anchoUtil : Math.max(ancla.width, anchoMinimo)
  const width = Math.min(anchoDeseado, anchoUtil)
  const left = acotar(ancla.left, margen, Math.max(margen, area.ancho - margen - width))

  // ── Vertical ──────────────────────────────────────────────────────────────
  const espacioAbajo = area.abajo - ancla.bottom - separacion - margen
  const espacioArriba = ancla.top - area.arriba - separacion - margen
  // Se abre hacia arriba sólo si abajo no alcanza Y arriba hay más lugar.
  const arriba = espacioAbajo < alturaMinima && espacioArriba > espacioAbajo
  const espacio = arriba ? espacioArriba : espacioAbajo
  // Piso de 96 px: aun en landscape con teclado, que se vean al menos ~2 resultados.
  const maxHeight = Math.round(Math.min(alturaMaxima, Math.max(espacio, 96)))

  return arriba
    ? { left, width, maxHeight, arriba, bottom: Math.round(alturaLayout - ancla.top + separacion) }
    : { left, width, maxHeight, arriba, top: Math.round(ancla.bottom + separacion) }
}

/** Traduce el resultado a un objeto `style` de React (position: fixed). */
export function aEstiloFijo(pos, zIndex = 9999) {
  const { left, width, maxHeight, top, bottom } = pos
  return { position: 'fixed', left, width, maxHeight, zIndex, ...(top != null ? { top } : { bottom }) }
}
