// src/lib/menuNavegacion.js
// Lógica PURA de navegación por teclado de un menú (patrón WAI-ARIA "Menu Button").
// Sin DOM: se puede testear sin navegador.

/**
 * Devuelve el índice del ítem que debe recibir el foco.
 * @param {number} actual  Índice enfocado ahora (-1 si el foco no está en un ítem).
 * @param {number} total   Cantidad de ítems del menú.
 * @param {string} tecla   `KeyboardEvent.key`.
 * @returns {number}       Nuevo índice, o -1 si el menú está vacío.
 */
export function indiceSiguiente(actual, total, tecla) {
  if (total <= 0) return -1
  switch (tecla) {
    case 'ArrowDown': return actual < 0 ? 0 : (actual + 1) % total
    case 'ArrowUp':   return actual <= 0 ? total - 1 : actual - 1
    case 'Home':      return 0
    case 'End':       return total - 1
    default:          return actual
  }
}

/** Teclas que mueven el foco dentro del menú. */
export const TECLAS_NAVEGACION = ['ArrowDown', 'ArrowUp', 'Home', 'End']
