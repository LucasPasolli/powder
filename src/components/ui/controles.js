// src/components/ui/controles.js
// Fuente ÚNICA de la altura de los controles de filtro (buscador, selectores,
// fechas, checkbox-pastilla, botones de limpiar).
//
// POR QUÉ UNA ALTURA FIJA: antes cada control derivaba su alto de padding +
// interlineado + borde, y cada archivo lo calculaba distinto (38, 40, 42, 46 px),
// así que en una misma fila nunca coincidían. Con `h-*` explícito el alto deja de
// depender del contenido y del navegador.
//
//   táctil  (≤ 1024 px): 44 px  → área mínima Apple HIG / WCAG 2.5.5.
//   escritorio (≥ 1025): 42 px  → altura natural de Button/Input/Select md del
//                                  sistema de diseño (py-2.5 + text-sm + borde),
//                                  así los controles nuevos no desentonan con los viejos.
//
// El umbral 1025 es el mismo que usa el resto del proyecto (useBreakpoint, TOQUE).
// Uso: sin `py-*` ni `min-h-*` en el mismo elemento (el alto ya está resuelto).
export const ALTO_CONTROL = 'h-11 min-[1025px]:h-[42px]'
