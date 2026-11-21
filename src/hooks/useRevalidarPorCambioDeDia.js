// src/hooks/useRevalidarPorCambioDeDia.js
// La vigencia de una promoción se evalúa por FECHA. Si el Inventario queda abierto de un día para el
// otro (o la PC se suspende y se retoma al día siguiente), lo cargado deja de ser cierto a medianoche:
// una promo que venció seguiría con su etiqueta, y una que arranca hoy no aparecería.
//
// Este hook compara la fecha de negocio (America/Argentina/Buenos_Aires, ver lib/fechas) con la fecha en
// que se cargaron los datos y llama a `revalidar` cuando difieren. Se comprueba:
//   · al volver a la pestaña / recuperar el foco (el caso típico: se retoma el trabajo a la mañana);
//   · cada `intervaloMs` mientras la pestaña está visible (cubre dejarla abierta a la vista durante la medianoche).
// Con la pestaña oculta no se hace nada: no se gasta red ni batería.

import { useEffect, useRef } from 'react'
import { hoyISO } from '../lib/fechas'

const UN_MINUTO_MS = 60_000

/**
 * @param {string | null} fechaCargada  Fecha ISO (AAAA-MM-DD) con la que se cargaron los datos; null = aún no hay datos.
 * @param {() => void} revalidar        Recarga los datos (debe NO resetear la página: usePaginatedList.reload).
 * @param {object} [opciones]
 * @param {number} [opciones.intervaloMs]
 * @param {() => string} [opciones.hoy]  Inyectable para tests.
 */
export function useRevalidarPorCambioDeDia(fechaCargada, revalidar, { intervaloMs = UN_MINUTO_MS, hoy = hoyISO } = {}) {
  // Ref: `revalidar` puede cambiar de identidad en cada render sin reiniciar el temporizador.
  const revalidarRef = useRef(revalidar)
  revalidarRef.current = revalidar

  useEffect(() => {
    if (!fechaCargada) return undefined

    const verificar = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (hoy() !== fechaCargada) revalidarRef.current()
    }

    const temporizador = window.setInterval(verificar, intervaloMs)
    document.addEventListener('visibilitychange', verificar)
    window.addEventListener('focus', verificar)
    return () => {
      window.clearInterval(temporizador)
      document.removeEventListener('visibilitychange', verificar)
      window.removeEventListener('focus', verificar)
    }
  }, [fechaCargada, intervaloMs, hoy])
}

export default useRevalidarPorCambioDeDia
