// src/hooks/useTecladoVirtual.js
// ¿Está abierto el teclado virtual? Se usa para que la barra fija de acciones del
// Presupuestador NO quede tapada (ni tape el campo que se está editando).
//
// CÓMO SE DETECTA
// ───────────────
// Con el teclado abierto, `visualViewport.height` se achica mientras que
// `window.innerHeight` (viewport de layout) no cambia en iOS Safari ni en Chrome
// Android moderno. La diferencia es la altura del teclado.
//   • Se exige un campo editable enfocado: evita falsos positivos por la barra de
//     direcciones del navegador al hacer scroll.
//   • Se ignora el zoom por pellizco (`scale ≠ 1`): también achica el viewport visual.
//   • Umbral 120 px: las barras de sugerencias de un teclado físico en iPad (~55 px)
//     no cuentan como "teclado abierto".
// Navegadores que redimensionan el layout con el teclado (`resizes-content`) no
// muestran diferencia: ahí la barra queda naturalmente por encima del teclado.
//
// useSyncExternalStore: valor correcto en el primer render y sin "tearing".

import { useSyncExternalStore } from 'react'

export const UMBRAL_TECLADO_PX = 120

/**
 * @param {{ alturaVentana: number, alturaVisual: number, offsetSuperior?: number, escala?: number }} v
 * @returns {number} altura estimada del teclado en px (0 si no hay o si hay zoom).
 */
export function calcularAlturaTeclado({ alturaVentana, alturaVisual, offsetSuperior = 0, escala = 1 }) {
  if (!Number.isFinite(alturaVentana) || !Number.isFinite(alturaVisual)) return 0
  if (Math.abs(escala - 1) > 0.01) return 0
  return Math.max(0, Math.round(alturaVentana - alturaVisual - offsetSuperior))
}

const TIPOS_SIN_TECLADO = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image'])

/** @param {Element|null} el */
export function esCampoEditable(el) {
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !TIPOS_SIN_TECLADO.has((el.getAttribute('type') || 'text').toLowerCase())
  return el.isContentEditable === true
}

function leer() {
  if (typeof window === 'undefined' || !window.visualViewport) return false
  const vv = window.visualViewport
  const alto = calcularAlturaTeclado({
    alturaVentana: window.innerHeight,
    alturaVisual: vv.height,
    offsetSuperior: vv.offsetTop,
    escala: vv.scale,
  })
  return alto >= UMBRAL_TECLADO_PX && esCampoEditable(document.activeElement)
}

function subscribe(onChange) {
  if (typeof window === 'undefined') return () => {}
  const vv = window.visualViewport
  vv?.addEventListener('resize', onChange)
  vv?.addEventListener('scroll', onChange)
  document.addEventListener('focusin', onChange)
  document.addEventListener('focusout', onChange)
  return () => {
    vv?.removeEventListener('resize', onChange)
    vv?.removeEventListener('scroll', onChange)
    document.removeEventListener('focusin', onChange)
    document.removeEventListener('focusout', onChange)
  }
}

/** @returns {boolean} `true` mientras el teclado virtual está abierto sobre un campo. */
export function useTecladoVirtual() {
  return useSyncExternalStore(subscribe, leer, () => false)
}

export default useTecladoVirtual
