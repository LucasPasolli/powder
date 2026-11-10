// src/components/pedidos/FiltrosPedidos.jsx
// Búsqueda + filtros del listado de pedidos.
//   • Escritorio (compact=false): barra inline con aplicación inmediata (como antes).
//   • Mobile/tablet (compact=true): patrón ÚNICO del sistema (<FiltrosMovil>): buscador
//     siempre visible + botón «Filtros» y panel a pantalla completa con BORRADOR propio:
//     «Aplicar» confirma, «Limpiar» vacía el borrador, cerrar con ✕/Esc lo descarta.
//
// Componente CONTROLADO: el valor aplicado vive en el padre, por eso rotar el
// equipo (que cambia `compact`) nunca pierde los filtros. El borrador sólo
// existe mientras el panel está abierto.

import { useId } from 'react'
import { Search } from 'lucide-react'
import { Card } from '../ui'
import DateField from '../ui/DateField'
import { ALTO_CONTROL } from '../ui/controles'
import FiltrosMovil, { BuscadorListado, mensajeRangoInvalido } from '../ui/FiltrosMovil'

export const FILTROS_INICIALES = Object.freeze({
  filterProv: '', filterEst: 'all', filterLog: 'all', filterDesde: '', filterHasta: '',
})

const CAMPOS_PANEL = ['filterLog', 'filterEst', 'filterDesde', 'filterHasta']
const DEFAULTS_PANEL = Object.freeze(Object.fromEntries(CAMPOS_PANEL.map((k) => [k, FILTROS_INICIALES[k]])))

/** Campos del panel móvil (la etiqueta de la opción por defecto es siempre «Todos»). */
const CAMPOS_MOVIL = [
  { tipo: 'select', clave: 'filterLog', etiqueta: 'Estado logístico', opciones: [
    { value: 'all', label: 'Todos' }, { value: 'encargado', label: 'Encargado' }, { value: 'recibido', label: 'Recibido' },
  ] },
  { tipo: 'select', clave: 'filterEst', etiqueta: 'Estado de pago', opciones: [
    { value: 'all', label: 'Todos' }, { value: 'pendiente', label: 'Pago pendiente' }, { value: 'pagado', label: 'Pagado' },
  ] },
  { tipo: 'fecha', clave: 'filterDesde', etiqueta: 'Desde', max: (b) => b.filterHasta || undefined },
  { tipo: 'fecha', clave: 'filterHasta', etiqueta: 'Hasta', min: (b) => b.filterDesde || undefined },
]

const validarBorrador = (b) => mensajeRangoInvalido(b.filterDesde, b.filterHasta)

/** Cantidad de filtros del panel que no están en su valor por defecto. */
export function contarFiltrosActivos(v) {
  return CAMPOS_PANEL.filter((k) => v[k] !== FILTROS_INICIALES[k]).length
}

/** `true` si el rango de fechas es incoherente (desde > hasta). Fechas ISO comparan como texto. */
export function rangoInvalido(desde, hasta) {
  return Boolean(desde && hasta && desde > hasta)
}

const field =
  'w-full bg-surface-700 border border-surface-600 rounded-xl px-3 text-white font-body text-sm ' +
  `${ALTO_CONTROL} ` +
  'focus:outline-none focus:border-brand-500 transition-all [color-scheme:dark]'

/**
 * Campos de estado/fecha de ESCRITORIO: controles compactos en línea, con etiquetas
 * sólo para lectores de pantalla. (En mobile/tablet los resuelve <FiltrosMovil>.)
 */
function CamposFiltro({ values, onChange, idBase }) {
  const set = (k) => (e) => onChange({ ...values, [k]: e.target.value })
  const setFecha = (k) => (iso) => onChange({ ...values, [k]: iso })

  return (
    <>
      <div>
        <label htmlFor={`${idBase}-log`} className="sr-only">Estado logístico</label>
        <select id={`${idBase}-log`} value={values.filterLog} onChange={set('filterLog')} className={`${field} cursor-pointer`}>
          <option value="all">Estado logístico</option>
          <option value="encargado">Encargado</option>
          <option value="recibido">Recibido</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${idBase}-est`} className="sr-only">Estado de pago</label>
        <select id={`${idBase}-est`} value={values.filterEst} onChange={set('filterEst')} className={`${field} cursor-pointer`}>
          <option value="all">Estado de pago</option>
          <option value="pendiente">Pago pendiente</option>
          <option value="pagado">Pagado</option>
        </select>
      </div>
      <DateField id={`${idBase}-desde`} label="Desde" value={values.filterDesde}
        max={values.filterHasta || undefined} onChange={setFecha('filterDesde')} />
      <DateField id={`${idBase}-hasta`} label="Hasta" value={values.filterHasta}
        min={values.filterDesde || undefined} onChange={setFecha('filterHasta')} />
    </>
  )
}

/**
 * @param {object}   props
 * @param {typeof FILTROS_INICIALES} props.value     Filtros aplicados.
 * @param {(next:typeof FILTROS_INICIALES)=>void} props.onChange
 * @param {boolean}  props.compact   mobile o tablet.
 * @param {number}   [props.total]   Resultados del listado filtrado: se anuncia a lectores de pantalla (como en Saldos).
 */
export default function FiltrosPedidos({ value, onChange, compact, total }) {
  const idBase = useId()
  const setBusqueda = (texto) => onChange({ ...value, filterProv: texto })

  // ── Mobile / tablet: patrón único de filtros ──────────────────────────────
  if (compact) {
    const panel = Object.fromEntries(CAMPOS_PANEL.map((k) => [k, value[k]]))
    return (
      <FiltrosMovil
        busqueda={<BuscadorListado value={value.filterProv} onChange={setBusqueda}
          placeholder="Buscar por proveedor o ID..." />}
        value={panel}
        defaults={DEFAULTS_PANEL}
        campos={CAMPOS_MOVIL}
        validar={validarBorrador}
        onApply={(borrador) => onChange({ ...value, ...borrador })}
        debajo={typeof total === 'number' ? (
          <p role="status" aria-live="polite" className="sr-only">
            {total} resultado{total !== 1 ? 's' : ''}
          </p>
        ) : undefined}
      />
    )
  }

  // ── Escritorio: barra inline, aplicación inmediata (sin cambios) ──────────
  const hayAlgo = contarFiltrosActivos(value) > 0 || value.filterProv.trim() !== ''
  const limpiarTodo = () => onChange({ ...FILTROS_INICIALES })
  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-3 items-end w-full">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
          <label htmlFor={`${idBase}-q`} className="sr-only">Buscar por proveedor o ID</label>
          <input
            id={`${idBase}-q`} type="search" value={value.filterProv} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por proveedor o ID..."
            className={`w-full bg-surface-700 border border-surface-600 rounded-xl pl-9 pr-4 text-white font-body ${ALTO_CONTROL}
                        placeholder-surface-500 focus:outline-none focus:border-brand-500 transition-all text-sm`}
          />
        </div>
        <CamposFiltro values={value} onChange={onChange} idBase={idBase} />
        {hayAlgo && (
          <button type="button" onClick={limpiarTodo}
            className={`bg-surface-700 border border-surface-600 rounded-xl px-3 ${ALTO_CONTROL} text-surface-400 text-sm font-body
                       hover:text-white hover:border-surface-500 transition-all whitespace-nowrap`}>
            Limpiar
          </button>
        )}
      </div>
    </Card>
  )
}
