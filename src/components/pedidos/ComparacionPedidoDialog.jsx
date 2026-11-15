// src/components/pedidos/ComparacionPedidoDialog.jsx
//
// «Comparar original vs facturado»: lado a lado, por artículo, con el % de diferencia.
// Los cálculos viven en lib/pedidoComparacion.js (puro y testeado); acá sólo se presenta.
//
// Responsive:
//   mobile (<768)  → una tarjeta por línea, sin scroll horizontal de la página.
//   tablet/desktop → tabla (si el ancho no alcanza, scrollea DENTRO de su contenedor).
// El diálogo es pantalla completa hasta 1024 px y modal centrado en escritorio (ResponsiveDialog).
//
// Accesibilidad: el tipo de línea se comunica con texto + ícono, no sólo con color.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, MinusCircle, PlusCircle, RefreshCw, TrendingDown, TrendingUp, CheckCircle2, Info } from 'lucide-react'
import { Badge, Button, Spinner } from '../ui'
import ResponsiveDialog from '../ui/ResponsiveDialog'
import { AvisoError, ETIQUETA } from './flujoUi'
import { TOUCH, fmt } from './pedidosPresentacion'
import { esAnteriorAlFlujo } from '../../lib/pedidoFlujo'
import {
  compararPedido, filtrarConDiferencias, formatearPct, ETIQUETA_TIPO, TIPO_LINEA, MENSAJE_SIN_MODIFICACIONES,
} from '../../lib/pedidoComparacion'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { FlujoPedidoError, obtenerPedidoParaFlujo } from '../../services/pedidosFlujoService'
import { logger } from '../../lib/logger'

/** Estilo + ícono + texto por tipo de línea (el resaltado distingue quitadas, reducidas y agregadas). */
function estiloLinea(l) {
  if (l.tipo === TIPO_LINEA.QUITADA)   return { fila: 'bg-red-500/10',     color: 'red',    Icono: MinusCircle, texto: ETIQUETA_TIPO[l.tipo] }
  if (l.tipo === TIPO_LINEA.AGREGADA)  return { fila: 'bg-emerald-500/10', color: 'green',  Icono: PlusCircle,  texto: ETIQUETA_TIPO[l.tipo] }
  if (l.tipo === TIPO_LINEA.CANTIDAD_MODIFICADA) {
    return l.direccion === 'reducida'
      ? { fila: 'bg-amber-500/10', color: 'yellow', Icono: TrendingDown, texto: 'Cantidad reducida' }
      : { fila: 'bg-blue-500/10',  color: 'blue',   Icono: TrendingUp,   texto: 'Cantidad aumentada' }
  }
  return { fila: '', color: 'gray', Icono: CheckCircle2, texto: ETIQUETA_TIPO[TIPO_LINEA.SIN_CAMBIOS] }
}

const signo = (n) => (n > 0 ? `+${n}` : String(n))

function TipoBadge({ l }) {
  const e = estiloLinea(l)
  return <Badge color={e.color}><e.Icono size={11} className="inline mr-1" aria-hidden="true" />{e.texto}</Badge>
}

function Precios({ l }) {
  if (!l.precioCambio && l.precioConDescuento == null) return <span className="text-surface-500">—</span>
  return (
    <div className="space-y-0.5 font-mono text-xs whitespace-nowrap">
      {l.precioCambio && (
        <>
          <p className="text-surface-300">Orig. {fmt(l.precioOriginal)}</p>
          <p className="text-white">Fact. {fmt(l.precioFacturado)}</p>
        </>
      )}
      {l.precioConDescuento != null && <p className="text-emerald-400">c/ desc. {fmt(l.precioConDescuento)}</p>}
    </div>
  )
}

const nombre = (l) => `${l.nombreProducto ?? `#${l.idProducto}`}${l.medida ? ` · ${l.medida}` : ''}`

function Resumen({ r }) {
  const Stat = ({ label, valor, tono = 'text-white' }) => (
    <div className="bg-surface-700 rounded-xl p-4 min-w-0">
      <p className="text-surface-400 text-sm min-[1025px]:text-xs uppercase tracking-widest font-body mb-1">{label}</p>
      <p className={`${tono} font-mono font-bold text-lg break-words`}>{valor}</p>
    </div>
  )
  const tonoImporte = r.difImporte < 0 ? 'text-emerald-400' : r.difImporte > 0 ? 'text-amber-300' : 'text-white'
  return (
    <div className="grid grid-cols-1 min-[420px]:grid-cols-2 min-[1025px]:grid-cols-4 gap-3">
      <Stat label="Diferencia global" valor={`${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r.pctGlobal)} %`} tono="text-brand-400" />
      <Stat label="Total original" valor={fmt(r.totalOriginal)} />
      <Stat label="Total facturado" valor={fmt(r.totalFacturado)} />
      <Stat label="Diferencia en importe" valor={`${r.difImporte > 0 ? '+' : ''}${fmt(r.difImporte)}`} tono={tonoImporte} />
    </div>
  )
}

function Conteos({ r }) {
  const c = r.conteo
  const items = [
    [TIPO_LINEA.QUITADA, 'red', 'Quitadas'], [TIPO_LINEA.CANTIDAD_MODIFICADA, 'yellow', 'Modificadas'],
    [TIPO_LINEA.AGREGADA, 'green', 'Agregadas'], [TIPO_LINEA.SIN_CAMBIOS, 'gray', 'Sin cambios'],
  ].filter(([t]) => c[t])
  if (items.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Cantidad de líneas por tipo">
      {items.map(([t, color, txt]) => <li key={t}><Badge color={color}>{txt}: {c[t]}</Badge></li>)}
    </ul>
  )
}

function Lineas({ lineas, mobile }) {
  if (mobile) {
    return (
      <ul className="space-y-3" aria-label="Comparación por artículo">
        {lineas.map((l) => (
          <li key={l.clave} className={`border border-surface-700 rounded-xl p-4 space-y-3 ${estiloLinea(l).fila}`}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-white text-base font-body break-words min-w-0">{nombre(l)}</p>
              <TipoBadge l={l} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-body">
              <div><dt className="text-surface-400">Original</dt><dd className="text-white font-mono">{l.cantidadOriginal}</dd></div>
              <div><dt className="text-surface-400">Facturado</dt><dd className="text-white font-mono">{l.cantidadFacturada}</dd></div>
              <div><dt className="text-surface-400">Diferencia</dt><dd className="text-white font-mono">{signo(l.difUnidades)} u.</dd></div>
              <div><dt className="text-surface-400">Diferencia %</dt><dd className="text-white font-mono">{formatearPct(l)}</dd></div>
            </dl>
            {(l.precioCambio || l.precioConDescuento != null) && (
              <div className="pt-2 border-t border-surface-700/60"><Precios l={l} /></div>
            )}
          </li>
        ))}
      </ul>
    )
  }

  const TH = 'text-left text-surface-400 text-sm min-[1025px]:text-xs tracking-widest uppercase py-3 px-3 font-body'
  return (
    <div className="overflow-x-auto border border-surface-700 rounded-xl">
      <table className="w-full text-sm font-body">
        <caption className="sr-only">Comparación por artículo entre el pedido original y el facturado</caption>
        <thead>
          <tr className="border-b border-surface-700">
            <th scope="col" className={TH}>Producto</th>
            <th scope="col" className={`${TH} text-right`}>Original</th>
            <th scope="col" className={`${TH} text-right`}>Facturado</th>
            <th scope="col" className={`${TH} text-right`}>Dif. u.</th>
            <th scope="col" className={`${TH} text-right`}>Dif. %</th>
            <th scope="col" className={TH}>Precio</th>
            <th scope="col" className={TH}>Tipo</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={l.clave} className={`border-b border-surface-700/50 last:border-0 ${estiloLinea(l).fila}`}>
              <td className="py-3 px-3 text-white break-words max-w-[16rem]">{nombre(l)}</td>
              <td className="py-3 px-3 text-right font-mono text-surface-200">{l.cantidadOriginal}</td>
              <td className="py-3 px-3 text-right font-mono text-surface-200">{l.cantidadFacturada}</td>
              <td className="py-3 px-3 text-right font-mono text-white">{signo(l.difUnidades)}</td>
              <td className="py-3 px-3 text-right font-mono text-white whitespace-nowrap">{formatearPct(l)}</td>
              <td className="py-3 px-3"><Precios l={l} /></td>
              <td className="py-3 px-3"><TipoBadge l={l} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{idPedido:number}} props.pedido
 */
export default function ComparacionPedidoDialog({ open, onClose, pedido }) {
  const { isMobile } = useBreakpoint()
  const [estado, setEstado] = useState('cargando') // 'cargando' | 'listo' | 'error'
  const [error, setError] = useState('')
  const [datos, setDatos] = useState(null)
  const [soloDiferencias, setSoloDiferencias] = useState(false)

  const cargar = useCallback(async () => {
    setEstado('cargando')
    setError('')
    try {
      setDatos(await obtenerPedidoParaFlujo(pedido.idPedido))
      setEstado('listo')
    } catch (err) {
      logger.error('comparacion.carga.error', { error: err })
      setError(err instanceof FlujoPedidoError ? err.message : 'No se pudo cargar la comparación.')
      setEstado('error')
    }
  }, [pedido.idPedido])

  useEffect(() => { if (open) cargar() }, [open, cargar])

  const cmp = useMemo(() => (datos ? compararPedido({
    original: datos.original, facturado: datos.detalles,
    montoOriginal: datos.pedido.montoOriginal, montoFacturado: datos.pedido.monto,
  }) : null), [datos])

  const visibles = cmp && !cmp.sinOriginal ? (soloDiferencias ? filtrarConDiferencias(cmp.lineas) : cmp.lineas) : []

  const toolbar = estado === 'listo' && cmp && !cmp.sinOriginal && !cmp.resumen.sinDiferencias ? (
    <div className="px-4 sm:px-6 py-3 flex items-center">
      <button
        type="button" role="switch" aria-checked={soloDiferencias} onClick={() => setSoloDiferencias((v) => !v)}
        className={`flex items-center gap-3 ${TOUCH} text-sm text-surface-200 font-body focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded-lg px-1`}
      >
        <span aria-hidden="true" className={`relative inline-block w-10 h-6 rounded-full transition-colors ${soloDiferencias ? 'bg-brand-500' : 'bg-surface-600'}`}>
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform motion-reduce:transition-none ${soloDiferencias ? 'translate-x-4' : ''}`} />
        </span>
        Ver sólo líneas con diferencias
      </button>
    </div>
  ) : null

  return (
    <ResponsiveDialog
      open={open} onClose={onClose} icon={ArrowLeftRight}
      title="Comparar original vs facturado" subtitle={`Pedido #${pedido.idPedido}`}
      toolbar={toolbar} busy={estado === 'cargando'}
    >
      <div className="p-4 sm:p-6 space-y-4">
        {estado === 'cargando' && (
          <div className="flex items-center justify-center gap-3 py-16 text-surface-300 font-body"><Spinner label="Cargando comparación" /> Cargando…</div>
        )}

        {estado === 'error' && (
          <div className="space-y-3">
            <AvisoError>{error}</AvisoError>
            <Button variant="secondary" icon={RefreshCw} onClick={cargar} className={TOUCH}>Reintentar</Button>
          </div>
        )}

        {estado === 'listo' && cmp?.sinOriginal && (
          <div className="flex items-start gap-3 bg-surface-700/60 border border-surface-600 rounded-xl px-4 py-4" role="status">
            <Info size={18} className="text-surface-300 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-white text-sm font-body font-semibold">{cmp.mensaje}</p>
              <p className="text-surface-300 text-sm font-body">
                {esAnteriorAlFlujo(datos.pedido)
                  ? 'Pedido anterior al nuevo flujo: no tiene original registrado, por eso no se calculan diferencias.'
                  : 'Todavía no hay una versión facturada para comparar.'}
              </p>
            </div>
          </div>
        )}

        {estado === 'listo' && cmp && !cmp.sinOriginal && (
          <>
            <Resumen r={cmp.resumen} />
            <Conteos r={cmp.resumen} />

            {cmp.resumen.sinDiferencias && (
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3" role="status">
                <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" aria-hidden="true" />
                <p className="text-emerald-300 text-sm font-body">{MENSAJE_SIN_MODIFICACIONES}</p>
              </div>
            )}
            {!cmp.resumen.sinDiferencias && cmp.resumen.sinCambiosCantidad && (
              <p className="text-surface-300 text-sm font-body" role="status">
                Las cantidades no cambiaron (0 %), pero hubo cambios de precio o descuentos.
              </p>
            )}

            <p className={ETIQUETA}>Detalle por artículo</p>
            {visibles.length > 0
              ? <Lineas lineas={visibles} mobile={isMobile} />
              : <p className="text-surface-400 text-sm font-body py-6 text-center" role="status">No hay líneas con diferencias.</p>}
          </>
        )}
      </div>
    </ResponsiveDialog>
  )
}
