// src/lib/posicionMenu.js
// Cálculo PURO (sin DOM) de la posición de un menú desplegable anclado a un botón.
//
// POR QUÉ EXISTE
// ──────────────
// El popover de <MenuAcciones> se dibujaba con `absolute left-0 top-full z-50` DENTRO de
// <PageHeader>, que usa `animate-slide-up` (transform + fill-mode forwards → stacking
// context permanente). Ningún z-index interno puede salir de ese contexto, así que los
// campos de filtro (posteriores en el DOM) se pintaban por encima del menú. Ahora el menú
// vive en un portal (document.body) y necesita coordenadas de VIEWPORT: este módulo las
// calcula.
//
// REGLAS
//   · Horizontal: alineado al borde DERECHO del botón; se recorta al ancho útil con margen
//     a cada lado, así nunca sobresale de la pantalla.
//   · Vertical: debajo del botón. Si no entra completo y arriba hay más lugar, se abre
//     HACIA ARRIBA. Si aun así no entra, se limita `maxHeight` al espacio disponible
//     (el panel scrollea por dentro). Siempre se devuelve `top` (nunca `bottom`): sólo
//     depende de getBoundingClientRect() y es confiable en iOS Safari (ver
//     lib/posicionDropdown.js).
//
// Sistema de coordenadas: el de `getBoundingClientRect()` (viewport). Úsese con
// `position: fixed`.

/** @typedef {{ top: number, bottom: number, left: number, right: number }} RectAncla */
/** @typedef {{ ancho: number, alto: number }} Dimension */

/** Aire contra los bordes de la pantalla. */
export const MARGEN_PX = 8
/** Distancia entre el botón y el menú. */
export const SEPARACION_PX = 6
/** Piso de altura: aun en pantallas muy bajas se ven al menos ~2 opciones. */
export const ALTURA_MINIMA_PX = 96

const acotar = (n, min, max) => Math.min(Math.max(n, min), max)

/**
 * @param {object} p
 * @param {RectAncla} p.ancla     Rect del botón (viewport).
 * @param {Dimension} p.area      Zona visible: ancho útil (sin scrollbar) y alto.
 * @param {Dimension} p.contenido Tamaño NATURAL del menú (sin límite de altura).
 * @param {number} [p.margen]
 * @param {number} [p.separacion]
 * @returns {{ top: number, left: number, width: number, maxHeight: number, lado: 'abajo'|'arriba' }}
 */
export function calcularPosicionMenu({
  ancla, area, contenido, margen = MARGEN_PX, separacion = SEPARACION_PX,
}) {
  // ── Horizontal: borde derecho del menú = borde derecho del botón ──────────
  const anchoUtil = Math.max(0, area.ancho - margen * 2)
  const width = Math.min(contenido.ancho, anchoUtil)
  const left = acotar(ancla.right - width, margen, Math.max(margen, area.ancho - margen - width))

  // ── Vertical ──────────────────────────────────────────────────────────────
  const espacioAbajo = area.alto - ancla.bottom - separacion - margen
  const espacioArriba = ancla.top - separacion - margen
  const entraAbajo = contenido.alto <= espacioAbajo
  const lado = !entraAbajo && espacioArriba > espacioAbajo ? 'arriba' : 'abajo'

  const disponible = lado === 'abajo' ? espacioAbajo : espacioArriba
  const maxHeight = Math.floor(Math.min(contenido.alto, Math.max(disponible, ALTURA_MINIMA_PX)))

  const topIdeal = lado === 'abajo'
    ? ancla.bottom + separacion
    : ancla.top - separacion - maxHeight
  // Red de seguridad: con pantallas diminutas el piso de altura podría empujar el menú
  // fuera del viewport; se lo mantiene dentro mientras sea posible.
  const top = Math.round(acotar(topIdeal, margen, Math.max(margen, area.alto - margen - maxHeight)))

  return { top, left: Math.round(left), width, maxHeight, lado }
}
