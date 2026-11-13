// src/lib/scrollNavigation.js
// Utilidades DOM puras (sin React) para reposicionar la vista al navegar.
//
// Por qué existen como módulo aparte
// ──────────────────────────────────
//  • Se pueden testear sin montar componentes.
//  • Concentran los DOS detalles de plataforma que hacen fallar a un
//    `window.scrollTo(0, 0)` ingenuo en este proyecto:
//
//    1. `html { scroll-behavior: smooth }` (index.css). Un scrollTo común se
//       ANIMARÍA, y el usuario vería la pantalla nueva "deslizándose" desde la
//       posición vieja: justo el salto visual que se quiere evitar. Se
//       neutraliza con un override inline y temporal (sólo durante la llamada),
//       sin tocar el CSS global → desktop queda exactamente igual.
//
//    2. `history.scrollRestoration = 'auto'` (default del navegador). Con
//       "Atrás" el navegador devuelve el scroll de la entrada anterior por su
//       cuenta. Hay que pasarlo a 'manual' mientras se está en mobile/tablet.

import { logger } from './logger'

/**
 * Lleva la ventana a (0, 0) de forma INSTANTÁNEA (ignora `scroll-behavior: smooth`).
 *
 * Es un no-op cuando ya está en el inicio: evita trabajo inútil y, sobre todo,
 * no interrumpe el "rebote" elástico de iOS ni provoca saltos adicionales.
 *
 * @returns {boolean} `true` si efectivamente se movió el scroll.
 */
export function scrollToTop() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false

  const y = window.scrollY ?? window.pageYOffset ?? 0
  const x = window.scrollX ?? window.pageXOffset ?? 0
  if (y <= 0 && x <= 0) return false

  const raiz = document.documentElement
  const previo = raiz.style.scrollBehavior
  try {
    // El comportamiento ("auto" vs "smooth") se resuelve en el momento de la
    // llamada, por eso alcanza con restaurar el valor en el `finally`.
    raiz.style.scrollBehavior = 'auto'
    window.scrollTo(0, 0)
    return true
  } catch (error) {
    // Un fallo de scroll jamás debe romper la navegación: se registra y se sigue.
    logger.warn('scroll.reset_failed', { error })
    return false
  } finally {
    raiz.style.scrollBehavior = previo
  }
}

/**
 * Desactiva la restauración automática de scroll del navegador y devuelve la
 * función que deja el valor original tal como estaba.
 *
 * Sin soporte (`scrollRestoration` ausente) o con el valor ya en 'manual'
 * (alguien más lo gestiona) devuelve un cleanup vacío: no se pisa lo ajeno.
 *
 * @returns {() => void} restaurar
 */
export function disableAutoScrollRestoration() {
  const noop = () => {}
  if (typeof window === 'undefined' || !window.history || !('scrollRestoration' in window.history)) {
    return noop
  }

  try {
    const original = window.history.scrollRestoration
    if (original === 'manual') return noop
    window.history.scrollRestoration = 'manual'
    return () => {
      try { window.history.scrollRestoration = original } catch { /* contexto restringido */ }
    }
  } catch (error) {
    // Algunos contextos (iframes sandbox) lanzan SecurityError al escribirla.
    logger.warn('scroll.restoration_unavailable', { error })
    return noop
  }
}
