// src/components/pedidos/ComparacionPedidoDialog.jsx
//
// «Comparar original vs facturado»: lado a lado, por artículo, con el % de diferencia.
// Los cálculos viven en lib/pedidoComparacion.js (puro y testeado); acá SÓLO se presenta.
// REDISEÑO VISUAL: no cambia carga de datos, comparación, filtro ni cálculos.
//
// Criterios de diseño (minimalismo, según buenas prácticas de tablas y vistas de diferencias):
//   · Sin rellenos, sin bordes verticales, sin cebreado: sólo líneas horizontales de 1 px.
//   · El color se reserva para lo QUE CAMBIÓ (valor de diferencia y estado); lo igual queda neutro y atenuado.
//   · El color nunca va solo: siempre con signo (+/−), ícono y texto.
//   · Números alineados a la derecha, encabezados alineados con su columna, sin negritas decorativas.
//   · Un único cuadro de resumen (una sola superficie), sin tarjetas anidadas.
//
// Responsive — 100 % CSS (md: / lg:), sin estado por breakpoint: rotar el equipo no re-monta nada.
//   mobile  (< 768 px)  → una tarjeta por línea, sin scroll horizontal de la página.
//   tablet  (768–1023)  → tabla; las columnas de precio se colapsan y viajan bajo el producto.
//   desktop (≥ 1024)    → tabla completa con grupos «Cantidad» y «Precio unitario».
// Si la tabla no entra, scrollea DENTRO de su contenedor, nunca la página.
// El diálogo es pantalla completa hasta 1024 px y modal centrado en escritorio (ResponsiveDialog).
//
// Accesibilidad (WCAG 2.1 AA): el tipo de línea se comunica con texto + ícono + signo (+/−),
// no sólo con color; encabezados de tabla con scope; estados con role="status" / "alert".

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeftRight, CheckCircle2, Info, MinusCircle, PlusCircle, RefreshCw, Tag,
  WifiOff,
} from 'lucide-react'
import { Button, Card } from '../ui'
import ResponsiveDialog from '../ui/ResponsiveDialog'
import { ETIQUETA } from './flujoUi'
import { TOUCH, fmt } from './pedidosPresentacion'
import { esAnteriorAlFlujo } from '../../lib/pedidoFlujo'
import {
  compararPedido, filtrarConDiferencias, formatearPct, ETIQUETA_TIPO, TIPO_LINEA, MENSAJE_SIN_MODIFICACIONES,
} from '../../lib/pedidoComparacion'
import { FlujoPedidoError, obtenerPedidoParaFlujo } from '../../services/pedidosFlujoService'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { logger } from '../../lib/logger'

// ─── Tokens locales de presentación (paleta del sistema, sin colores nuevos) ───────────────
// Clases como literales completos para que Tailwind las detecte.
// Paleta acotada y jerárquica: SÓLO dos matices de alerta sobre el fondo oscuro del sistema.
//   baja  → rojo tenue     (disminuyó: cantidad menor, producto quitado, precio menor)
//   sube  → amarillo tenue (aumentó: cantidad mayor, producto agregado, precio mayor)
// Lo que no cambió queda neutro. El fondo de la fila lleva el matiz; el texto usa el mismo tono.
const TONO = {
  baja: { fila: 'bg-red-500/10',    texto: 'text-red-300' },
  sube: { fila: 'bg-yellow-500/10', texto: 'text-yellow-300' },
}
const TEXTO = { red: 'text-red-300', yellow: 'text-yellow-300', neutral: 'text-surface-200', gray: 'text-surface-400' }

/**
 * Dirección de la alteración de una línea: 'baja' | 'sube' | null (sin alteración).
 * Primero manda la cantidad; si la cantidad no cambió, se evalúa el precio unitario.
 */
function direccion(l) {
  if (l.tipo === TIPO_LINEA.QUITADA) return 'baja'
  if (l.tipo === TIPO_LINEA.AGREGADA) return 'sube'
  if (l.difUnidades < 0) return 'baja'
  if (l.difUnidades > 0) return 'sube'
  if (l.precioCambio && l.precioOriginal != null && l.precioFacturado != null) {
    if (l.precioFacturado < l.precioOriginal) return 'baja'
    if (l.precioFacturado > l.precioOriginal) return 'sube'
  }
  return null
}
const filaClase = (l) => TONO[direccion(l)]?.fila ?? ''
const difClase = (l) => TONO[direccion(l)]?.texto ?? 'text-surface-500'
const esIgual = (l) => direccion(l) === null && !l.precioCambio

const signo = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')
const nombre = (l) => `${l.nombreProducto ?? `#${l.idProducto}`}${l.medida ? ` · ${l.medida}` : ''}`
const fmtPct = (n) => `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} %`
const monto = (n) => (n == null ? <span className="text-surface-500" aria-label="sin dato">—</span> : fmt(n))

// ─── Piezas ────────────────────────────────────────────────────────────────────────────────

/** Etiqueta en texto plano bajo el nombre: sólo producto quitado/agregado o precio modificado. */
function EstadoLinea({ l }) {
  const quitada = l.tipo === TIPO_LINEA.QUITADA
  const agregada = l.tipo === TIPO_LINEA.AGREGADA
  if (!quitada && !agregada && !l.precioCambio) return null
  return (
    <ul className="space-y-0.5 text-xs font-body text-surface-300">
      {quitada && <li className="flex items-center gap-1.5"><MinusCircle size={12} className="flex-shrink-0" aria-hidden="true" />{ETIQUETA_TIPO[l.tipo]}</li>}
      {agregada && <li className="flex items-center gap-1.5"><PlusCircle size={12} className="flex-shrink-0" aria-hidden="true" />{ETIQUETA_TIPO[l.tipo]}</li>}
      {l.precioCambio && <li className="flex items-center gap-1.5"><Tag size={12} className="flex-shrink-0" aria-hidden="true" />Precio modificado</li>}
    </ul>
  )
}

/** Precio con descuento (si hay): línea secundaria bajo el precio facturado. */
function ConDescuento({ l }) {
  if (l.precioConDescuento == null) return null
  return <p className="text-surface-400 text-xs font-mono tabular-nums mt-0.5 whitespace-nowrap">c/ desc. {fmt(l.precioConDescuento)}</p>
}

function SeccionTitulo({ children, aside }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h3 className={ETIQUETA}>{children}</h3>
      {aside}
    </div>
  )
}

/** Resumen: UNA sola superficie. Importes alineados al borde derecho; una única línea divisoria antes de la diferencia. */
function Resumen({ r }) {
  const dif = r.difImporte
  const tono = dif < 0 ? TEXTO.red : dif > 0 ? TEXTO.yellow : 'text-white'
  const palabra = dif < 0 ? 'menos que el original' : dif > 0 ? 'más que el original' : 'sin diferencia'
  const c = r.conteo
  const conteos = [
    [TIPO_LINEA.QUITADA, 'red', 'quitadas'], [TIPO_LINEA.CANTIDAD_MODIFICADA, 'neutral', 'modificadas'],
    [TIPO_LINEA.AGREGADA, 'yellow', 'agregadas'], [TIPO_LINEA.SIN_CAMBIOS, 'gray', 'sin cambios'],
  ].filter(([t]) => c[t])
  return (
    <Card className="p-4 sm:p-5">
      <dl className="space-y-2 text-sm font-body">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-surface-400">Total original</dt>
          <dd className="font-mono tabular-nums text-surface-200">{fmt(r.totalOriginal)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-surface-400">Total facturado</dt>
          <dd className="font-mono tabular-nums text-white">{fmt(r.totalFacturado)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 pt-3 mt-1 border-t border-surface-700">
          <dt className="text-white">Diferencia</dt>
          <dd className="text-right min-w-0">
            <span className={`font-mono tabular-nums text-base ${tono}`}>{dif > 0 ? '+' : dif < 0 ? '−' : ''}{fmt(Math.abs(dif))}</span>
            <span className="block text-surface-500 text-xs">{palabra} · {fmtPct(r.pctGlobal)} de unidades</span>
          </dd>
        </div>
      </dl>
      {conteos.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs font-body text-surface-400" aria-label="Cantidad de líneas por tipo">
          {conteos.map(([t, color, txt]) => (
            <li key={t}><span className={`font-mono tabular-nums ${TEXTO[color]}`}>{c[t]}</span> {txt}</li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Mensaje en línea, sin caja ni relleno. */
function Aviso({ icono: Icono, tono = 'neutral', children }) {
  return (
    <p role="status" className={`flex items-start gap-2 text-sm font-body ${tono === 'ok' ? 'text-surface-100' : 'text-surface-300'}`}>
      <Icono size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />{children}
    </p>
  )
}

// ─── Estados transversales (misma estructura que PedidosListado: skeleton / error / vacío) ──

function ComparacionSkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Cargando comparación…</span>
      <div aria-hidden="true" className="h-36 rounded-2xl bg-surface-700/50 animate-pulse motion-reduce:animate-none" />
      <div aria-hidden="true" className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 md:h-14 rounded-xl bg-surface-700/50 animate-pulse motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  )
}

function ComparacionError({ mensaje, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center py-12 px-4 gap-3 text-center">
      <AlertTriangle size={28} className="text-red-400" aria-hidden="true" />
      <p className="text-surface-300 text-sm font-body max-w-md">{mensaje}</p>
      <Button variant="secondary" icon={RefreshCw} onClick={onRetry} className={TOUCH}>Reintentar</Button>
    </div>
  )
}

function EstadoVacio({ icono: Icono = Info, titulo, detalle, accion }) {
  return (
    <div role="status" className="flex flex-col items-center py-12 px-4 gap-3 text-center">
      <Icono size={32} className="text-surface-500 opacity-60" aria-hidden="true" />
      <p className="text-white text-sm font-body font-semibold">{titulo}</p>
      {detalle && <p className="text-surface-400 text-sm font-body max-w-md">{detalle}</p>}
      {accion}
    </div>
  )
}

// ─── Detalle por artículo ──────────────────────────────────────────────────────────────────

/** < 768 px: lista dentro de UNA sola superficie, separada por líneas finas (sin una caja por línea). */
function LineasTarjetas({ lineas }) {
  return (
    <Card className="md:hidden overflow-hidden">
      <ul className="divide-y divide-surface-700" aria-label="Comparación por artículo">
        {lineas.map((l) => {
          const igual = esIgual(l)
          return (
            <li key={l.clave} className={`p-4 space-y-3 ${filaClase(l)}`}>
              <div className="space-y-1">
                <p className={`text-sm font-body leading-tight break-words ${igual ? 'text-surface-300' : 'text-white font-medium'}`}>{nombre(l)}</p>
                <EstadoLinea l={l} />
              </div>

              <dl className="grid grid-cols-3 gap-3 text-xs font-body">
                <div><dt className="text-surface-500">Original</dt><dd className="text-surface-200 font-mono tabular-nums text-sm mt-0.5">{l.cantidadOriginal}</dd></div>
                <div><dt className="text-surface-500">Facturado</dt><dd className="text-white font-mono tabular-nums text-sm mt-0.5">{l.cantidadFacturada}</dd></div>
                <div>
                  <dt className="text-surface-500">Dif.</dt>
                  <dd className={`font-mono tabular-nums text-sm mt-0.5 ${difClase(l)}`}>
                    {signo(l.difUnidades)}<span className="block text-xs">{formatearPct(l)}</span>
                  </dd>
                </div>
              </dl>

              {l.precioCambio && (
                <p className="text-xs font-mono tabular-nums text-surface-400">
                  Precio <span className="text-surface-300">{fmt(l.precioOriginal)}</span> → <span className="text-white">{fmt(l.precioFacturado)}</span>
                </p>
              )}
              <ConDescuento l={l} />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// Encabezado: una sola fila, sin relleno ni bordes verticales; alineado igual que su columna.
const TH = 'text-surface-500 text-xs tracking-widest uppercase py-3 px-3 font-body font-normal'

/** ≥ 768 px: tabla. En tablet los precios viajan bajo el producto (`lg:hidden`). */
function LineasTabla({ lineas }) {
  return (
    <Card className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm font-body">
        <caption className="sr-only">Comparación por artículo entre el pedido original y el facturado</caption>
        <thead>
          <tr className="border-b border-surface-700">
            <th scope="col" className={`${TH} text-left`}>Producto</th>
            <th scope="col" className={`${TH} text-right`}>Original</th>
            <th scope="col" className={`${TH} text-right`}>Facturado</th>
            <th scope="col" className={`${TH} text-right`}>Dif.</th>
            <th scope="col" className={`${TH} text-right`}>Dif. %</th>
            <th scope="col" className={`${TH} text-right hidden lg:table-cell`}>Precio orig.</th>
            <th scope="col" className={`${TH} text-right hidden lg:table-cell`}>Precio fact.</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => {
            const igual = esIgual(l)
            const difTono = difClase(l)
            return (
              <tr key={l.clave} className={`border-b border-surface-700/50 last:border-0 align-top ${filaClase(l)}`}>
                <td className="py-3 px-3 max-w-[16rem]">
                  <p className={`leading-tight break-words ${igual ? 'text-surface-300' : 'text-white'}`}>{nombre(l)}</p>
                  <div className="mt-1"><EstadoLinea l={l} /></div>
                  {/* Tablet: precios bajo el producto, sólo si cambiaron */}
                  {l.precioCambio && (
                    <p className="lg:hidden text-surface-400 text-xs font-mono tabular-nums mt-1">
                      Precio {fmt(l.precioOriginal)} → <span className="text-white">{fmt(l.precioFacturado)}</span>
                    </p>
                  )}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-surface-300">{l.cantidadOriginal}</td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-white">{l.cantidadFacturada}</td>
                <td className={`py-3 px-3 text-right font-mono tabular-nums ${difTono}`}>{signo(l.difUnidades)}</td>
                <td className={`py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap ${difTono}`}>{formatearPct(l)}</td>
                <td className="hidden lg:table-cell py-3 px-3 text-right font-mono tabular-nums text-surface-300 whitespace-nowrap">{monto(l.precioOriginal)}</td>
                <td className="hidden lg:table-cell py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                  <span className="text-white">{monto(l.precioFacturado)}</span>
                  <ConDescuento l={l} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

// ─── Contenedor ────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{idPedido:number}} props.pedido
 */
export default function ComparacionPedidoDialog({ open, onClose, pedido }) {
  const online = useOnlineStatus()
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

  // El slot `toolbar` de ResponsiveDialog ya aporta su padding y borde: acá sólo el control.
  const toolbar = estado === 'listo' && cmp && !cmp.sinOriginal && !cmp.resumen.sinDiferencias ? (
    <button
      type="button" role="switch" aria-checked={soloDiferencias} onClick={() => setSoloDiferencias((v) => !v)}
      className={`flex items-center gap-3 ${TOUCH} text-sm text-surface-200 font-body focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded-lg px-1`}
    >
      <span aria-hidden="true" className={`relative inline-block w-10 h-6 rounded-full transition-colors ${soloDiferencias ? 'bg-brand-500' : 'bg-surface-600'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform motion-reduce:transition-none ${soloDiferencias ? 'translate-x-4' : ''}`} />
      </span>
      Ver sólo líneas con diferencias
    </button>
  ) : null

  return (
    <ResponsiveDialog
      open={open} onClose={onClose} icon={ArrowLeftRight}
      title="Comparar original vs facturado" subtitle={`Pedido #${pedido.idPedido}`}
      toolbar={toolbar} busy={estado === 'cargando'} widthClass="min-[1025px]:max-w-4xl"
      iconClassName="text-surface-500"
    >
      <div className="p-4 sm:p-6 space-y-6">
        {!online && (
          <Aviso icono={WifiOff}>Sin conexión: los datos mostrados pueden estar desactualizados.</Aviso>
        )}

        {estado === 'cargando' && <ComparacionSkeleton />}

        {estado === 'error' && <ComparacionError mensaje={error} onRetry={cargar} />}

        {estado === 'listo' && cmp?.sinOriginal && (
          <EstadoVacio
            titulo={cmp.mensaje}
            detalle={esAnteriorAlFlujo(datos.pedido)
              ? 'Pedido anterior al nuevo flujo: no tiene original registrado, por eso no se calculan diferencias.'
              : 'Todavía no hay una versión facturada para comparar.'}
          />
        )}

        {estado === 'listo' && cmp && !cmp.sinOriginal && (
          <>
            <section aria-label="Resumen de la comparación" className="space-y-3">
              <SeccionTitulo>Resumen</SeccionTitulo>
              <Resumen r={cmp.resumen} />
              {cmp.resumen.sinDiferencias && (
                <Aviso icono={CheckCircle2} tono="ok">{MENSAJE_SIN_MODIFICACIONES}</Aviso>
              )}
              {!cmp.resumen.sinDiferencias && cmp.resumen.sinCambiosCantidad && (
                <Aviso icono={Info}>Las cantidades no cambiaron (0 %), pero hubo cambios de precio o descuentos.</Aviso>
              )}
            </section>

            <section aria-label="Detalle por artículo" className="space-y-3">
              <SeccionTitulo
                aside={<span className="text-surface-500 text-xs font-mono tabular-nums">{visibles.length} de {cmp.lineas.length} líneas</span>}
              >
                Detalle por artículo
              </SeccionTitulo>
              {visibles.length > 0 ? (
                <>
                  <LineasTarjetas lineas={visibles} />
                  <LineasTabla lineas={visibles} />
                </>
              ) : (
                <Card>
                  <EstadoVacio
                    icono={CheckCircle2}
                    titulo="No hay líneas con diferencias."
                    accion={<Button variant="secondary" onClick={() => setSoloDiferencias(false)} className={TOUCH}>Ver todas las líneas</Button>}
                  />
                </Card>
              )}
            </section>
          </>
        )}
      </div>
    </ResponsiveDialog>
  )
}
