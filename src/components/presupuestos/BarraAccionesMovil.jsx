// src/components/presupuestos/BarraAccionesMovil.jsx
// Barra de acciones fija al pie del Presupuestador en mobile y tablet (≤ 1024 px).
// Presentacional: no conoce el cálculo ni los servicios, sólo recibe lo que debe mostrar.
//
// POR QUÉ UNA BARRA FIJA
// ──────────────────────
// • El botón de guardar vivía al final de una página que en celular mide varias pantallas:
//   había que scrollear hasta el final para guardar. Ahora el total y la acción principal
//   están siempre a la vista.
// • El MENSAJE DE ERROR se muestra acá, pegado al botón que lo provocó. Antes aparecía dentro
//   de la tarjeta de totales, normalmente fuera de pantalla en el momento de tocar "Guardar".
//
// TECLADO VIRTUAL
// ───────────────
// Mientras se edita un campo (`oculta`), la barra se oculta con `invisible` + `inert`: una
// barra pegada al borde inferior queda detrás del teclado (o flotando encima del campo que
// se escribe). Al cerrar el teclado (tecla "Listo"/Enter) reaparece. `invisible` (y no
// `translate`) para no agrandar el área scrolleable de la página.
//
// ACCESIBILIDAD: región con nombre; error en `role="alert"` (región siempre montada para que
// los lectores de pantalla anuncien el cambio); objetivos táctiles ≥ 44 px; respeta el
// área segura inferior (barra de gestos de iOS) y `prefers-reduced-motion`.

import { useEffect, useRef } from 'react'
import { AlertCircle, WifiOff, X } from 'lucide-react'
import { Button } from '../ui'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n ?? 0)

/**
 * @param {object}  props
 * @param {number}  props.total
 * @param {string}  props.textoAccion      Ej.: "Guardar Presupuesto".
 * @param {boolean} props.ocupado          Guardado en curso.
 * @param {() => (void|Promise<void>)} props.onAccion
 * @param {string}  [props.error]
 * @param {() => void} [props.onCerrarError]
 * @param {boolean} [props.sinConexion]
 * @param {boolean} [props.oculta]         `true` mientras el teclado virtual está abierto.
 */
export default function BarraAccionesMovil({
  total,
  textoAccion,
  ocupado,
  onAccion,
  error = '',
  onCerrarError,
  sinConexion = false,
  oculta = false,
}) {
  const barraRef = useRef(null)

  // La barra tapa la franja inferior de la pantalla: se reserva esa altura como `scroll-padding`
  // del documento para que el scroll automático (foco por teclado, scrollIntoView) NUNCA deje un
  // campo detrás de ella (WCAG 2.4.11 "Foco no oculto"). Se actualiza si la barra cambia de alto
  // (aparece un error) y se restaura al desmontar.
  useEffect(() => {
    const el = barraRef.current
    if (!el) return undefined
    const raiz = document.documentElement
    const previo = raiz.style.scrollPaddingBottom
    const aplicar = () => { raiz.style.scrollPaddingBottom = `${Math.ceil(el.getBoundingClientRect().height) + 8}px` }
    aplicar()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(aplicar) : null
    ro?.observe(el)
    return () => { ro?.disconnect(); raiz.style.scrollPaddingBottom = previo }
  }, [])

  return (
    <div
      ref={barraRef}
      role="region"
      aria-label="Acciones del presupuesto"
      inert={oculta ? '' : undefined}
      className={`sticky bottom-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-3
                  pb-[max(0.75rem,env(safe-area-inset-bottom))]
                  bg-surface-800/95 backdrop-blur border-t border-surface-700
                  shadow-[0_-8px_24px_rgba(0,0,0,0.35)]
                  transition-opacity duration-150 motion-reduce:transition-none
                  ${oculta ? 'invisible opacity-0' : 'opacity-100'}`}
    >
      {/* Región viva SIEMPRE montada: el anuncio funciona al aparecer el contenido. */}
      <div role="alert" aria-atomic="true">
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10
                          pl-3 pr-1 py-2 text-red-300 text-sm font-body max-h-[30dvh] overflow-y-auto overscroll-contain">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 break-words">{error}</p>
            {onCerrarError && (
              <button
                type="button"
                onClick={onCerrarError}
                aria-label="Cerrar mensaje de error"
                className="-my-1 flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-lg
                           text-red-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {sinConexion && (
        <p role="status" className="mb-3 flex items-start gap-2 rounded-xl border border-yellow-500/30 bg-yellow-900/20
                                    px-3 py-2 text-yellow-300 text-sm font-body">
          <WifiOff size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">Sin conexión: no vas a poder guardar hasta que vuelva.</span>
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 sm:flex-nowrap sm:justify-start">
          <span className="text-surface-400 text-sm font-body">Total a pagar</span>
          <span className="ml-auto whitespace-nowrap text-right font-mono font-bold text-brand-400 text-lg">
            {fmt(total)}
          </span>
        </div>
        <Button
          size="lg"
          onClick={onAccion}
          disabled={ocupado}
          className="w-full min-h-[48px] justify-center sm:w-auto sm:flex-shrink-0"
        >
          {ocupado ? 'Guardando…' : textoAccion}
        </Button>
      </div>
    </div>
  )
}
