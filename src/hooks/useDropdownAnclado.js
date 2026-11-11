// src/hooks/useDropdownAnclado.js
// Estilo de posición de un desplegable que se renderiza en un portal (document.body)
// anclado a un campo. Dos modos, elegidos por `compacto`:
//
//   • ESCRITORIO (compacto = false): el cálculo histórico, sin cambios — `position: absolute`
//     en coordenadas de documento, ancho = max(ancho del campo, anchoMinimo).
//   • COMPACTO (mobile/tablet): `position: fixed` + `calcularPosicionDropdown` (recorte al
//     ancho de pantalla, apertura hacia arriba si no hay lugar, altura limitada al área
//     visible descontando el teclado virtual).
//
// Se recalcula al hacer scroll, redimensionar y cuando cambia el viewport visual (apertura
// del teclado). Devuelve `null` mientras está cerrado o antes de la primera medición, para
// no dibujar un cuadro en (0, 0).

import { useLayoutEffect, useState } from 'react'
import { aEstiloFijo, calcularPosicionDropdown } from '../lib/posicionDropdown'

const iguales = (a, b) => {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

/**
 * @param {object} p
 * @param {boolean} p.abierto
 * @param {{ current: HTMLElement | null }} p.anclaRef
 * @param {boolean} p.compacto
 * @param {number} [p.anchoMinimo]
 * @param {number} [p.alturaMaxima]
 * @returns {import('react').CSSProperties | null}
 */
export function useDropdownAnclado({ abierto, anclaRef, compacto, anchoMinimo = 300, alturaMaxima = 260 }) {
  const [estilo, setEstilo] = useState(null)

  useLayoutEffect(() => {
    if (!abierto) { setEstilo(null); return undefined }

    let raf = 0
    const vv = window.visualViewport

    const medir = () => {
      raf = 0
      const el = anclaRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const siguiente = compacto
        ? aEstiloFijo(calcularPosicionDropdown({
            ancla: rect,
            area: {
              ancho: document.documentElement.clientWidth,
              arriba: vv ? vv.offsetTop : 0,
              abajo: vv ? vv.offsetTop + vv.height : window.innerHeight,
            },
            alturaLayout: window.innerHeight,
            anchoMinimo,
            alturaMaxima,
          }))
        : {
            position: 'absolute',
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
            width: Math.max(rect.width, anchoMinimo),
            zIndex: 9999,
          }
      setEstilo((previo) => (iguales(previo, siguiente) ? previo : siguiente))
    }
    const pedir = () => { if (!raf) raf = requestAnimationFrame(medir) }

    medir()
    window.addEventListener('scroll', pedir, true)
    window.addEventListener('resize', pedir)
    vv?.addEventListener('resize', pedir)
    vv?.addEventListener('scroll', pedir)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', pedir, true)
      window.removeEventListener('resize', pedir)
      vv?.removeEventListener('resize', pedir)
      vv?.removeEventListener('scroll', pedir)
    }
  }, [abierto, compacto, anclaRef, anchoMinimo, alturaMaxima])

  return abierto ? estilo : null
}

export default useDropdownAnclado
