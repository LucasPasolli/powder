// src/hooks/usePosicionMenu.js
// Coloca un panel `position: fixed` (renderizado en un portal) anclado a un botón, usando
// el cálculo puro de lib/posicionMenu.js.
//
// DECISIÓN: se escribe `top/left/maxHeight` directo en el nodo (sin setState).
//   · Se mide y se coloca en useLayoutEffect, ANTES del primer pintado → sin parpadeo.
//   · No hay un estado intermedio "oculto": un elemento con `visibility:hidden` no puede
//     recibir foco y el menú enfoca su primera opción al abrirse.
//   · Reposicionar en cada scroll/resize no re-renderiza React.
//
// Se recalcula al hacer scroll (cualquier contenedor), redimensionar la ventana y cuando
// cambia el tamaño del propio panel. El scroll INTERNO del panel se ignora para no
// resetear su posición.

import { useLayoutEffect } from 'react'
import { calcularPosicionMenu } from '../lib/posicionMenu'

/**
 * @param {object} p
 * @param {boolean} p.activo
 * @param {{ current: HTMLElement | null }} p.anclaRef  Botón que origina el menú.
 * @param {{ current: HTMLElement | null }} p.panelRef  Panel `position: fixed`.
 */
export function usePosicionMenu({ activo, anclaRef, panelRef }) {
  useLayoutEffect(() => {
    if (!activo) return undefined

    let raf = 0

    const colocar = () => {
      raf = 0
      const ancla = anclaRef.current
      const panel = panelRef.current
      if (!ancla || !panel) return

      // Medir el tamaño NATURAL: se retira el tope un instante y se conserva el scroll
      // interno (al desaparecer el desborde el navegador lo llevaría a 0).
      const scrollInterno = panel.scrollTop
      panel.style.maxHeight = 'none'
      const contenido = { ancho: panel.offsetWidth, alto: panel.offsetHeight }
      const rect = ancla.getBoundingClientRect()

      const pos = calcularPosicionMenu({
        ancla: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        area: { ancho: document.documentElement.clientWidth, alto: window.innerHeight },
        contenido,
      })

      panel.style.top = `${pos.top}px`
      panel.style.left = `${pos.left}px`
      panel.style.maxHeight = `${pos.maxHeight}px`
      panel.style.transformOrigin = pos.lado === 'abajo' ? 'top right' : 'bottom right'
      panel.dataset.lado = pos.lado
      panel.scrollTop = scrollInterno
    }

    const pedir = (e) => {
      // El scroll interno del menú no debe reposicionarlo.
      if (e?.type === 'scroll' && panelRef.current?.contains(e.target)) return
      if (!raf) raf = requestAnimationFrame(colocar)
    }

    colocar()
    window.addEventListener('scroll', pedir, true)
    window.addEventListener('resize', pedir)
    const vv = window.visualViewport
    vv?.addEventListener('resize', pedir)

    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => pedir()) : null
    if (ro && panelRef.current) ro.observe(panelRef.current)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', pedir, true)
      window.removeEventListener('resize', pedir)
      vv?.removeEventListener('resize', pedir)
      ro?.disconnect()
    }
  }, [activo, anclaRef, panelRef])
}

export default usePosicionMenu
