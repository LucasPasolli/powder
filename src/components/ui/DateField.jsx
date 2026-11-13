// src/components/ui/DateField.jsx
// Campo de fecha compartido para filtros (Desde / Hasta) y formularios.
//
// PROBLEMA QUE RESUELVE
//  Un <input type="date"> crudo se renderiza distinto en cada navegador: en
//  Safari iOS vacío no muestra nada (sin rótulo ni ícono), tiene ancho y alto
//  intrínsecos, y el formato depende del idioma del dispositivo.
//
// DECISIÓN CLAVE (patrón "capa visual + control nativo transparente")
//  · Capa visual propia: ícono + rótulo fijo + valor dd-mm-aaaa. Es lo único que
//    se ve, así que la apariencia es idéntica en Safari iOS y Chrome Android.
//  · Encima, un <input type="date"> nativo con opacity-0 que cubre TODO el campo:
//    el toque abre el selector nativo del SO (apto para uso táctil, nunca se
//    corta fuera de pantalla) y se conserva la semántica/teclado/lector de pantalla.
//  · Un solo árbol DOM para todos los anchos: rotar el equipo no remonta nada.
//
// Accesibilidad (WCAG 2.1 AA): <label htmlFor> visible (no solo placeholder),
// foco visible vía :focus-within, área táctil ≥ 44 px, texto ≥ 14 px (16 px en
// mobile para evitar el zoom automático de iOS), botón "Borrar" de 44×44 px.

import { useId, useRef } from 'react'
import { Calendar, X } from 'lucide-react'
import { ALTO_CONTROL, CLASE_ETIQUETA } from './controles'

/** Separador del formato visible (dd-mm-aaaa). Un único lugar para cambiarlo. */
export const SEPARADOR_FECHA = '-'
export const PLACEHOLDER_FECHA = `dd${SEPARADOR_FECHA}mm${SEPARADOR_FECHA}aaaa`

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * AAAA-MM-DD → dd-mm-aaaa. Reordena el texto SIN pasar por `new Date()` para que
 * la zona horaria no corra la fecha un día. Devuelve '' si el valor no es válido.
 * @param {string|null|undefined} iso
 * @param {string} [sep]
 */
export function formatearFechaCorta(iso, sep = SEPARADOR_FECHA) {
  const m = ISO.exec(String(iso ?? ''))
  return m ? `${m[3]}${sep}${m[2]}${sep}${m[1]}` : ''
}

/** Solo con puntero preciso (mouse): ahí Chrome/Firefox escritorio solo abren el
 *  selector desde el ícono nativo, así que lo abrimos a mano al tocar cualquier parte.
 *  En táctil el toque directo sobre el input nativo ya lo abre (no se duplica). */
function abrirSelectorSiHayMouse(input) {
  try {
    if (!input || typeof input.showPicker !== 'function') return
    if (!window.matchMedia?.('(pointer: fine)').matches) return
    input.showPicker()
  } catch {
    /* showPicker puede lanzar (iframe cross-origin, sin gesto): el input nativo sigue operativo. */
  }
}

/**
 * @param {object}   props
 * @param {string}   props.label                 Rótulo visible y fijo ("Desde", "Hasta"…).
 * @param {string}   props.value                 ISO AAAA-MM-DD o '' (sin valor).
 * @param {(iso:string)=>void} props.onChange    Recibe el ISO (o '' al borrar). NO el evento.
 * @param {boolean}  [props.clearable=true]      Muestra "Borrar" cuando hay valor.
 * @param {boolean}  [props.disabled]
 * @param {boolean}  [props.etiquetaArriba=false] Rótulo en MAYÚSCULAS sobre el campo (igual que
 *                                               <Input>/<Select>); el campo muestra solo ícono + valor.
 *                                               Lo usa el panel de filtros móvil. Por defecto, sin cambios.
 * @param {string}   [props.className]           Clases del contenedor (ancho, márgenes).
 * Resto de props (`min`, `max`, `required`, `name`, `id`, `aria-describedby`…) van al <input>.
 */
export default function DateField({
  label, value, onChange, clearable = true, disabled = false, id, className = '', etiquetaArriba = false, ...rest
}) {
  const autoId = useId()
  const inputId = id ?? autoId
  const inputRef = useRef(null)

  const texto = formatearFechaCorta(value)
  const tieneValor = texto !== ''
  const puedeBorrar = clearable && tieneValor && !disabled

  const borrar = () => {
    onChange?.('')
    // El botón desaparece al borrar: devolvemos el foco al campo para no dejarlo en <body>.
    inputRef.current?.focus({ preventScroll: true })
  }

  return (
    <div className={etiquetaArriba ? `space-y-1 ${className}` : className}>
      {etiquetaArriba && (
        <label htmlFor={inputId} className={CLASE_ETIQUETA}>{label}</label>
      )}
      <div
        className={`flex items-center w-full min-w-0 max-w-full ${ALTO_CONTROL} ${etiquetaArriba ? '' : 'sm:min-w-[12rem]'}
                    bg-surface-700 border border-surface-600 rounded-xl transition-colors
                    focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500/30
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {/* Zona táctil principal: capa visual + input nativo transparente encima. */}
        <div className={`relative flex flex-1 min-w-0 items-center gap-2 h-full px-3`}>
          <Calendar size={16} aria-hidden="true" className="shrink-0 text-surface-300" />
          {!etiquetaArriba && (
            <label htmlFor={inputId} className="shrink-0 font-body text-base sm:text-sm text-surface-300">
              {label}
            </label>
          )}
          <span
            aria-hidden="true"
            className={`ml-auto truncate font-body tabular-nums text-base sm:text-sm
                        ${tieneValor ? 'text-white' : 'text-surface-400'}`}
          >
            {tieneValor ? texto : PLACEHOLDER_FECHA}
          </span>

          <input
            {...rest}
            ref={inputRef}
            id={inputId}
            type="date"
            value={value || ''}
            disabled={disabled}
            onChange={(e) => onChange?.(e.target.value)}
            onClick={(e) => { rest.onClick?.(e); abrirSelectorSiHayMouse(e.currentTarget) }}
            onKeyDown={(e) => {
              rest.onKeyDown?.(e)
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                abrirSelectorSiHayMouse(e.currentTarget)
              }
            }}
            // 16 px: iOS hace zoom automático al enfocar inputs con menos de 16 px.
            className="absolute inset-0 h-full w-full appearance-none opacity-0 text-base
                       cursor-pointer disabled:cursor-not-allowed [color-scheme:dark]"
          />
        </div>

        {puedeBorrar && (
          <button
            type="button"
            onClick={borrar}
            aria-label={`Borrar fecha ${label.toLowerCase()}`}
            className="flex items-center justify-center h-full min-w-[44px] min-[1025px]:min-w-[36px]
                       rounded-r-xl text-surface-300 hover:text-white
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
