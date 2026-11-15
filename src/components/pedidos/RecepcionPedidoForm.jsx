// src/components/pedidos/RecepcionPedidoForm.jsx
//
// «Registrar recepción» (Facturado → Recibido).
//   · Lista las líneas FACTURADAS con la cantidad recibida precargada (= facturada), editable.
//   · El stock sube SOLO con lo recibido, en una única operación atómica del servidor.
//   · Recibido distinto de lo facturado: advertencia previa a confirmar; el dato se guarda.
//     (La gestión de faltantes/sobrantes con el proveedor queda fuera de alcance.)
//   · Todas en 0 → se bloquea. Un mensaje por campo.
//
// Responsive: mobile → tarjetas · tablet/desktop → tabla. Sin scroll horizontal de la página.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, PackageCheck, RefreshCw, WifiOff } from 'lucide-react'
import { Badge, Button, Card, Modal, Spinner } from '../ui'
import { Campo, AvisoError, EtapasPedido, ETIQUETA } from './flujoUi'
import { TOUCH, fmtFecha } from './pedidosPresentacion'
import { hoyLocalISO, puedeRegistrarRecepcion } from '../../lib/pedidoFlujo'
import { validarRecepcion } from '../../lib/pedidoValidacion'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { crearGestorIdempotencia } from '../../services/pedidosGuardadoService'
import {
  FlujoPedidoError, obtenerPedidoParaFlujo, registrarRecepcion, construirArgumentosRecepcion, huellaDeArgumentos,
} from '../../services/pedidosFlujoService'
import { logger } from '../../lib/logger'

const TH = 'text-left text-surface-400 text-sm min-[1025px]:text-xs tracking-widest uppercase py-3 px-3 min-[1025px]:px-4 font-body'
const TD = 'py-3 px-3 min-[1025px]:px-4 align-top'

/**
 * @param {object} props
 * @param {{idPedido:number}} props.pedido
 * @param {() => void} props.onCancelar
 * @param {(resp: object) => void} props.onRegistrado  recibe el pedido ya Recibido
 */
export default function RecepcionPedidoForm({ pedido, onCancelar, onRegistrado }) {
  const idBase = useId()
  const online = useOnlineStatus()
  const { isMobile } = useBreakpoint()
  const gestorIdem = useRef(crearGestorIdempotencia())

  const [carga, setCarga] = useState('cargando') // 'cargando' | 'listo' | 'error' | 'no_aplica'
  const [errorCarga, setErrorCarga] = useState('')
  const [ped, setPed] = useState(null)
  const [lineas, setLineas] = useState([]) // { idDetallePedido, nombreProducto, idProducto, medida, tieneMedidas, cantidadFacturada, cantidadRecibida:string }
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
      if (!puedeRegistrarRecepcion(p)) { setCarga('no_aplica'); return }
      setLineas(detalles.map((d) => ({
        idDetallePedido: d.idDetallePedido, idProducto: d.idProducto, nombreProducto: d.nombreProducto,
        medida: d.medida ?? null, tieneMedidas: d.tieneMedidas,
        cantidadFacturada: d.cantidad, cantidadRecibida: String(d.cantidad), // precargada = facturada
      })))
      setCarga('listo')
    } catch (err) {
      logger.error('recepcion.carga.error', { error: err })
      setErrorCarga(err instanceof FlujoPedidoError ? err.message : 'No se pudo cargar el pedido.')
      setCarga('error')
    }
  }, [pedido.idPedido])

  useEffect(() => { cargar() }, [cargar])

  const v = useMemo(() => validarRecepcion(lineas), [lineas])
  const advPorIndice = useMemo(() => Object.fromEntries(v.advertencias.map((a) => [a.indice, a])), [v])

  // Producto con medidas sin medida cargada: el servidor lo rechazaría; se avisa antes.
  const errorMedida = (l) => (l.tieneMedidas && !l.medida && Number(l.cantidadRecibida) > 0
    ? 'Esta línea no tiene medida. Editá el pedido y elegí la medida antes de recibirlo.' : null)

  const errorFecha = !fecha ? 'Ingresá la fecha de recepción.'
    : (ped && fecha < ped.fecha ? 'La fecha no puede ser anterior a la fecha del pedido.' : null)

  const hayMedidaFaltante = lineas.some((l) => errorMedida(l))
  const bloqueado = !v.ok || Boolean(errorFecha) || hayMedidaFaltante

  const cambiar = (i, valor) => setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, cantidadRecibida: valor } : l)))

  const intentar = () => {
    setIntentado(true)
    setErrorEnvio(null)
    if (bloqueado) {
      const i = lineas.findIndex((l, k) => v.errores[k] || errorMedida(l))
      if (i >= 0) document.getElementById(`${idBase}-rec-${i}`)?.focus()
      else if (errorFecha) document.getElementById(`${idBase}-fecha`)?.focus()
      return
    }
    setConfirmar(true)
  }

  const registrar = async () => {
    if (enviando) return
    setEnviando(true)
    setErrorEnvio(null)
    const params = { idPedido: ped.idPedido, lineas, fechaRecepcion: fecha }
    try {
      const huella = huellaDeArgumentos(construirArgumentosRecepcion({ ...params, idempotencyKey: '_' }))
      const resp = await registrarRecepcion({ ...params, idempotencyKey: gestorIdem.current.obtener(huella) })
      gestorIdem.current.reiniciar()
      onRegistrado?.(resp)
    } catch (err) {
      logger.error('recepcion.registro.error', { error: err })
      setErrorEnvio(err instanceof FlujoPedidoError ? err : new FlujoPedidoError('No se pudo registrar la recepción.'))
      setConfirmar(false)
    } finally {
      setEnviando(false)
    }
  }

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
            : <p className="text-surface-200 text-sm font-body">Sólo se puede registrar la recepción de un pedido en etapa Facturado.</p>}
          {carga === 'error' && <Button variant="secondary" icon={RefreshCw} onClick={cargar} className={TOUCH}>Reintentar</Button>}
        </Card>
      </div>
    )
  }

  const totalRecibido = lineas.reduce((a, l, i) => a + (v.errores[i] ? 0 : Number(l.cantidadRecibida) || 0), 0)
  const totalFacturado = lineas.reduce((a, l) => a + l.cantidadFacturada, 0)

  const campoCantidad = (l, i) => (
    <Campo label="Cantidad recibida" id={`${idBase}-rec-${i}`} inputMode="numeric" autoComplete="off"
      value={l.cantidadRecibida} ocultarEtiquetaDesktop
      error={v.errores[i] ?? errorMedida(l)}
      onChange={(e) => cambiar(i, e.target.value)} />
  )

  const aviso = (i) => advPorIndice[i] && !v.errores[i] && (
    <p className="text-amber-300 text-sm min-[1025px]:text-xs font-body flex items-center gap-1.5 mt-1">
      <AlertTriangle size={12} aria-hidden="true" />
      {advPorIndice[i].tipo === 'menor'
        ? `Faltan ${advPorIndice[i].facturada - advPorIndice[i].recibida} u. respecto de lo facturado`
        : `Sobran ${advPorIndice[i].recibida - advPorIndice[i].facturada} u. respecto de lo facturado`}
    </p>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" icon={ArrowLeft} onClick={onCancelar} className={`-ml-2 ${TOUCH}`}>Volver al pedido</Button>
        <EtapasPedido estado="facturado" />
      </div>

      <Card className="p-4 sm:p-6 space-y-4">
        <div>
          <p className={`${ETIQUETA} mb-1`}>Registrar recepción</p>
          <h2 className="font-display text-3xl sm:text-4xl text-white tracking-widest">Pedido #{ped.idPedido}</h2>
          <p className="text-surface-300 text-sm font-body mt-2">
            Indicá cuánto llegó de cada línea. El stock del Inventario sube <strong>sólo</strong> con las cantidades recibidas,
            no con las pedidas ni las facturadas.
          </p>
        </div>
        {!online && (
          <div role="status" className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-300 text-sm font-body">
            <WifiOff size={16} aria-hidden="true" /> Sin conexión: no se podrá registrar hasta reconectar.
          </div>
        )}
        <div className="max-w-xs">
          <Campo label="Fecha de recepción" id={`${idBase}-fecha`} type="date" value={fecha} min={ped.fecha}
            error={intentado ? errorFecha : null} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-surface-700 flex items-center justify-between gap-3">
          <h3 className="font-body font-semibold text-white text-sm">Líneas facturadas</h3>
          <span className="text-surface-300 text-sm min-[1025px]:text-xs font-mono" aria-live="polite">
            Recibido {totalRecibido} / Facturado {totalFacturado}
          </span>
        </div>

        {intentado && v.general && <div className="px-4 sm:px-6 pt-4"><AvisoError>{v.general}</AvisoError></div>}

        {/* Un solo árbol según el breakpoint (evita ids duplicados). El estado vive en el padre:
            rotar el equipo no pierde lo cargado. */}
        {isMobile ? (
        <ul className="p-3 space-y-3" aria-label="Líneas a recibir">
          {lineas.map((l, i) => (
            <li key={l.idDetallePedido} className="bg-surface-800/60 border border-surface-700 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-base font-body break-words">{l.nombreProducto ?? `#${l.idProducto}`}</p>
                  <p className="text-surface-300 text-sm font-mono">ID {l.idProducto}</p>
                </div>
                {l.medida && <Badge color="blue">{l.medida}</Badge>}
              </div>
              <p className="text-surface-300 text-sm font-body">Facturado: <span className="font-mono text-white">{l.cantidadFacturada}</span></p>
              {campoCantidad(l, i)}
              {aviso(i)}
            </li>
          ))}
        </ul>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="border-b border-surface-700">
                <th scope="col" className={TH}>ID</th>
                <th scope="col" className={TH}>Producto</th>
                <th scope="col" className={TH}>Medida</th>
                <th scope="col" className={`${TH} text-right`}>Facturado</th>
                <th scope="col" className={`${TH} w-48`}>Recibido</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={l.idDetallePedido} className="border-b border-surface-700/50">
                  <td className={`${TD} text-surface-400 font-mono text-xs`}>#{l.idProducto}</td>
                  <td className={`${TD} text-white`}>{l.nombreProducto ?? `#${l.idProducto}`}</td>
                  <td className={TD}>{l.medida ? <Badge color="blue">{l.medida}</Badge> : <span className="text-surface-500 text-xs">—</span>}</td>
                  <td className={`${TD} text-surface-200 font-mono text-right`}>{l.cantidadFacturada}</td>
                  <td className={TD}>{campoCantidad(l, i)}{aviso(i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>

      {errorEnvio && (
        <AvisoError>
          {errorEnvio.message}
          {errorEnvio.reintentable && ' Podés reintentar: el stock no se sumará dos veces.'}
        </AvisoError>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pb-[env(safe-area-inset-bottom)]">
        <Button variant="secondary" className={`${TOUCH} sm:min-w-32`} onClick={onCancelar} disabled={enviando}>Cancelar</Button>
        <Button icon={PackageCheck} className={`${TOUCH} sm:min-w-52`} onClick={intentar} disabled={!online || enviando}>
          Registrar recepción
        </Button>
      </div>
      {intentado && bloqueado && (
        <p role="alert" className="text-red-400 text-sm font-body sm:text-right">Revisá los campos marcados antes de confirmar.</p>
      )}

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Confirmar recepción" width="max-w-md" busy={enviando}>
        <p className="text-surface-300 text-sm font-body mb-3">
          Se registrará la recepción del pedido <span className="text-white font-mono">#{ped.idPedido}</span> con fecha{' '}
          <span className="text-white font-mono">{fmtFecha(fecha)}</span>.
        </p>
        {v.advertencias.length > 0 && (
          <div className="mb-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2" role="alert">
            <p className="text-amber-300 text-sm font-body font-semibold flex items-center gap-2">
              <AlertTriangle size={14} aria-hidden="true" />
              {v.advertencias.length} línea{v.advertencias.length !== 1 ? 's' : ''} difiere{v.advertencias.length !== 1 ? 'n' : ''} de lo facturado
            </p>
            <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {v.advertencias.map((a) => (
                <li key={a.indice} className="text-amber-200 text-sm min-[1025px]:text-xs font-body break-words">
                  {lineas[a.indice].nombreProducto ?? `#${lineas[a.indice].idProducto}`}: facturado {a.facturada}, recibido {a.recibida}
                </li>
              ))}
            </ul>
            <p className="text-amber-200/80 text-sm min-[1025px]:text-xs font-body mt-2">
              El stock se actualizará con lo recibido. Los reclamos o ajustes con el proveedor no se gestionan acá.
            </p>
          </div>
        )}
        <p className="text-emerald-400 text-sm min-[1025px]:text-xs font-body mb-6 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2">
          Se sumarán {totalRecibido} unidad{totalRecibido !== 1 ? 'es' : ''} al Inventario. Esta acción no se puede deshacer.
        </p>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="secondary" className={`flex-1 ${TOUCH}`} onClick={() => setConfirmar(false)} disabled={enviando}>Volver</Button>
          <Button className={`flex-1 ${TOUCH}`} icon={PackageCheck} onClick={registrar}>Confirmar recepción</Button>
        </div>
      </Modal>
    </div>
  )
}
