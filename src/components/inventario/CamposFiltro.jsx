// src/components/inventario/CamposFiltro.jsx
// Controles de filtro del Inventario con ETIQUETA VISIBLE (WCAG 1.3.1 / 3.3.2: un placeholder no
// reemplaza a un rótulo, desaparece al escribir). Misma altura que el resto de los filtros del sistema
// (ALTO_CONTROL: 44 px táctil, 42 px en escritorio) y 16 px de fuente en mobile para que iOS no haga zoom.

import { useId, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { ALTO_CONTROL, CLASE_ETIQUETA } from '../ui/controles'

const CAJA = `w-full ${ALTO_CONTROL} bg-surface-700 border border-surface-600 rounded-xl text-white text-base
              min-[1025px]:text-sm font-body placeholder:text-surface-500 focus:outline-none
              focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-all`

/**
 * Buscador de texto con rótulo, ícono y botón de borrado (área táctil 44 px).
 *
 * @param {object} props
 * @param {string} props.etiqueta     Rótulo visible, p. ej. "Buscar por nombre".
 * @param {string} props.value
 * @param {(valor: string) => void} props.onChange  Recibe el texto ya saneado por `normalizar`.
 * @param {(crudo: string) => string} [props.normalizar]  Sanea lo tipeado/pegado (p. ej. solo dígitos).
 * @param {string} [props.placeholder]
 * @param {React.ElementType} [props.icono]
 * @param {string} [props.inputMode]
 * @param {number} [props.maxLength]
 * @param {boolean} [props.mono]
 * @param {string} [props.ayuda]      Texto corto visible bajo el campo (también asociado por aria-describedby).
 * @param {string} [props.className]
 */
export function CampoBusqueda({
  etiqueta, value, onChange, normalizar = (s) => s, placeholder, icono: Icono = Search,
  inputMode = 'search', maxLength, mono = false, ayuda, className = '',
}) {
  const id = useId()
  const ayudaId = `${id}-ayuda`
  const inputRef = useRef(null)

  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className={`${CLASE_ETIQUETA} mb-1`}>{etiqueta}</label>
      <div className="relative">
        <Icono size={15} aria-hidden="true"
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
        <input
          ref={inputRef} id={id} type="text" inputMode={inputMode} enterKeyHint="search"
          autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={maxLength}
          value={value} onChange={(e) => onChange(normalizar(e.target.value))}
          placeholder={placeholder} aria-describedby={ayuda ? ayudaId : undefined}
          className={`${CAJA} pl-9 ${value ? 'pr-12' : 'pr-3'} ${mono ? 'font-mono' : ''}`}
        />
        {value && (
          <button type="button" aria-label={`Borrar ${etiqueta.toLowerCase()}`}
            onClick={() => { onChange(''); inputRef.current?.focus() }}
            className="absolute right-0 top-0 h-full w-11 grid place-items-center rounded-xl text-surface-400
                       hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {ayuda && <p id={ayudaId} className="mt-1 text-xs text-surface-500 font-body">{ayuda}</p>}
    </div>
  )
}

/**
 * Desplegable con rótulo. Cada opción muestra cuántos productos dejaría (cuando se conoce).
 *
 * @param {object} props
 * @param {string} props.etiqueta
 * @param {string} props.value
 * @param {(valor: string) => void} props.onChange
 * @param {Array<{ value: string, label: string, cantidad: number | null }>} props.opciones
 * @param {string} [props.className]
 */
export function CampoSelect({ etiqueta, value, onChange, opciones, className = '' }) {
  const id = useId()
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className={`${CLASE_ETIQUETA} mb-1`}>{etiqueta}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}
        className={`${CAJA} px-3 cursor-pointer`}>
        {opciones.map((o) => (
          <option key={o.value} value={o.value} className="font-body">
            {o.cantidad == null ? o.label : `${o.label} (${o.cantidad})`}
          </option>
        ))}
      </select>
    </div>
  )
}
