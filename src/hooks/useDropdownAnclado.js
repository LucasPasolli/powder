// src/hooks/useDropdownAnclado.js
// Estilo de posición de un desplegable que se renderiza en un portal (document.body)
// anclado a un campo. Siempre `position: absolute` en coordenadas de DOCUMENTO
// (rect + scroll), debajo del campo:
//
//   • ESCRITORIO (compacto = false): el cálculo histórico, sin cambios — ancho =
//     max(ancho del campo, anchoMinimo).
//   • COMPACTO (mobile/tablet): `calcularPosicionDropdown` (recorte al ancho de pantalla,
//     altura limitada al área visible descontando el teclado virtual). Si el teclado deja
//     poco espacio debajo del campo, se desplaza la página UNA vez al abrir para que la
//     lista tenga lugar (no se abre hacia arriba: ver nota en lib/posicionDropdown.js).
//
// Se recalcula al hacer scroll, redimensionar y cuando cambia el viewport visual (apertura
// del teclado). Devuelve `null` mientras está cerrado o antes de la primera medición, para
// no dibujar un cuadro en (0, 0).

import { useLayoutEffect, useState } from 'react'
import { calcularDesplazamientoParaDropdown, calcularPosicionDropdown } from '../lib/posicionDropdown'

const iguales = (a, b) => {
  if (a === b) return true
  if (!a || !b) return false
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

const areaVisible = () => {
  const vv = window.visualViewport
  return {
    ancho: document.documentElement.clientWidth,
    arriba: vv ? vv.offsetTop : 0,
    abajo: vv ? vv.offsetTop + vv.height : window.innerHeight,
  }
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
    let desplazado = false // el ajuste de scroll se hace una sola vez por apertura
    const vv = window.visualViewport

    const medir = () => {
      raf = 0
      const el = anclaRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()

      if (compacto && !desplazado) {
        desplazado = true
        const dy = calcularDesplazamientoParaDropdown({ ancla: rect, area: areaVisible() })
        if (dy > 0) {
          window.scrollBy(0, dy)
          // El scroll dispara el evento y se vuelve a medir con la posición ya corregida.
          pedir()
          return
        }
      }

      const siguiente = compacto
        ? (() => {
            const pos = calcularPosicionDropdown({ ancla: rect, area: areaVisible(), anchoMinimo, alturaMaxima })
            return {
              position: 'absolute',
              top: pos.top + window.scrollY,
              left: pos.left + window.scrollX,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 9999,
            }
          })()
        : {
            position: 'absolute',
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
            width: Math.max(rect.width, anchoMinimo),
            zIndex: 9999,
          }
      setEstilo((previo) => (iguales(previo, siguiente) ? previo : siguiente))
    }
    function pedir() { if (!raf) raf = requestAnimationFrame(medir) }

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
