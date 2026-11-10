// src/components/estadisticas/PanelFiltros.jsx
// Filtros de período (Escenario 5).
//
//  · escritorio (> 1024 px): chips + fechas en línea, se aplican al instante
//    (comportamiento original), pero un rango inválido nunca se consulta.
//  · mobile / tablet: patrón único del sistema (<FiltrosMovil>). Esta pantalla no tiene
//    buscador, así que la fila muestra el período vigente + el botón "Filtros"; el panel
//    edita un BORRADOR (Limpiar / Aplicar): no se dispara una consulta por cada toque.
//
// El estado aplicado vive en el padre (useFiltrosEstadisticas); el borrador es
// local pero este componente NO se desmonta al rotar → los filtros se mantienen
// (Escenario 6).

import { useEffect, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { Button, Card } from '../ui'
import FiltrosMovil from '../ui/FiltrosMovil'
import DateField from '../ui/DateField'
import { ALTO_CONTROL } from '../ui/controles'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import {
  RANGOS, IDX_PERSONALIZADO, filtrosIniciales, errorDeFiltros,
} from '../../hooks/useFiltrosEstadisticas'
import { fmtFecha, hoyISO } from './formatters'

/** Panel móvil: chips de período + fechas (sólo en «Personalizado»). */
const CAMPOS_MOVIL = [
  { tipo: 'chips', clave: 'rangoIdx', etiqueta: 'Período', opciones: RANGOS.map((r, i) => ({ value: i, label: r.label })) },
  { tipo: 'fecha', clave: 'desdeCustom', etiqueta: 'Desde', limpiable: false,
    visible: (b) => b.rangoIdx === IDX_PERSONALIZADO, max: (b) => b.hastaCustom || hoyISO() },
  { tipo: 'fecha', clave: 'hastaCustom', etiqueta: 'Hasta', limpiable: false,
    visible: (b) => b.rangoIdx === IDX_PERSONALIZADO, min: (b) => b.desdeCustom || undefined },
]

/**
 * @param {object} props
 * @param {{rangoIdx:number, desdeCustom:string, hastaCustom:string}} props.filtros  Filtros APLICADOS.
 * @param {string} props.desde  Rango vigente (resuelto).
 * @param {string} props.hasta
 * @param {(f:object)=>boolean} props.onAplicar
 * @param {()=>void} props.onLimpiar
 */
export default function PanelFiltros({ filtros, desde, hasta, onAplicar, onLimpiar }) {
  const { isCompact } = useBreakpoint()
  const [borrador, setBorrador] = useState(filtros)

  // Si los filtros aplicados cambian desde afuera (p. ej. "Limpiar"), el borrador los sigue.
  useEffect(() => { setBorrador(filtros) }, [filtros])

  const error = errorDeFiltros(borrador)
  const hoy = hoyISO()

  /** Al pasar a "Personalizado" se precargan las fechas vigentes: nunca queda un rango vacío. */
  function conRango(idx) {
    if (idx !== IDX_PERSONALIZADO) return { ...borrador, rangoIdx: idx }
    const venia = borrador.rangoIdx === IDX_PERSONALIZADO
    return {
      rangoIdx: idx,
      desdeCustom: venia ? borrador.desdeCustom : desde,
      hastaCustom: venia ? borrador.hastaCustom : hasta,
    }
  }

  /** Escritorio: aplica en vivo si es válido (onAplicar rechaza rangos inválidos). */
  function editar(siguiente) {
    setBorrador(siguiente)
    onAplicar(siguiente)
  }

  const limpiar = () => { onLimpiar(); setBorrador(filtrosIniciales()) }

  const chips = (
    <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
      {RANGOS.map((r, i) => (
        <button key={r.id} type="button" aria-pressed={borrador.rangoIdx === i}
          onClick={() => editar(conRango(i))}
          className={`px-4 ${ALTO_CONTROL} rounded-xl text-sm font-body transition-all border justify-center
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60
            ${borrador.rangoIdx === i
              ? 'bg-brand-500/15 border-brand-500/40 text-white'
              : 'bg-surface-700 border-surface-600 text-surface-300 hover:border-surface-500'}`}>
          {r.label}
        </button>
      ))}
    </div>
  )

  const fechas = borrador.rangoIdx === IDX_PERSONALIZADO && (
    <div className="flex items-center gap-2 ml-2">
      <DateField id="est-desde" label="Desde" clearable={false} value={borrador.desdeCustom}
        max={borrador.hastaCustom || hoy} aria-invalid={!!error}
        onChange={(v) => editar({ ...borrador, desdeCustom: v })} />
      <span className="text-surface-500 text-sm" aria-hidden="true">→</span>
      <DateField id="est-hasta" label="Hasta" clearable={false} value={borrador.hastaCustom}
        min={borrador.desdeCustom || undefined} aria-invalid={!!error}
        onChange={(v) => editar({ ...borrador, hastaCustom: v })} />
    </div>
  )

  const mensajeError = error && (
    <p role="alert" className="mt-3 text-red-400 text-sm font-body">{error}</p>
  )

  // ── Mobile / tablet: patrón único de filtros ───────────────────────────
  if (isCompact) {
    return (
      <FiltrosMovil
        izquierda={(
          <div className="flex items-center gap-3 min-w-0">
            <CalendarRange size={18} className="text-brand-500 flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-surface-400 text-xs font-body">{RANGOS[filtros.rangoIdx].label}</p>
              <p className="text-white text-sm font-mono break-words">{fmtFecha(desde)} → {fmtFecha(hasta)}</p>
            </div>
          </div>
        )}
        value={filtros}
        defaults={filtrosIniciales()}
        campos={CAMPOS_MOVIL}
        contar={(f) => (f.rangoIdx !== filtrosIniciales().rangoIdx ? 1 : 0)}
        // Al pasar a «Personalizado» se precargan las fechas vigentes: nunca queda un rango vacío.
        alCambiar={(clave, valor, sig, previo) => {
          if (clave !== 'rangoIdx' || valor !== IDX_PERSONALIZADO) return sig
          const venia = previo.rangoIdx === IDX_PERSONALIZADO
          return { ...sig, desdeCustom: venia ? previo.desdeCustom : desde, hastaCustom: venia ? previo.hastaCustom : hasta }
        }}
        validar={errorDeFiltros}
        onApply={onAplicar}
      />
    )
  }

  // ── Escritorio ───────────────────────────────────────────────────────────
  return (
    <Card className="p-4">
      <div className="flex flex-wrap gap-2 items-center">
        {chips}
        {fechas}
        {borrador.rangoIdx === IDX_PERSONALIZADO && (
          <Button variant="secondary" onClick={limpiar} className="ml-2">Limpiar Filtros</Button>
        )}
      </div>
      {mensajeError}
    </Card>
  )
}
