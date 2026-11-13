// src/components/facturas/PanelFiltros.jsx
// Período + filtros (cliente o CUIT, estado).
//   · desktop (> 1024)     → una fila flexible con borrador; se confirma con "Ver período" o Enter
//                            (sin cambios).
//   · mobile/tablet (≤ 1024) → patrón único del sistema (<FiltrosMovil>): "Cliente o CUIT" queda
//                            como buscador siempre visible (se aplica al escribir: es un filtro
//                            local, no dispara consulta) y Desde / Hasta / Estado van al panel,
//                            donde "Aplicar" consulta el período. Debajo de la fila se muestra
//                            el período vigente y "Actualizar".
import { useEffect, useState } from 'react'
import { AlertCircle, Calendar, Eye, RefreshCw } from 'lucide-react'
import { Button, Card, Input, Select } from '../ui'
import DateField from '../ui/DateField'
import FiltrosMovil, { BuscadorListado, mensajeRangoInvalido } from '../ui/FiltrosMovil'
import useBreakpoint from '../../hooks/useBreakpoint'
import {
  ESTADO_OPCIONES, FILTROS_VACIOS, firstOfMonth, fmtFecha, today,
} from '../../lib/facturas'
import { TOQUE } from './estilos'

function Alerta({ children, className = '' }) {
  return (
    <div role="alert" className={`flex items-start gap-2 text-red-400 text-base sm:text-sm bg-red-500/10
                                  border border-red-500/20 rounded-xl px-4 py-2.5 font-body ${className}`}>
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

/** Los cuatro campos de ESCRITORIO, como hermanos directos del contenedor (fragmento). */
function Campos({ b, set }) {
  const cliente = (
    <Input label="Cliente o CUIT" type="text" inputMode="search" enterKeyHint="search" autoComplete="off"
      maxLength={60} placeholder="Nombre, apellido o CUIT" value={b.cliente}
      onChange={(e) => set({ cliente: e.target.value })} />
  )
  // El período es obligatorio: sin botón "Borrar" (clearable=false) para no dejar un rango vacío.
  const desde = (
    <DateField label="Desde" value={b.desde} onChange={(v) => set({ desde: v })} clearable={false} required />
  )
  const hasta = (
    <DateField label="Hasta" value={b.hasta} onChange={(v) => set({ hasta: v })} clearable={false} required />
  )
  const estado = (
    <Select label="Estado" value={b.estado} onChange={(e) => set({ estado: e.target.value })}>
      {ESTADO_OPCIONES.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
    </Select>
  )
  // Fila flexible: Cliente nunca baja de 14rem (etiqueta en una línea, sin que Estado se le
  // superponga). Si no entra todo, las acciones pasan a la 2.ª fila.
  return (
    <>
      <div className="flex-1 min-w-[14rem] [&_label]:whitespace-nowrap">{cliente}</div>
      <div className="w-[12rem] shrink-0">{desde}</div>
      <div className="w-[12rem] shrink-0">{hasta}</div>
      <div className="w-[11rem] shrink-0">{estado}</div>
    </>
  )
}

/**
 * @param {object} props
 * @param {string} props.desde               Período APLICADO.
 * @param {string} props.hasta
 * @param {import('../../lib/facturas').FiltrosFactura} props.filtros   Filtros APLICADOS.
 * @param {boolean} props.cargando
 * @param {string} props.error
 * @param {(v: {desde: string, hasta: string, filtros: import('../../lib/facturas').FiltrosFactura}) => Promise<boolean>} props.onAplicar
 *   Devuelve `true` si se aplicó (el panel se cierra) o `false` si hubo error (queda abierto).
 * @param {() => Promise<unknown>} props.onActualizar  Vuelve a consultar el período vigente.
 */
export default function PanelFiltros({ desde, hasta, filtros, cargando, error, onAplicar, onActualizar, onCliente }) {
  const { isCompact } = useBreakpoint()
  const aplicado = { desde, hasta, ...filtros }
  const [b, setB] = useState(aplicado)

  // Si el padre cambia lo aplicado (p. ej. "Limpiar filtros" del listado vacío), el borrador lo sigue.
  useEffect(() => { setB({ desde, hasta, ...filtros }) }, [desde, hasta, filtros])

  const set     = (parcial) => setB((prev) => ({ ...prev, ...parcial }))
  const limpiar = () => set({ ...FILTROS_VACIOS })

  async function enviar(e) {
    e.preventDefault()
    const { desde: d, hasta: h, ...f } = b
    await onAplicar({ desde: d, hasta: h, filtros: f })
  }

  // ── Mobile / tablet: patrón único de filtros ──
  if (isCompact) {
    return (
      <FiltrosMovil
        busqueda={(
          <BuscadorListado value={filtros.cliente} onChange={(cliente) => onCliente?.(cliente)}
            placeholder="Cliente o CUIT" etiqueta="Cliente o CUIT" maxLength={60} />
        )}
        value={{ desde, hasta, estado: filtros.estado }}
        defaults={{ desde: firstOfMonth(), hasta: today(), estado: FILTROS_VACIOS.estado }}
        campos={[
          // El período es obligatorio: sin «Borrar».
          { tipo: 'fecha', clave: 'desde', etiqueta: 'Desde', limpiable: false, max: (x) => x.hasta || undefined },
          { tipo: 'fecha', clave: 'hasta', etiqueta: 'Hasta', limpiable: false, min: (x) => x.desde || undefined },
          { tipo: 'select', clave: 'estado', etiqueta: 'Estado',
            opciones: ESTADO_OPCIONES.map((o) => ({ value: o.valor, label: o.label })) },
        ]}
        validar={(x) => mensajeRangoInvalido(x.desde, x.hasta)}
        // Devuelve la promesa: «Aplicar» muestra «cargando» y el panel sólo se cierra si la consulta salió bien.
        onApply={(x) => onAplicar({
          desde: x.desde, hasta: x.hasta, filtros: { cliente: filtros.cliente, estado: x.estado },
        })}
        error={error}
        debajo={(
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-surface-100 text-sm font-mono tabular-nums min-w-0">
              <Calendar size={15} className="text-brand-500 flex-shrink-0" aria-hidden="true" />
              <span className="sr-only">Período: </span>{fmtFecha(desde)} al {fmtFecha(hasta)}
            </p>
            <Button variant="secondary" icon={RefreshCw} className={TOQUE} loading={cargando} onClick={onActualizar}>
              Actualizar
            </Button>
          </div>
        )}
      />
    )
  }

  // ── Desktop: una fila, todo hermano ──
  return (
    <Card className="p-4">
      <form onSubmit={enviar} noValidate className="flex flex-wrap items-end gap-3">
        <Campos b={b} set={set} />
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <Button type="button" variant="ghost" className="whitespace-nowrap" onClick={limpiar}>Limpiar</Button>
          <Button type="submit" icon={Eye} className="whitespace-nowrap" loading={cargando}>
            {cargando ? 'Cargando…' : 'Ver período'}
          </Button>
        </div>
        {error && <Alerta className="basis-full">{error}</Alerta>}
      </form>
    </Card>
  )
}
