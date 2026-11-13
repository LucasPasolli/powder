// src/hooks/useScrollToTopOnNavigate.js
//
// Reposiciona la pantalla en el inicio cada vez que CAMBIA LA RUTA, sólo en
// mobile y tablet (≤ 1024 px, definición única de useBreakpoint → isCompact).
//
// Cobertura de los escenarios de aceptación
// ─────────────────────────────────────────
//  1 · Sidebar → otra ruta ............ cambia `pathname`            → reset
//  2 · Otro módulo de la misma ruta ... las pestañas de /admin/:slug/:tab viven
//                                       en la URL → cambia `pathname` → reset
//  3 · Drawer abierto (mobile) ........ reset en layout-effect (antes del pintado)
//                                       + una pasada de refuerzo en el frame
//                                       siguiente, por si al soltar el
//                                       scroll-lock del drawer quedó un residuo
//  4 · Rail compacto (tablet) ......... igual que 1
//  5 · "Atrás" ........................ el navegador deja de restaurar el scroll
//                                       (scrollRestoration = 'manual') y el
//                                       cambio de pathname dispara el reset
//  6 · Ya está en el inicio ........... scrollToTop() es no-op → sin saltos
//  7 · Desktop ........................ el hook no hace NADA (ni scroll ni
//                                       toca scrollRestoration)
//
// Decisiones de diseño
// ────────────────────
// • Disparador = `pathname`, NO `location.key` ni `location.state`.
//   Historial.jsx hace `navigate(pathname, { replace: true, state: {} })` para
//   limpiar el state: eso cambia `location.key` pero no es navegar a otra
//   pantalla y no debe mover el scroll. Tampoco se reacciona a `search`/`hash`
//   (filtros y anclas no son cambios de pantalla).
// • La comparación contra el valor previo, el layout-effect y el refuerzo viven
//   en useScrollToTopOnView (inmune al doble montaje de StrictMode).
// • Las pantallas que alternan lista/detalle/edición por ESTADO LOCAL (sin
//   cambiar la URL) usan ese mismo hook con su propia clave de vista.
// • Un único gestor global (se monta una vez en App) en vez de tocar cada
//   página: cumple DRY/KISS y cubre rutas futuras sin trabajo extra.

import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useBreakpoint } from './useBreakpoint'
import { useScrollToTopOnView } from './useScrollToTopOnView'
import { disableAutoScrollRestoration } from '../lib/scrollNavigation'

export function useScrollToTopOnNavigate() {
  const { pathname } = useLocation()
  const { isCompact } = useBreakpoint()

  // Escenario 5: mientras la UI es táctil, "Atrás" no debe recuperar el scroll.
  // En desktop no se toca: se conserva el comportamiento actual (Escenario 7).
  useLayoutEffect(() => {
    if (!isCompact) return undefined
    return disableAutoScrollRestoration()
  }, [isCompact])

  // Escenarios 1–6: la ruta ES la vista. La lógica de reseteo (comparación con la
  // clave previa, sólo compacto, refuerzo en el frame siguiente, no-op si ya está
  // arriba) vive en un único lugar: useScrollToTopOnView.
  useScrollToTopOnView(pathname)
}

export default useScrollToTopOnNavigate
