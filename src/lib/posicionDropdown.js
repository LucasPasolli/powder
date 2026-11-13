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
// DECISIÓN DE DISEÑO (fix iPhone): el desplegable SIEMPRE se ancla debajo del campo, con
// `top`. Una versión anterior lo abría hacia arriba usando `bottom`; en iOS Safari el
// alto de referencia de `bottom` (viewport de layout, barra del navegador, teclado) no
// coincide con `window.innerHeight` y la lista terminaba flotando lejos del campo,
// encima de otros componentes. `top` sólo depende de `getBoundingClientRect()` y es
// confiable. Cuando el teclado deja poco espacio debajo, en lugar de invertir la lista
// se DESPLAZA la página (ver `calcularDesplazamientoParaDropdown`).
//
// Esta función recibe sólo números (sin DOM) para poder testearla sin navegador:
//   • recorta horizontalmente al ancho útil (margen a cada lado);
//   • en pantallas angostas ocupa todo el ancho útil (objetivo táctil cómodo);
//   • limita la altura al espacio visible bajo el campo (descontando el teclado).
//
// Sistema de coordenadas: el de `getBoundingClientRect()` (viewport de layout).

/** @typedef {{ top: number, bottom: number, left: number, width: number }} RectAncla */
/** @typedef {{ ancho: number, arriba: number, abajo: number }} AreaVisible
 *  `ancho`: ancho de layout disponible. `arriba`/`abajo`: bordes superior e inferior de la
 *  zona visible (con teclado abierto, `abajo` es el borde superior del teclado). */

/** Por debajo de este ancho el desplegable ocupa todo el ancho útil (celular). */
export const ANCHO_CELULAR_PX = 640

/** Espacio libre bajo el campo por debajo del cual conviene desplazar la página. */
export const ALTURA_MINIMA_PX = 160

const acotar = (n, min, max) => Math.min(Math.max(n, min), max)

/**
 * @param {object} p
 * @param {RectAncla} p.ancla
 * @param {AreaVisible} p.area
 * @param {number} [p.anchoMinimo]  Ancho mínimo deseado en pantallas no angostas.
 * @param {number} [p.margen]       Aire contra los bordes de pantalla.
 * @param {number} [p.separacion]   Distancia entre el campo y el desplegable.
 * @param {number} [p.alturaMaxima] Tope de altura del desplegable.
 * @returns {{ left: number, width: number, top: number, maxHeight: number }}
 *          `top` en coordenadas de viewport (sumar el scroll para posición absoluta).
 */
export function calcularPosicionDropdown({
  ancla,
  area,
  anchoMinimo = 300,
  margen = 8,
  separacion = 4,
  alturaMaxima = 260,
}) {
  // ── Horizontal ────────────────────────────────────────────────────────────
  const anchoUtil = Math.max(0, area.ancho - margen * 2)
  const anchoDeseado = area.ancho < ANCHO_CELULAR_PX ? anchoUtil : Math.max(ancla.width, anchoMinimo)
  const width = Math.min(anchoDeseado, anchoUtil)
  const left = acotar(ancla.left, margen, Math.max(margen, area.ancho - margen - width))

  // ── Vertical: siempre debajo del campo ────────────────────────────────────
  const espacioAbajo = area.abajo - ancla.bottom - separacion - margen
  // Piso de 96 px: aun en landscape con teclado, que se vean al menos ~2 resultados.
  const maxHeight = Math.round(Math.min(alturaMaxima, Math.max(espacioAbajo, 96)))

  return { left, width, top: Math.round(ancla.bottom + separacion), maxHeight }
}

/**
 * Cuántos px hay que scrollear la página (hacia abajo) para que el campo quede cerca del
 * borde superior de la zona visible y el desplegable tenga lugar debajo. 0 si ya alcanza.
 * @param {object} p
 * @param {RectAncla} p.ancla
 * @param {AreaVisible} p.area
 * @param {number} [p.margenSuperior] Espacio a respetar arriba (barra fija de la app).
 * @param {number} [p.alturaMinima]
 * @param {number} [p.separacion]
 * @param {number} [p.margen]
 */
export function calcularDesplazamientoParaDropdown({
  ancla,
  area,
  margenSuperior = 72,
  alturaMinima = ALTURA_MINIMA_PX,
  separacion = 4,
  margen = 8,
}) {
  const espacioAbajo = area.abajo - ancla.bottom - separacion - margen
  if (espacioAbajo >= alturaMinima) return 0
  const destino = area.arriba + margenSuperior
  return Math.max(0, Math.round(ancla.top - destino))
}
