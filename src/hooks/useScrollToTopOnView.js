// src/hooks/useScrollToTopOnView.js
//
// Reposiciona la pantalla en el inicio cuando CAMBIA LA VISTA ACTIVA, sólo en
// mobile y tablet (≤ 1024 px, useBreakpoint → isCompact).
//
// Para qué sirve
// ──────────────
// Varias pantallas (Historial, Saldos, Pedidos de Compra) alternan entre
// lista → detalle → edición/alta con ESTADO LOCAL, sin cambiar la URL. El
// gestor por ruta (useScrollToTopOnNavigate) no se entera de esos cambios, así
// que el detalle aparecía en la posición de scroll de la lista (o clamp al final
// de la página). Cada pantalla informa su vista actual con una clave y este
// hook se encarga del resto.
//
// Uso
// ───
//   // Llamarlo ANTES de cualquier `return` condicional (reglas de los hooks).
//   useScrollToTopOnView(editando ? `editar:${editando}` : selected ? `detalle:${selected.id}` : 'lista')
//
// La clave debe identificar la VISTA, no datos que cambian dentro de ella:
// filtros, páginas, búsquedas o resultados NO deben formar parte de la clave,
// de lo contrario cada tecla movería el scroll. Incluir el id en las vistas de
// detalle es correcto: pasar del detalle A al detalle B es otra pantalla.
//
// Decisiones de diseño
// ────────────────────
// • Compara contra la clave previa guardada en un ref (no una bandera
//   "primer render"): inmune al doble montaje de StrictMode y no hace scroll
//   al montar.
// • useLayoutEffect: el reset ocurre antes del pintado, sin frame intermedio.
// • Refuerzo en el frame siguiente: si al montar el detalle el navegador
//   ajustó el scroll por el cambio brusco de altura, se corrige. Es no-op si
//   ya está arriba.
// • Desktop: no hace nada (comportamiento actual intacto).

import { useLayoutEffect, useRef } from 'react'
import { useBreakpoint } from './useBreakpoint'
import { scrollToTop } from '../lib/scrollNavigation'

/**
 * @param {string|number|null|undefined} viewKey Identificador estable de la vista activa.
 */
export function useScrollToTopOnView(viewKey) {
  const { isCompact } = useBreakpoint()
  const previousKey = useRef(viewKey)

  useLayoutEffect(() => {
    const changed = previousKey.current !== viewKey
    previousKey.current = viewKey
    if (!changed || !isCompact) return undefined

    scrollToTop()

    if (typeof requestAnimationFrame !== 'function') return undefined
    const frame = requestAnimationFrame(() => { scrollToTop() })
    return () => cancelAnimationFrame(frame)
  }, [viewKey, isCompact])
}

export default useScrollToTopOnView
