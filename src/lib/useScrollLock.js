// src/lib/useScrollLock.js
// Utilidades para pantallas "estáticas" (sin scroll) dentro de un layout con sidebar.
//
//  • useScrollLock(active, ref): bloquea el scroll del viewport (sólo <html>) y de los
//    contenedores con scroll propio que envuelven a `ref`. Se toca únicamente <html> a
//    propósito: AppShell (drawer), ResponsiveDialog y FullScreenSheet bloquean <body>
//    guardando/restaurando su valor previo, y compartir ese nodo dejaría restauraciones
//    cruzadas (scroll bloqueado para siempre). Contador de referencias; restaura el valor
//    inline previo al desactivarse o desmontarse.
//  • useFillViewport(ref, active): ajusta el alto del elemento a "desde donde empieza hasta el
//    borde inferior del viewport, menos el padding inferior de su contenedor". El documento
//    mide exactamente el viewport: queda centrado en el área de contenido (sidebar y topbar
//    del AppShell visibles) y no hay desborde que scrollear.
import { useLayoutEffect } from 'react'

let bloqueos = 0
let previo = null

function bloquearPagina() {
  if (typeof document === 'undefined') return
  if (bloqueos++ > 0) return
  const html = document.documentElement
  previo = { overflow: html.style.overflow, overscroll: html.style.overscrollBehavior }
  html.style.overflow = 'hidden'
  html.style.overscrollBehavior = 'none'
}

function liberarPagina() {
  if (typeof document === 'undefined' || bloqueos === 0) return
  if (--bloqueos > 0 || !previo) return
  const html = document.documentElement
  html.style.overflow = previo.overflow
  html.style.overscrollBehavior = previo.overscroll
  previo = null
}

function ancestrosConScroll(el) {
  const out = []
  for (let n = el?.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') out.push(n)
  }
  return out
}

/**
 * @param {boolean} active
 * @param {import('react').RefObject<HTMLElement>} [ref] Elemento cuyos ancestros con scroll también se bloquean.
 */
export function useScrollLock(active, ref) {
  useLayoutEffect(() => {
    if (!active) return undefined
    window.scrollTo?.(0, 0)
    bloquearPagina()
    const contenedores = ancestrosConScroll(ref?.current).map((n) => {
      const antes = n.style.overflow
      n.scrollTop = 0
      n.style.overflow = 'hidden'
      return [n, antes]
    })
    return () => {
      contenedores.forEach(([n, antes]) => { n.style.overflow = antes })
      liberarPagina()
    }
  }, [active, ref])
}

/**
 * @param {import('react').RefObject<HTMLElement>} ref
 * @param {boolean} active
 */
export function useFillViewport(ref, active) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!active || !el) return undefined

    const ajustar = () => {
      const top = Math.max(0, el.getBoundingClientRect().top)
      const padAbajo = parseFloat(getComputedStyle(el.parentElement ?? el).paddingBottom) || 0
      el.style.height = `${Math.max(0, window.innerHeight - top - padAbajo)}px`
    }
    ajustar()
    window.addEventListener('resize', ajustar)
    window.visualViewport?.addEventListener('resize', ajustar)
    return () => {
      window.removeEventListener('resize', ajustar)
      window.visualViewport?.removeEventListener('resize', ajustar)
      el.style.height = ''
    }
  }, [ref, active])
}
