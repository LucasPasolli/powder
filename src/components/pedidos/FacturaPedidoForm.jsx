// src/components/pedidos/FacturaPedidoForm.jsx
//
// «Registrar factura» (Original → Facturado).
//   · Precarga las líneas del original como base EDITABLE (T1 esc. 4).
//   · Ajustar cantidades, quitar líneas (el proveedor no las envió; se pueden restaurar),
//     agregar líneas nuevas y cargar el precio con descuento por línea (T5 esc. 1).
//   · Un mensaje por campo; guardado bloqueado si hay errores o no queda ninguna línea.
//   · Confirmación previa (la acción congela el original y no se deshace).
//   · Idempotente: la clave viaja atada al contenido (misma huella → misma clave).
//
// Responsive (mobile < 768 · tablet 768–1024 · desktop ≥ 1025):
//   mobile  → cada línea es una tarjeta con campos en 2 columnas, sin scroll horizontal.
//   tablet  → tarjeta con 4 columnas de campos.
//   desktop → fila tipo tabla con cabecera de columnas.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Plus, RotateCcw, Search, Trash2, WifiOff, ReceiptText, RefreshCw } from 'lucide-react'
import { Badge, Button, Card, Modal, Spinner } from '../ui'
import { Campo, AvisoError, EtapasPedido, ETIQUETA } from './flujoUi'
import { TOUCH, fmt, fmtFecha } from './pedidosPresentacion'
import { MEDIDAS_VALIDAS } from '../../lib/medidasProducto'
import { hoyLocalISO, puedeRegistrarFactura } from '../../lib/pedidoFlujo'
import { parsearCantidad, parsearPrecio, validarFactura } from '../../lib/pedidoValidacion'
import { redondear2 } from '../../lib/pedidoComparacion'
import { buscarPorNombre, parsearIdProducto, sanitizarDigitosId } from '../../lib/busquedaProductos'
import { useCatalogoProductos } from '../../hooks/useCatalogoProductos'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { crearGestorIdempotencia } from '../../services/pedidosGuardadoService'
import {
  FlujoPedidoError, obtenerPedidoParaFlujo, registrarFactura, construirArgumentosFactura, huellaDeArgumentos,
} from '../../services/pedidosFlujoService'
import { logger } from '../../lib/logger'

/** Rejilla de una línea: 2 cols (mobile) → 4 (tablet) → 7 (desktop). */
const GRID_LINEA = `grid grid-cols-2 gap-3 md:grid-cols-4
  min-[1025px]:grid-cols-[minmax(0,2.4fr)_6rem_6.5rem_7.5rem_7.5rem_7rem_2.75rem] min-[1025px]:items-start`

let secuencia = 0
const nuevaKey = () => `l${++secuencia}`

/** Importe de una línea a partir del texto de los campos (0 si todavía no es válido). */
function subtotalDe(l) {
  const c = parsearCantidad(l.cantidad).valor
  const lista = parsearPrecio(l.precioUnitario)
  const desc = l.precioConDescuento?.toString().trim() ? parsearPrecio(l.precioConDescuento) : null
  if (c === null || lista === null) return 0
  return redondear2(c * (desc ?? lista))
}

// ─── Buscador para agregar una línea nueva ───────────────────────────────────

function BuscadorLineaNueva({ onAgregar }) {
  const idBase = useId()
  const online = useOnlineStatus()
  const { estado, productos, reintentar, refrescarSiVencido } = useCatalogoProductos()
  const [texto, setTexto] = useState('')

  const { items, total } = useMemo(() => {
    const t = texto.trim()
    if (!t) return { items: [], total: 0 }
    if (/^\d+$/.test(t)) {
      const id = parsearIdProducto(sanitizarDigitosId(t))
      const p = id ? productos.find((x) => x.idProducto === id) : null
      return { items: p ? [p] : [], total: p ? 1 : 0 }
    }
    return buscarPorNombre(productos, t, { limite: 8 })
  }, [texto, productos])

  const elegir = (p) => {
    onAgregar(p)
    setTexto('')
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`${idBase}-q`} className={ETIQUETA}>Agregar producto (por nombre o ID)</label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" aria-hidden="true" />
        <input
          id={`${idBase}-q`} type="search" value={texto} autoComplete="off"
          onFocus={refrescarSiVencido} onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej.: lente 1.50 o 1234"
          disabled={estado !== 'listo'}
          aria-describedby={`${idBase}-ayuda`}
          className="w-full bg-surface-700 border border-surface-600 rounded-xl pl-10 pr-3 py-2.5 min-h-[44px] text-white text-base
                     min-[1025px]:text-sm min-[1025px]:min-h-0 font-body placeholder-surface-500 focus:outline-none focus:border-brand-500
                     focus:ring-1 focus:ring-brand-500/30 disabled:opacity-60"
        />
      </div>

      <p id={`${idBase}-ayuda`} role="status" className="text-surface-400 text-sm min-[1025px]:text-xs font-body">
        {estado === 'cargando' && 'Cargando catálogo…'}
        {estado === 'listo' && texto.trim() && `${total} resultado${total === 1 ? '' : 's'}${total > items.length ? ` (mostrando ${items.length})` : ''}`}
        {estado === 'listo' && !texto.trim() && 'Escribí para buscar en el catálogo de productos activos.'}
      </p>

      {estado === 'error' && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-amber-300 text-sm font-body flex items-center gap-2">
            {!online && <WifiOff size={14} aria-hidden="true" />}
            No se pudo cargar el catálogo.
          </p>
          <Button size="sm" variant="secondary" icon={RefreshCw} className={TOUCH} onClick={reintentar}>Reintentar</Button>
        </div>
      )}

      {items.length > 0 && (
        <ul className="border border-surface-700 rounded-xl divide-y divide-surface-700/60 max-h-64 overflow-y-auto" aria-label="Resultados">
          {items.map((p) => (
            <li key={p.idProducto}>
              <button
                type="button" onClick={() => elegir(p)}
                className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-surface-700 focus-visible:bg-surface-700 focus:outline-none
                           focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/60"
              >
                <span className="block text-white text-sm font-body break-words">{p.nombre}</span>
                <span className="block text-surface-400 text-xs font-mono">ID {p.idProducto}{p.tieneMedidas ? ' · con medidas' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {estado === 'listo' && texto.trim() && items.length === 0 && (
        <p className="text-surface-400 text-sm font-body">Sin resultados.</p>
      )}
    </div>
  )
}

// ─── Una línea ───────────────────────────────────────────────────────────────

function LineaFactura({ l, errores = {}, onCambio, onQuitar, idBase }) {
  const cant = parsearCantidad(l.cantidad)
  const difiere = !l.esNueva && cant.valor !== null && cant.valor !== l.cantidadPedida
  const sub = subtotalDe(l)
  const f = (campo) => `${idBase}-${l.key}-${campo}`

  return (
    <li className="bg-surface-800/60 border border-surface-700 rounded-xl p-3 sm:p-4" data-linea={l.key}>
      <div className={GRID_LINEA}>
        {/* Producto */}
        <div className="col-span-2 md:col-span-4 min-[1025px]:col-span-1 min-w-0 space-y-2">
          <p className="text-white text-base min-[1025px]:text-sm font-body break-words">{l.nombreProducto ?? `#${l.idProducto}`}</p>
          <p className="text-surface-400 text-sm min-[1025px]:text-xs font-mono flex flex-wrap items-center gap-2">
            ID {l.idProducto}
            {l.esNueva
              ? <Badge color="green">Nueva</Badge>
              : <span>Pedido original: {l.cantidadPedida}</span>}
          </p>
          {l.tieneMedidas && (
            <Campo as="select" label="Medida" id={f('medida')} value={l.medida ?? ''} error={errores.medida}
              onChange={(e) => onCambio(l.key, { medida: e.target.value || null })}>
              <option value="">Elegí una medida</option>
              {MEDIDAS_VALIDAS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Campo>
          )}
        </div>

        <Campo label="Cantidad" id={f('cantidad')} inputMode="numeric" autoComplete="off" value={l.cantidad}
          error={errores.cantidad} ocultarEtiquetaDesktop
          onChange={(e) => onCambio(l.key, { cantidad: e.target.value })} />

        <Campo label="Precio de lista" id={f('precio')} inputMode="decimal" autoComplete="off" value={l.precioUnitario}
          error={errores.precio} ocultarEtiquetaDesktop
          onChange={(e) => onCambio(l.key, { precioUnitario: e.target.value })} />

        <Campo label="Precio c/ descuento" id={f('descuento')} inputMode="decimal" autoComplete="off" value={l.precioConDescuento}
          placeholder="Opcional" error={errores.descuento} ocultarEtiquetaDesktop
          onChange={(e) => onCambio(l.key, { precioConDescuento: e.target.value })} />

        <div className="space-y-1">
          <span className={`${ETIQUETA} min-[1025px]:sr-only`}>Subtotal</span>
          <p className="text-white font-mono font-semibold text-base min-[1025px]:text-sm min-h-[44px] min-[1025px]:min-h-0 flex items-center">
            {fmt(sub)}
          </p>
          {difiere && (
            <p className="text-amber-300 text-sm min-[1025px]:text-xs font-body">
              {cant.valor < l.cantidadPedida ? 'Menos' : 'Más'} que lo pedido
            </p>
          )}
        </div>

        <div className="col-span-2 md:col-span-4 min-[1025px]:col-span-1 min-[1025px]:pt-5">
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onQuitar(l.key)}
            className={`${TOUCH} w-full min-[1025px]:w-auto`}
            aria-label={`Quitar ${l.nombreProducto ?? `producto ${l.idProducto}`} del pedido`}>
            <span className="min-[1025px]:sr-only">Quitar línea</span>
          </Button>
        </div>
      </div>
    </li>
  )
}

// ─── Pantalla ────────────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {{idPedido:number}} props.pedido
 * @param {() => void} props.onCancelar
 * @param {(resp: object) => void} props.onRegistrado  recibe el pedido ya Facturado
 */
export default function FacturaPedidoForm({ pedido, onCancelar, onRegistrado }) {
  const idBase = useId()
  const online = useOnlineStatus()
  const gestorIdem = useRef(crearGestorIdempotencia())

  const [carga, setCarga] = useState('cargando') // 'cargando' | 'listo' | 'error' | 'no_aplica'
  const [errorCarga, setErrorCarga] = useState('')
  const [ped, setPed] = useState(null)
  const [lineas, setLineas] = useState([])
  const [fecha, setFecha] = useState(hoyLocalISO())
  const [intentado, setIntentado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState(null)

  const cargar = useCallback(async () => {
    setCarga('cargando')
    setErrorCarga('')
    try {
      const { pedido: p, detalles } = await obtenerPedidoParaFlujo(pedido.idPedido)
      setPed(p)
      if (!puedeRegistrarFactura(p)) { setCarga('no_aplica'); return }
      setLineas(detalles.map((d) => ({
        key: nuevaKey(), idProducto: d.idProducto, nombreProducto: d.nombreProducto, medida: d.medida ?? null,
        tieneMedidas: d.tieneMedidas, cantidad: String(d.cantidad), cantidadPedida: d.cantidad,
        precioUnitario: String(d.precioUnitario), precioConDescuento: '', esNueva: false, quitada: false,
      })))
      setCarga('listo')
    } catch (err) {
      logger.error('factura.carga.error', { error: err })
      setErrorCarga(err instanceof FlujoPedidoError ? err.message : 'No se pudo cargar el pedido.')
      setCarga('error')
    }
  }, [pedido.idPedido])

  useEffect(() => { cargar() }, [cargar])

  const activas = useMemo(() => lineas.filter((l) => !l.quitada), [lineas])
  const quitadas = useMemo(() => lineas.filter((l) => l.quitada), [lineas])

  const validacion = useMemo(() => validarFactura(activas), [activas])
  const errorFecha = !fecha ? 'Ingresá la fecha de facturación.'
    : (ped && fecha < ped.fecha ? 'La fecha no puede ser anterior a la fecha del pedido.' : null)
  const erroresPorKey = useMemo(
    () => Object.fromEntries(Object.entries(validacion.errores).map(([i, e]) => [activas[Number(i)].key, e])),
    [validacion, activas])

  const total = redondear2(activas.reduce((a, l) => a + subtotalDe(l), 0))
  const totalOriginal = ped?.monto ?? 0
  const dif = redondear2(total - totalOriginal)

  const cambiar = (key, parche) => setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...parche } : l)))
  const quitar = (key) => setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, quitada: true } : l)))
  const restaurar = (key) => setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, quitada: false } : l)))
  const quitarNueva = (key) => setLineas((prev) => prev.filter((l) => !(l.key === key && l.esNueva)))

  const agregar = (p) => {
    const key = nuevaKey()
    setLineas((prev) => [...prev, {
      key, idProducto: p.idProducto, nombreProducto: p.nombre, medida: null, tieneMedidas: Boolean(p.tieneMedidas),
      cantidad: '1', cantidadPedida: 0, precioUnitario: '', precioConDescuento: '', esNueva: true, quitada: false,
    }])
    // El foco va al precio de la línea nueva (la cantidad ya viene en 1).
    requestAnimationFrame(() => document.getElementById(`${idBase}-${key}-precio`)?.focus())
  }

  const intentarRegistrar = () => {
    setIntentado(true)
    setErrorEnvio(null)
    if (!validacion.ok || errorFecha) {
      const primera = activas.find((l) => erroresPorKey[l.key])
      if (primera) {
        const campo = ['cantidad', 'precio', 'descuento', 'medida'].find((c) => erroresPorKey[primera.key][c])
        document.getElementById(`${idBase}-${primera.key}-${campo}`)?.focus()
      } else if (errorFecha) document.getElementById(`${idBase}-fecha`)?.focus()
      return
    }
    setConfirmar(true)
  }

  const registrar = async () => {
    if (enviando) return
    setEnviando(true)
    setErrorEnvio(null)
    const params = { idPedido: ped.idPedido, detalles: activas, fechaFacturacion: fecha }
    try {
      const huella = huellaDeArgumentos(construirArgumentosFactura({ ...params, idempotencyKey: '_' }))
      const resp = await registrarFactura({ ...params, idempotencyKey: gestorIdem.current.obtener(huella) })
      gestorIdem.current.reiniciar()
      onRegistrado?.(resp)
    } catch (err) {
      logger.error('factura.registro.error', { error: err })
      setErrorEnvio(err instanceof FlujoPedidoError ? err : new FlujoPedidoError('No se pudo registrar la factura.'))
      setConfirmar(false)
    } finally {
      setEnviando(false)
    }
  }

  // ── Estados límite ──
  if (carga === 'cargando') {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center gap-3 py-20 text-surface-300 font-body" aria-busy="true">
        <Spinner label="Cargando pedido" /> Cargando pedido…
      </div>
    )
  }
  if (carga === 'error' || carga === 'no_aplica') {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" icon={ArrowLeft} onClick={onCancelar} className={TOUCH}>Volver al pedido</Button>
        <Card className="p-6 space-y-4">
          {carga === 'error'
            ? <AvisoError>{errorCarga}{!online && ' Sin conexión.'}</AvisoError>
            : <p className="text-surface-200 text-sm font-body">Este pedido ya no está en etapa Original, por lo que no se puede registrar su factura.</p>}
          {carga === 'error' && <Button variant="secondary" icon={RefreshCw} onClick={cargar} className={TOUCH}>Reintentar</Button>}
        </Card>
      </div>
    )
  }

  const mostrarErrores = intentado
  const hayErrores = !validacion.ok || Boolean(errorFecha)

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" icon={ArrowLeft} onClick={onCancelar} className={`-ml-2 ${TOUCH}`}>Volver al pedido</Button>
        <EtapasPedido estado="original" />
      </div>

      <Card className="p-4 sm:p-6 space-y-4">
        <div>
          <p className={`${ETIQUETA} mb-1`}>Registrar factura</p>
          <h2 className="font-display text-3xl sm:text-4xl text-white tracking-widest">Pedido #{ped.idPedido}</h2>
          <p className="text-surface-300 text-sm font-body mt-2">
            Las líneas del pedido original están precargadas. Ajustá cantidades, quitá lo que el proveedor no envió,
            agregá lo que sumó y, si corresponde, cargá el precio con descuento. El pedido original se conserva sin cambios.
          </p>
        </div>

        {!online && (
          <div role="status" className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-300 text-sm font-body">
            <WifiOff size={16} aria-hidden="true" /> Sin conexión: podés seguir cargando, pero no se podrá registrar hasta reconectar.
          </div>
        )}

        <div className="max-w-xs">
          <Campo label="Fecha de facturación" id={`${idBase}-fecha`} type="date" value={fecha} min={ped.fecha}
            error={mostrarErrores ? errorFecha : null} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-surface-700 flex items-center gap-3">
          <h3 className="font-body font-semibold text-white text-sm">Líneas facturadas</h3>
          <span className="text-surface-400 text-sm min-[1025px]:text-xs font-mono">{activas.length} ítem{activas.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Cabecera de columnas: sólo desktop (en mobile/tablet cada campo lleva su etiqueta). */}
        <div className="hidden min-[1025px]:block px-4 pt-3" aria-hidden="true">
          <div className="grid grid-cols-[minmax(0,2.4fr)_6rem_6.5rem_7.5rem_7.5rem_7rem_2.75rem] gap-3 px-4">
            {['Producto', 'Cantidad', 'Precio lista', 'Precio c/ desc.', 'Subtotal', '', ''].map((h, i) => (
              <span key={i} className={ETIQUETA}>{h}</span>
            ))}
          </div>
        </div>

        {mostrarErrores && validacion.general && <div className="px-4 sm:px-6 pt-4"><AvisoError>{validacion.general}</AvisoError></div>}

        <ul className="p-3 sm:p-4 space-y-3" aria-label="Líneas del pedido facturado">
          {activas.map((l) => (
            <LineaFactura key={l.key} l={l} idBase={idBase} errores={mostrarErrores ? erroresPorKey[l.key] : {}}
              onCambio={cambiar} onQuitar={l.esNueva ? quitarNueva : quitar} />
          ))}
          {activas.length === 0 && (
            <li className="text-center py-8 text-surface-400 text-sm font-body">No quedan líneas. Restaurá alguna o agregá un producto.</li>
          )}
        </ul>

        {quitadas.length > 0 && (
          <div className="px-4 sm:px-6 pb-4 space-y-2">
            <p className={ETIQUETA}>Quitadas (no facturadas)</p>
            <ul className="space-y-2">
              {quitadas.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-3 bg-surface-900/40 border border-surface-700 rounded-xl px-3 py-2">
                  <span className="text-surface-300 text-sm font-body line-through break-words min-w-0">
                    {l.nombreProducto ?? `#${l.idProducto}`}{l.medida ? ` · ${l.medida}` : ''} · {l.cantidadPedida} u.
                  </span>
                  <Button size="sm" variant="secondary" icon={RotateCcw} className={`${TOUCH} flex-shrink-0`} onClick={() => restaurar(l.key)}>
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="px-4 sm:px-6 py-4 border-t border-surface-700">
          <BuscadorLineaNueva onAgregar={agregar} />
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <dl className="space-y-2 text-sm font-body max-w-md ml-auto">
          <div className="flex justify-between gap-6 text-surface-400"><dt>Total del pedido original</dt><dd className="font-mono">{fmt(totalOriginal)}</dd></div>
          <div className="flex justify-between gap-6 text-surface-400">
            <dt>Diferencia</dt>
            <dd className={`font-mono ${dif < 0 ? 'text-emerald-400' : dif > 0 ? 'text-amber-300' : ''}`}>{dif > 0 ? '+' : ''}{fmt(dif)}</dd>
          </div>
          <div className="flex justify-between gap-6 border-t border-surface-700 pt-2">
            <dt className="text-white font-semibold">Total facturado</dt>
            <dd className="text-brand-400 font-mono font-bold text-lg" aria-live="polite">{fmt(total)}</dd>
          </div>
        </dl>
      </Card>

      {errorEnvio && (
        <AvisoError>
          {errorEnvio.message}
          {errorEnvio.reintentable && ' Podés reintentar: no se duplicará la factura.'}
        </AvisoError>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
        <Button variant="secondary" className={`${TOUCH} sm:min-w-32`} onClick={onCancelar} disabled={enviando}>Cancelar</Button>
        <Button icon={ReceiptText} className={`${TOUCH} sm:min-w-48`} onClick={intentarRegistrar} disabled={!online || enviando}
          aria-describedby={intentado && hayErrores ? `${idBase}-resumen` : undefined}>
          Registrar factura
        </Button>
      </div>
      {intentado && hayErrores && (
        <p id={`${idBase}-resumen`} role="alert" className="text-red-400 text-sm font-body sm:text-right">
          Revisá los campos marcados antes de registrar la factura.
        </p>
      )}

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Confirmar factura" width="max-w-sm" busy={enviando}>
        <p className="text-surface-300 text-sm font-body mb-3">
          Se registrará la factura del pedido <span className="text-white font-mono">#{ped.idPedido}</span> con fecha{' '}
          <span className="text-white font-mono">{fmtFecha(fecha)}</span> por <span className="text-brand-400 font-mono">{fmt(total)}</span>.
        </p>
        <p className="text-amber-300 text-sm min-[1025px]:text-xs font-body mb-6 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
          El pedido original quedará guardado sin cambios y esta acción no se puede deshacer. El stock no se modifica hasta registrar la recepción.
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="secondary" className={`flex-1 ${TOUCH}`} onClick={() => setConfirmar(false)} disabled={enviando}>Volver</Button>
          <Button className={`flex-1 ${TOUCH}`} icon={ReceiptText} onClick={registrar}>Confirmar</Button>
        </div>
      </Modal>
    </div>
  )
}
