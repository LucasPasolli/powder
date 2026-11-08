// src/components/facturas/PanelFiltros.jsx
// Período + filtros (cliente o CUIT, estado) en UN solo nivel visual: sin
// títulos ni contenedores anidados, los campos y las acciones son hermanos.
//   · desktop (> 1024)  → una fila flexible: si no entra (sidebar abierto), las acciones pasan a una 2.ª fila.
//   · tablet (768–1024) → barra con el período y dos acciones; los filtros se
//                          editan en un panel a pantalla completa (sin cambios).
//   · mobile (< 768)    → cuadrante inline, una sola columna lógica:
//                          Cliente o CUIT → Desde / Hasta → Estado → acciones.
//                          Controles de 44 px y texto de 16 px (evita el zoom
//                          automático de iOS); sin scroll horizontal.
// El borrador vive acá y se compromete sólo con "Ver período"/"Ver resultados"
// o Enter: no se dispara una consulta por cada tecla.
import { useEffect, useId, useState } from 'react'
import { AlertCircle, Calendar, Eye, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { Badge, Button, Card, Input, Select } from '../ui'
import FullScreenSheet from '../ui/FullScreenSheet'
import DateField from '../ui/DateField'
import useBreakpoint from '../../hooks/useBreakpoint'
import {
  ESTADO_OPCIONES, FILTROS_VACIOS, contarFiltros, describirFiltros, firstOfMonth, fmtFecha, today,
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

/**
 * Los cuatro campos, como hermanos directos del contenedor (fragmento).
 * @param {'fila'|'hoja'|'movil'} variante
 *   fila  → desktop: orden Cliente, Desde, Hasta, Estado en una fila flexible.
 *   hoja  → panel táctil de tablet: orden original, cliente y estado a ancho completo.
 *   movil → inline en mobile: Cliente, Desde, Hasta y Estado a ancho completo
 *           (mismo margen y ancho que el buscador; DateField no entra en media columna a 320 px).
 */
function Campos({ b, set, variante = 'fila' }) {
  const tactil = variante !== 'fila'
  const movil  = variante === 'movil'
  const alto   = tactil ? 'min-h-[44px]' : ''
  const base   = movil ? `${alto} w-full min-w-0 text-base` : alto

  const cliente = (
    <Input label="Cliente o CUIT" type="text" inputMode="search" enterKeyHint="search" autoComplete="off"
      maxLength={60} placeholder="Nombre, apellido o CUIT" value={b.cliente}
      onChange={(e) => set({ cliente: e.target.value })} className={base} />
  )
  // El período es obligatorio: sin botón "Borrar" (clearable=false) para no dejar un rango vacío.
  const desde = (
    <DateField label="Desde" value={b.desde} onChange={(v) => set({ desde: v })} clearable={false} required />
  )
  const hasta = (
    <DateField label="Hasta" value={b.hasta} onChange={(v) => set({ hasta: v })} clearable={false} required />
  )
  const estado = (
    <Select label="Estado" value={b.estado} onChange={(e) => set({ estado: e.target.value })} className={base}>
      {ESTADO_OPCIONES.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
    </Select>
  )

  if (movil) {
    // Cada campo vive en su propia celda de la grilla (min-w-0 evita que un
    // <input type="date"> fuerce desborde). La etiqueta del buscador no se parte.
    return (
      <>
        <div className="col-span-2 min-w-0 [&_label]:whitespace-nowrap">{cliente}</div>
        <div className="col-span-2 min-w-0">{desde}</div>
        <div className="col-span-2 min-w-0">{hasta}</div>
        <div className="col-span-2 min-w-0">{estado}</div>
      </>
    )
  }

  if (variante === 'fila') {
    // Fila flexible: Cliente nunca baja de 14rem (etiqueta en una línea, sin que
    // Estado se le superponga). Si no entra todo, las acciones pasan a la 2.ª fila.
    return (
      <>
        <div className="flex-1 min-w-[14rem] [&_label]:whitespace-nowrap">{cliente}</div>
        <div className="w-[12rem] shrink-0">{desde}</div>
        <div className="w-[12rem] shrink-0">{hasta}</div>
        <div className="w-[11rem] shrink-0">{estado}</div>
      </>
    )
  }

  // hoja (tablet)
  return (
    <>
      {desde}
      {hasta}
      <div className="col-span-2 [&_label]:whitespace-nowrap">{cliente}</div>
      <div className="col-span-2">{estado}</div>
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
export default function PanelFiltros({ desde, hasta, filtros, cargando, error, onAplicar, onActualizar }) {
  const { isMobile, isCompact } = useBreakpoint()
  const formId = useId()
  const aplicado = { desde, hasta, ...filtros }
  const [b, setB]             = useState(aplicado)
  const [abierto, setAbierto] = useState(false)

  // Si el padre cambia lo aplicado (p. ej. "Limpiar filtros" del listado vacío), el borrador lo sigue.
  useEffect(() => { setB({ desde, hasta, ...filtros }) }, [desde, hasta, filtros])

  const set     = (parcial) => setB((prev) => ({ ...prev, ...parcial }))
  const limpiar = () => set({ ...FILTROS_VACIOS })
  // Mobile: "Limpiar" devuelve TODOS los campos a su valor por defecto (mes en curso + sin filtros).
  const limpiarTodo = () => setB({ desde: firstOfMonth(), hasta: today(), ...FILTROS_VACIOS })
  const abrir   = () => { setB(aplicado); setAbierto(true) }

  async function enviar(e) {
    e.preventDefault()
    const { desde: d, hasta: h, ...f } = b
    const ok = await onAplicar({ desde: d, hasta: h, filtros: f })
    if (ok) setAbierto(false)
  }

  // ── Mobile: cuadrante inline, orden Cliente → Desde → Hasta → Estado → acciones ──
  if (isMobile) {
    return (
      <Card className="p-3">
        <form onSubmit={enviar} noValidate aria-label="Filtros de facturas" className="grid grid-cols-2 gap-3">
          <Campos b={b} set={set} variante="movil" />
          {error && <Alerta className="col-span-2">{error}</Alerta>}
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" className={TOQUE} onClick={limpiarTodo}>Limpiar</Button>
            <Button type="submit" icon={Eye} className={TOQUE} loading={cargando}>
              {cargando ? 'Cargando…' : 'Ver período'}
            </Button>
          </div>
        </form>
      </Card>
    )
  }

  // ── Desktop: una fila, todo hermano ──
  if (!isCompact) {
    return (
      <Card className="p-4">
        <form onSubmit={enviar} noValidate className="flex flex-wrap items-end gap-3">
          <Campos b={b} set={set} variante="fila" />
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

  // ── Tablet: barra única + panel a pantalla completa (sin cambios) ──
  const activos = describirFiltros(filtros)
  const n = contarFiltros(filtros)
  return (
    <>
      <Card className="p-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="flex items-center gap-2 text-surface-100 text-base font-mono tabular-nums">
          <Calendar size={16} className="text-brand-500 flex-shrink-0" aria-hidden="true" />
          <span className="sr-only">Período: </span>{fmtFecha(desde)} al {fmtFecha(hasta)}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" icon={RefreshCw} className={TOQUE} loading={cargando} onClick={onActualizar}>
            Actualizar
          </Button>
          <Button icon={SlidersHorizontal} className={TOQUE} onClick={abrir} aria-haspopup="dialog">
            Filtros{n > 0 ? ` (${n})` : ''}
          </Button>
        </div>
        {activos.length > 0 && (
          <ul className="flex flex-wrap gap-2 basis-full" aria-label="Filtros activos">
            {activos.map((a) => <li key={a}><Badge color="gray">{a}</Badge></li>)}
          </ul>
        )}
        {error && !abierto && <Alerta className="basis-full">{error}</Alerta>}
      </Card>

      <FullScreenSheet open={abierto} onClose={() => setAbierto(false)} title="Filtros"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className={TOQUE} onClick={limpiar}>Limpiar</Button>
            <Button type="submit" form={formId} className={TOQUE} loading={cargando}>Ver resultados</Button>
          </div>
        }>
        <form id={formId} onSubmit={enviar} noValidate className="grid grid-cols-2 gap-3">
          <Campos b={b} set={set} variante="hoja" />
          {error && <Alerta className="col-span-2">{error}</Alerta>}
        </form>
      </FullScreenSheet>
    </>
  )
}
