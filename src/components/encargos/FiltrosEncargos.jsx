// src/components/encargos/FiltrosEncargos.jsx
// Búsqueda + filtro por estado del listado de Encargos. Misma anatomía y comportamiento que
// FiltrosPedidos (Pedidos), Historial, Saldos e Inventario:
//   • Escritorio (compact=false): <Card> con barra inline, aplicación inmediata y botón «Limpiar».
//   • Mobile/tablet (compact=true): patrón único <FiltrosMovil> — buscador siempre visible + botón
//     «Filtros» y panel a pantalla completa con BORRADOR («Aplicar» / «Limpiar» / ✕ descarta).
//
// Componente CONTROLADO: el valor aplicado vive en la vista, así que rotar el equipo (cambia
// `compact`) no pierde los filtros. Sin cambios funcionales: mismos campos que antes
// (texto en memoria, máx. 60 caracteres, y estado enviado al servidor).

import { useId } from 'react'
import { Search } from 'lucide-react'
import { Card } from '../ui'
import { ALTO_CONTROL } from '../ui/controles'
import FiltrosMovil, { BuscadorListado } from '../ui/FiltrosMovil'
import { ESTADOS_ENCARGO, ETIQUETA_ESTADO_ENCARGO } from '../../lib/encargos'

export const MAX_CARACTERES_BUSQUEDA = 60
const PLACEHOLDER = 'Buscar por cliente, producto o número...'
const ETIQUETA_BUSCADOR = 'Buscar encargos por cliente, producto o número'

export const FILTROS_ENCARGOS_INICIALES = Object.freeze({ texto: '', estado: 'all' })

const OPCIONES_ESTADO = [
  { value: 'all', label: 'Todos' },
  ...ESTADOS_ENCARGO.map((e) => ({ value: e, label: ETIQUETA_ESTADO_ENCARGO[e] })),
]

const CAMPOS_MOVIL = [{ tipo: 'select', clave: 'estado', etiqueta: 'Estado', opciones: OPCIONES_ESTADO }]
const DEFAULTS_PANEL = Object.freeze({ estado: FILTROS_ENCARGOS_INICIALES.estado })

/** Cantidad de filtros del panel (sin contar el buscador) que no están en su valor por defecto. */
export function contarFiltrosEncargos(v) {
  return v.estado !== FILTROS_ENCARGOS_INICIALES.estado ? 1 : 0
}

/** Hay búsqueda o algún filtro distinto de su valor por defecto. */
export const hayFiltrosEncargos = (v) => contarFiltrosEncargos(v) > 0 || v.texto.trim() !== ''

const field =
  'w-full bg-surface-700 border border-surface-600 rounded-xl px-3 text-white font-body text-sm ' +
  `${ALTO_CONTROL} focus:outline-none focus:border-brand-500 transition-all cursor-pointer`

/**
 * @param {object}   props
 * @param {typeof FILTROS_ENCARGOS_INICIALES} props.value   Filtros aplicados.
 * @param {(next: typeof FILTROS_ENCARGOS_INICIALES) => void} props.onChange
 * @param {boolean}  props.compact   mobile o tablet.
 * @param {number}   [props.total]   Resultados del listado filtrado (se anuncia a lectores de pantalla).
 */
export default function FiltrosEncargos({ value, onChange, compact, total }) {
  const idBase = useId()
  const setTexto = (texto) => onChange({ ...value, texto })
  const anuncio = typeof total === 'number' ? (
    <p role="status" aria-live="polite" className="sr-only">
      {total} {total === 1 ? 'encargo' : 'encargos'}
    </p>
  ) : undefined

  // ── Mobile / tablet: patrón único de filtros ──────────────────────────────
  if (compact) {
    return (
      <FiltrosMovil
        busqueda={<BuscadorListado value={value.texto} onChange={setTexto}
          placeholder={PLACEHOLDER} etiqueta={ETIQUETA_BUSCADOR} maxLength={MAX_CARACTERES_BUSQUEDA} />}
        value={{ estado: value.estado }}
        defaults={DEFAULTS_PANEL}
        campos={CAMPOS_MOVIL}
        onApply={(borrador) => onChange({ ...value, ...borrador })}
        debajo={anuncio}
      />
    )
  }

  // ── Escritorio: barra inline, aplicación inmediata ────────────────────────
  const limpiarTodo = () => onChange({ ...FILTROS_ENCARGOS_INICIALES })
  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-3 items-end w-full">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} aria-hidden="true"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
          <label htmlFor={`${idBase}-q`} className="sr-only">{ETIQUETA_BUSCADOR}</label>
          <input id={`${idBase}-q`} type="search" value={value.texto} maxLength={MAX_CARACTERES_BUSQUEDA}
            autoComplete="off" onChange={(e) => setTexto(e.target.value)} placeholder={PLACEHOLDER}
            className={`w-full bg-surface-700 border border-surface-600 rounded-xl pl-9 pr-4 text-white font-body ${ALTO_CONTROL}
                        placeholder-surface-500 focus:outline-none focus:border-brand-500 transition-all text-sm`} />
        </div>
        <div>
          <label htmlFor={`${idBase}-estado`} className="sr-only">Estado</label>
          <select id={`${idBase}-estado`} value={value.estado} className={field}
            onChange={(e) => onChange({ ...value, estado: e.target.value })}>
            <option value="all">Estado</option>
            {OPCIONES_ESTADO.slice(1).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {hayFiltrosEncargos(value) && (
          <button type="button" onClick={limpiarTodo}
            className={`bg-surface-700 border border-surface-600 rounded-xl px-3 ${ALTO_CONTROL} text-surface-400 text-sm font-body
                       hover:text-white hover:border-surface-500 transition-all whitespace-nowrap`}>
            Limpiar
          </button>
        )}
      </div>
      {anuncio}
    </Card>
  )
}
