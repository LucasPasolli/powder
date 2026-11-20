// src/pages/Saldos.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { usePaginatedList } from '../hooks/usePaginatedList'
import { useScrollAnchor } from '../hooks/useScrollToTopOnChange'
import { useScrollToTopOnView } from '../hooks/useScrollToTopOnView'
import { useDebounce } from '../hooks/useDebounce'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import {
  obtenerSaldosPagina,
  obtenerKPIsSaldos,
  marcarSaldoPagado,
} from '../services/saldosService'
import { obtenerClientePorId }                    from '../services/clientesService'
import { obtenerPresupuestoPorId }                from '../services/presupuestosService'
import { obtenerDetallesConNombreDePresupuesto }   from '../services/presupuestosService'
import {
  buscarClientesConDeuda,
  obtenerSaldosImputablesDeCliente,
  previsualizarImputacion,
  registrarPagoParcial,
  obtenerAplicacionesDeSaldo,
} from '../services/pagosService'
import { Card, PageHeader, Button, Badge, Modal } from '../components/ui'
import NotasRegistro from '../components/notas/NotasRegistro'
import FiltrosMovil, { BuscadorListado } from '../components/ui/FiltrosMovil'
import KpiCard from '../components/ui/KpiCard'
import PaginadorListado from '../components/ui/PaginadorListado'
import DateField from '../components/ui/DateField'
import { ALTO_CONTROL, CLASE_ETIQUETA } from '../components/ui/controles'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useRangoFechaAplicado } from '../hooks/useRangoFechaAplicado'
import { hoyISO, formatearFechaDMA } from '../lib/fechas'
import {
  CAMPO_FECHA_PAGO, ORDEN_DEFAULT,
  alternarOrdenFechaPago, normalizarOrden, opcionesOrden, ordenPorDefecto, parseOrden, permiteOrdenFechaPago,
  validarRangoFechaPago,
} from '../lib/saldosFiltros'
import {
  ArrowLeft, Wallet, Clock, CheckCircle2, AlertTriangle, AlertCircle,
  CalendarClock, User, FileText, BadgeCheck, Search, ChevronDown, ChevronUp, ChevronsUpDown, ArrowRight, ArrowUpDown,
  Coins, Loader2, X, History, Eye, WifiOff,
} from 'lucide-react'

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n ?? 0)
}

// dd/mm/aaaa o «—» (nulo, vacío o inválido). Reordena texto: sin `new Date`, sin desfase de huso.
const fmtFecha = (iso) => formatearFechaDMA(iso)

// «Hoy» en America/Argentina/Buenos_Aires (no en UTC: después de las 21:00 locales UTC ya es mañana).
const today = hoyISO

function diasRestantes(fechaFin) {
  const hoy  = new Date(today())
  const fin  = new Date(fechaFin)
  const diff = Math.round((fin - hoy) / (1000 * 60 * 60 * 24))
  return diff
}

function colorDias(dias) {
  if (dias < 0)  return { text: 'text-red-400',    bg: 'bg-red-500/10    border-red-500/30' }
  if (dias <= 5) return { text: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/30' }
  return              { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' }
}

function labelDias(dias) {
  if (dias < 0)  return `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`
  if (dias === 0) return 'Vence hoy'
  return `${dias} día${dias !== 1 ? 's' : ''} restante${dias !== 1 ? 's' : ''}`
}

// CORRECCIÓN #8: helper centralizado de estado → label/color de Badge,
// para que 'parcial' se vea consistente en toda la vista (lista + detalle).
function estadoInfo(estado) {
  switch (estado) {
    case 'pagado':  return { label: 'Cobrado',      color: 'green'  }
    case 'parcial': return { label: 'Pago Parcial', color: 'blue'   }
    default:        return { label: 'Pendiente',    color: 'yellow' }
  }
}

const PAGE_SIZE = 25

// ─── Toast ─────────────────────────────────────────────────────────────────

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div role="status" aria-live="polite"
         className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] sm:inset-x-auto sm:right-5 sm:top-5 z-[9999] pointer-events-none">
      <div className="flex items-center gap-3 bg-emerald-900/95 border border-emerald-500/50
                      rounded-2xl px-4 sm:px-5 py-3 shadow-2xl animate-slide-up">
        <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
        <span className="text-emerald-100 text-sm font-body">{message}</span>
      </div>
    </div>
  )
}

// ─── Modal: Registrar Pago Parcial ──────────────────────────────────────────
//
// Flujo en dos pasos:
//   1) Buscar y seleccionar el cliente (solo aparecen clientes con deuda).
//   2) Ingresar monto/método/fecha, ver la previsualización de imputación
//      cronológica y confirmar. El cálculo real y persistido lo hace el
//      servidor (fn_aplicar_pago_cliente); esta preview es solo UX.

function PagoParcialModal({ open, onClose, onSuccess }) {
  const [query, setQuery]                   = useState('')
  const [buscando, setBuscando]              = useState(false)
  const [resultados, setResultados]          = useState([])
  const [cliente, setCliente]                = useState(null)
  const [saldosCliente, setSaldosCliente]    = useState([])
  const [cargandoSaldos, setCargandoSaldos]  = useState(false)
  const [monto, setMonto]                    = useState('')
  const [metodoPago, setMetodoPago]          = useState('efectivo')
  const [fecha, setFecha]                    = useState(today())
  const [descripcion, setDescripcion]        = useState('')
  const [enviando, setEnviando]              = useState(false)
  const [error, setError]                    = useState('')
  const [resultado, setResultado]            = useState(null)

  // Reset total al cerrar el modal
  useEffect(() => {
    if (!open) {
      setQuery(''); setResultados([]); setCliente(null); setSaldosCliente([])
      setMonto(''); setMetodoPago('efectivo'); setFecha(today()); setDescripcion('')
      setEnviando(false); setError(''); setResultado(null)
    }
  }, [open])

  // Búsqueda de clientes con deuda, con debounce de 300ms
  useEffect(() => {
    if (!open || cliente) return
    setBuscando(true)
    const t = setTimeout(async () => {
      try {
        const r = await buscarClientesConDeuda(query)
        setResultados(r)
      } catch (e) {
        console.error(e)
      } finally {
        setBuscando(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, open, cliente])

  async function seleccionarCliente(c) {
    setCliente(c)
    setCargandoSaldos(true)
    setError('')
    try {
      const saldos = await obtenerSaldosImputablesDeCliente(c.idCliente)
      setSaldosCliente(saldos)
    } catch (e) {
      setError('No se pudieron cargar los saldos del cliente.')
    } finally {
      setCargandoSaldos(false)
    }
  }

  function cambiarCliente() {
    setCliente(null); setSaldosCliente([]); setResultado(null); setError('')
  }

  const montoNum = Number(String(monto).replace(',', '.'))
  const preview  = (cliente && montoNum > 0 && saldosCliente.length > 0)
    ? previsualizarImputacion(saldosCliente, montoNum)
    : null

  async function confirmar() {
    setError('')
    if (!cliente) { setError('Seleccioná un cliente.'); return }
    if (!Number.isFinite(montoNum) || montoNum <= 0) { setError('Ingresá un monto válido.'); return }

    setEnviando(true)
    try {
      const r = await registrarPagoParcial({
        idCliente: cliente.idCliente,
        monto: montoNum,
        metodoPago,
        fecha,
        descripcion,
      })
      setResultado(r)
    } catch (e) {
      setError(e.message || 'Ocurrió un error al registrar el pago.')
    } finally {
      setEnviando(false)
    }
  }

  function finalizar() {
    onSuccess(`Pago de ${fmt(montoNum)} aplicado a ${cliente.nombre} ${cliente.apellido}`)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar pago parcial" width="max-w-lg">
      {resultado ? (
        // ── Resultado exitoso ──────────────────────────────────────────
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
            <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-emerald-300 font-body font-semibold text-sm">Pago aplicado correctamente</p>
              <p className="text-surface-400 text-xs font-body">
                {fmt(resultado.montoAplicado)} imputado sobre {resultado.saldosAfectados.length} saldo{resultado.saldosAfectados.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {resultado.saldosAfectados.map(s => (
              <div key={s.idSaldo} className="flex items-center justify-between gap-2 bg-surface-700 rounded-lg px-3 py-2 text-sm font-body">
                <span className="text-surface-300 font-mono text-xs">Saldo #{s.idSaldo}</span>
                <span className="text-white font-mono">{fmt(s.montoAplicado)}</span>
                <Badge color={s.estadoResultante === 'pagado' ? 'green' : 'blue'}>
                  {s.estadoResultante === 'pagado' ? 'Cancelado' : 'Parcial'}
                </Badge>
              </div>
            ))}
            {resultado.saldosAfectados.length === 0 && (
              <p className="text-surface-500 text-xs font-body text-center py-4">
                El cliente no tenía saldos pendientes para imputar.
              </p>
            )}
          </div>

          {resultado.montoSobrante > 0 && (
            <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-yellow-300 text-xs font-body">
                El cliente no tenía más deuda pendiente para cubrir todo el monto. Sobraron{' '}
                <span className="font-bold">{fmt(resultado.montoSobrante)}</span> sin imputar — revisá el
                monto ingresado o registrá el excedente por otra vía.
              </p>
            </div>
          )}

          <Button className="w-full min-h-[44px]" onClick={finalizar}>Listo</Button>
        </div>
      ) : !cliente ? (
        // ── Paso 1: selección de cliente ───────────────────────────────
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar cliente por nombre o ID..."
              className="w-full min-h-[44px] bg-surface-700 border border-surface-600 rounded-xl pl-9 pr-4 py-2.5 text-white
                         text-base sm:text-sm font-body placeholder-surface-500 focus:outline-none focus:border-brand-500 transition-all"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {buscando && (
              <div className="flex items-center justify-center py-6 text-surface-500 text-sm gap-2">
                <Loader2 size={16} className="animate-spin" />Buscando...
              </div>
            )}
            {!buscando && resultados.length === 0 && (
              <p className="text-center text-surface-500 text-sm font-body py-6">
                Sin clientes con deuda pendiente que coincidan.
              </p>
            )}
            {!buscando && resultados.map(c => (
              <button key={c.idCliente} onClick={() => seleccionarCliente(c)}
                className="w-full min-h-[44px] flex items-center justify-between gap-3 bg-surface-700 hover:bg-surface-600
                           border border-surface-600 rounded-xl px-4 py-3 text-left transition-colors">
                <div className="min-w-0">
                  <p className="text-white text-sm font-body font-medium break-words">{c.nombre} {c.apellido}</p>
                  <p className="text-surface-400 text-xs font-mono">
                    ID #{c.idCliente} · {c.cantSaldos} saldo{c.cantSaldos !== 1 ? 's' : ''} pendiente{c.cantSaldos !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className="text-yellow-400 font-mono font-bold text-sm flex-shrink-0">{fmt(c.deudaTotal)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        // ── Paso 2: monto + preview + confirmación ─────────────────────
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-surface-700 border border-surface-600 rounded-xl px-4 py-3">
            <div>
              <p className="text-white text-sm font-body font-medium">{cliente.nombre} {cliente.apellido}</p>
              <p className="text-surface-400 text-xs font-mono">
                Deuda total: <span className="text-yellow-400 font-bold">{fmt(cliente.deudaTotal)}</span>
              </p>
            </div>
            <button onClick={cambiarCliente} className="text-surface-400 hover:text-white p-1 transition-colors" aria-label="Cambiar cliente">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-surface-400 text-xs uppercase tracking-widest font-body mb-1 block">Monto</label>
              <input
                type="number" inputMode="decimal" min="0" step="0.01" autoFocus
                value={monto} onChange={e => setMonto(e.target.value)}
                placeholder="0.00"
                className="w-full min-h-[44px] bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-white
                           text-base sm:text-sm font-mono focus:outline-none focus:border-brand-500 transition-all"
              />
            </div>
            <div>
              <label className="text-surface-400 text-xs uppercase tracking-widest font-body mb-1 block">Método</label>
              <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)}
                className="w-full min-h-[44px] bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-white
                           text-base sm:text-sm font-body focus:outline-none focus:border-brand-500 transition-all">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-surface-400 text-xs uppercase tracking-widest font-body mb-1 block">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="w-full min-w-0 min-h-[44px] bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-white
                         text-base sm:text-sm font-mono text-left [color-scheme:dark] [&::-webkit-date-and-time-value]:text-left
                         focus:outline-none focus:border-brand-500 transition-all" />
          </div>

          {cargandoSaldos ? (
            <div className="flex items-center justify-center py-6 text-surface-500 text-sm gap-2">
              <Loader2 size={16} className="animate-spin" />Cargando saldos...
            </div>
          ) : preview && (
            <div className="space-y-1.5">
              <p className="text-surface-400 text-xs uppercase tracking-widest font-body">
                Imputación estimada (saldo más antiguo primero)
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                {preview.detalle.filter(s => s.montoAplicado > 0).map(s => (
                  <div key={s.idSaldo} className="flex items-center justify-between gap-2 bg-surface-700/60 rounded-lg px-3 py-2 text-xs font-body">
                    <span className="text-surface-300 font-mono">#{s.idSaldo} · vto {fmtFecha(s.fechaVto)}</span>
                    <span className="text-white font-mono">{fmt(s.montoAplicado)}</span>
                    <Badge color={s.estadoResultante === 'pagado' ? 'green' : 'blue'}>
                      {s.estadoResultante === 'pagado' ? 'Cancela' : 'Parcial'}
                    </Badge>
                  </div>
                ))}
              </div>
              {preview.sobrante > 0 && (
                <p className="text-yellow-400 text-xs font-body pt-1">
                  Sobrante sin imputar: {fmt(preview.sobrante)}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-xs font-body">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1 min-h-[44px]" onClick={onClose} disabled={enviando}>Cancelar</Button>
            <Button className="flex-1 min-h-[44px]" icon={Coins} onClick={confirmar} disabled={enviando}>
              {enviando ? 'Aplicando...' : 'Confirmar pago'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Vista detalle de saldo ─────────────────────────────────────────────────

function SaldoDetalle({ saldo, onBack, onUpdated }) {
  const [presupuesto, setPresupuesto]   = useState(null)
  const [cliente,     setCliente]       = useState(null)
  const [detalles,    setDetalles]      = useState([])
  const [aplicaciones, setAplicaciones] = useState([])
  const [confirmPago, setConfirmPago]   = useState(false)
  // CORRECCIÓN (cierre de remanente): método usado para el cobro final,
  // solo relevante cuando esParcial — se persiste en el ledger de pagos.
  const [metodoCierre, setMetodoCierre] = useState('efectivo')

  useEffect(() => {
    async function cargar() {
      // Los cuatro fetches en paralelo para minimizar latencia
      const [pres, cli, dets, aplic] = await Promise.all([
        obtenerPresupuestoPorId(saldo.idPresupuesto),
        obtenerClientePorId(saldo.idCliente),
        obtenerDetallesConNombreDePresupuesto(saldo.idPresupuesto),
        obtenerAplicacionesDeSaldo(saldo.idSaldo),
      ])
      setPresupuesto(pres)
      setCliente(cli)
      setDetalles(dets)
      setAplicaciones(aplic)
    }
    cargar()
  }, [saldo.idPresupuesto, saldo.idCliente, saldo.idSaldo])

  async function marcarPagado() {
    // Cancela el remanente completo (sirve tanto para un saldo pendiente
    // como para saldar de una vez lo que quedaba de un pago parcial)
    const hoy = hoyISO()
    await marcarSaldoPagado(saldo.idSaldo, saldo.idPresupuesto, hoy, metodoCierre)
    setConfirmPago(false)
    onUpdated('Saldo marcado como pagado')
    onBack()
  }

  // CORRECCIÓN #1: usar fechaVto en lugar de fechaFin
  const dias         = diasRestantes(saldo.fechaVto)
  const colores      = colorDias(dias)
  const estaSaldado  = saldo.estado === 'pagado'
  const esParcial    = saldo.estado === 'parcial'
  const info         = estadoInfo(saldo.estado)
  const yaCobrado    = saldo.monto - saldo.montoPendiente
  const metodoLabel  = { efectivo: 'Efectivo', transferencia: 'Transferencia', cc15: 'CC 15 días', cc30: 'CC 30 días' }

  return (
    <div className="w-full min-w-0 max-w-4xl mx-auto space-y-4 sm:space-y-6 animate-slide-up">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-2 min-h-[44px] pr-2 text-surface-400 hover:text-white text-sm font-body transition-colors">
          <ArrowLeft size={16} />Volver a saldos
        </button>
        <span className="text-surface-600">/</span>
        <span className="text-surface-300 text-sm font-body">
          Saldo <span className="text-brand-400 font-mono">#{saldo.idSaldo}</span>
        </span>
      </div>

      {/* Cabecera */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-surface-400 text-xs tracking-widest uppercase font-body mb-1">Saldo</p>
            <h2 className="font-display text-4xl text-white tracking-widest">#{saldo.idSaldo}</h2>
          </div>
          <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
            <Badge color={info.color}>{info.label}</Badge>
            {!estaSaldado && (
              <Button icon={BadgeCheck} className="w-full sm:w-auto min-h-[44px]" onClick={() => setConfirmPago(true)}>
                {esParcial ? 'Cancelar remanente' : 'Marcar como pagado'}
              </Button>
            )}
          </div>
        </div>

        {/* Días restantes — banner prominente, visible mientras haya deuda activa */}
        {!estaSaldado && (
          <div className={`flex items-center gap-3 rounded-xl px-4 sm:px-5 py-3 border mb-6 ${colores.bg}`}>
            <CalendarClock size={18} className={colores.text + ' flex-shrink-0'} />
            <div>
              <p className={`font-body font-semibold text-sm ${colores.text}`}>{labelDias(dias)}</p>
              <p className="text-surface-400 text-xs font-body">
                Fecha de vencimiento: {fmtFecha(saldo.fechaVto)}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className={`font-display text-3xl tracking-widest ${colores.text}`}>
                {dias < 0 ? Math.abs(dias) : dias}
              </p>
              <p className="text-surface-500 text-xs font-body">días</p>
            </div>
          </div>
        )}

        {/* Grid de datos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Presupuesto */}
          <div className="bg-surface-700 rounded-xl p-4">
            <p className="text-surface-400 text-xs uppercase tracking-widest font-body mb-1 flex items-center gap-1">
              <FileText size={11} />Presupuesto
            </p>
            <p className="text-brand-400 font-mono font-bold">#{saldo.idPresupuesto}</p>
            {presupuesto && (
              <p className="text-surface-400 text-xs font-body mt-0.5">
                {metodoLabel[presupuesto.metodoPago] ?? presupuesto.metodoPago}
              </p>
            )}
          </div>

          {/* Fecha del presupuesto */}
          <div className="bg-surface-700 rounded-xl p-4">
            <p className="text-surface-400 text-xs uppercase tracking-widest font-body mb-1 flex items-center gap-1">
              <Clock size={11} />Fecha emisión
            </p>
            <p className="text-white text-sm font-mono">{fmtFecha(saldo.fechaInicio)}</p>
          </div>

          {/* Cliente */}
          {/* CORRECCIÓN #7: usar campos extra del cliente disponibles en el service */}
          <div className={`bg-surface-700 rounded-xl p-4 min-w-0 ${!estaSaldado ? 'col-span-2' : ''}`}>
            <p className="text-surface-400 text-xs uppercase tracking-widest font-body mb-1 flex items-center gap-1">
              <User size={11} />Cliente
            </p>
            {cliente ? (
              <>
                <p className="text-white text-sm font-body font-medium">
                  {cliente.nombre} {cliente.apellido}
                </p>
                <p className="text-surface-400 text-xs font-mono mt-0.5 break-all">
                  ID #{cliente.idCliente}
                  {cliente.telefono ? ` · ${cliente.telefono}` : ''}
                  {cliente.mail     ? ` · ${cliente.mail}`     : ''}
                </p>
              </>
            ) : (
              <p className="text-surface-400 text-sm font-mono">ID #{saldo.idCliente}</p>
            )}
          </div>

          {/* Fecha de pago — solo visible cuando el saldo ya se saldó por completo */}
          {estaSaldado && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              <p className="text-emerald-400 text-xs uppercase tracking-widest font-body mb-1 flex items-center gap-1">
                <CheckCircle2 size={11} />Fecha de pago
              </p>
              <p className="text-emerald-300 text-sm font-mono font-semibold">
                {fmtFecha(saldo.fechaPago)}
              </p>
              <p className="text-emerald-600 text-xs font-body mt-0.5">Cobro efectivizado</p>
            </div>
          )}
        </div>
      </Card>

      {/* Detalle de productos del presupuesto */}
      <Card className="overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-surface-700 flex items-center justify-between gap-3">
          <h3 className="font-body font-semibold text-white text-sm">
            Productos del presupuesto #{saldo.idPresupuesto}
          </h3>
          <span className="text-surface-400 text-xs font-mono">
            {detalles.length} ítem{detalles.length !== 1 ? 's' : ''}
          </span>
        </div>

        {detalles.length === 0 ? (
          <p className="text-center py-10 text-surface-500 text-sm font-body">Sin ítems registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-surface-700">
                  {[
                    { h: '#',           cls: 'hidden sm:table-cell' },
                    { h: 'Producto' },
                    { h: 'Medida' },
                    { h: 'Cant.' },
                    { h: 'Precio Unit.', cls: 'hidden sm:table-cell' },
                    { h: 'Subtotal' },
                  ].map(({ h, cls = '' }) => (
                    <th key={h} scope="col" className={`text-left text-surface-400 text-xs tracking-widest uppercase py-3 px-3 sm:px-4 font-body ${cls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detalles.map((d, idx) => (
                  <tr key={d.idDetalle} className="border-b border-surface-700/50">
                    <td className="hidden sm:table-cell py-3 px-4 text-surface-500 font-mono text-xs">{idx + 1}</td>
                    <td className="py-3 px-3 sm:px-4 text-white font-body">{d.nombreProducto ?? `#${d.idProducto}`}</td>
                    <td className="py-3 px-3 sm:px-4">
                      {d.medida
                        ? <Badge color="blue">{d.medida}</Badge>
                        : <span className="text-surface-500 text-xs">—</span>}
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-surface-200 font-mono text-center">{d.cantidad}</td>
                    <td className="hidden sm:table-cell py-3 px-4 text-surface-200 font-mono">{fmt(d.precioUnitario)}</td>
                    <td className="py-3 px-3 sm:px-4 text-surface-200 font-mono font-medium">{fmt(d.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Historial de pagos aplicados — CORRECCIÓN #8: solo aparece si hubo imputaciones */}
      {aplicaciones.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-surface-700 flex items-center gap-2">
            <History size={14} className="text-surface-400" />
            <h3 className="font-body font-semibold text-white text-sm">Historial de pagos aplicados</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-body">
              <thead>
                <tr className="border-b border-surface-700">
                  {[
                    { h: 'Fecha' },
                    { h: 'Método' },
                    { h: 'Aplicado' },
                    { h: 'Remanente anterior', cls: 'hidden sm:table-cell' },
                    { h: 'Remanente resultante' },
                  ].map(({ h, cls = '' }) => (
                    <th key={h} scope="col" className={`text-left text-surface-400 text-xs tracking-widest uppercase py-3 px-3 sm:px-4 font-body ${cls}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aplicaciones.map(a => (
                  <tr key={a.idAplicacion} className="border-b border-surface-700/50">
                    <td className="py-3 px-3 sm:px-4 text-surface-300 font-mono text-xs">{fmtFecha(a.fecha)}</td>
                    <td className="py-3 px-3 sm:px-4 text-surface-300 font-body text-xs capitalize">{a.metodoPago ?? '—'}</td>
                    <td className="py-3 px-3 sm:px-4 text-emerald-400 font-mono font-medium">{fmt(a.montoAplicado)}</td>
                    <td className="hidden sm:table-cell py-3 px-4 text-surface-400 font-mono text-xs">{fmt(a.saldoAnterior)}</td>
                    <td className="py-3 px-3 sm:px-4 text-white font-mono text-xs">{fmt(a.saldoResultante)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Monto final */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 text-sm font-body w-full sm:w-auto">
            <div className="flex justify-between gap-4 sm:gap-16">
              <span className="text-surface-400">Monto original (lista):</span>
              <span className="text-surface-300 font-mono">
                {presupuesto ? fmt(presupuesto.montoOriginal) : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-4 sm:gap-16">
              <span className="text-surface-400">Monto total del saldo:</span>
              <span className="text-surface-300 font-mono">{fmt(saldo.monto)}</span>
            </div>
            {yaCobrado > 0 && (
              <div className="flex justify-between gap-4 sm:gap-16">
                <span className="text-emerald-400">Ya cobrado:</span>
                <span className="text-emerald-400 font-mono">{fmt(yaCobrado)}</span>
              </div>
            )}
            <div className="border-t border-surface-700 pt-2 flex justify-between items-baseline gap-4 sm:gap-16">
              <span className="text-white font-semibold">
                {estaSaldado ? 'Monto cobrado:' : 'Remanente a cobrar:'}
              </span>
              <span className="text-brand-400 font-mono font-bold text-xl">
                {fmt(estaSaldado ? saldo.monto : saldo.montoPendiente)}
              </span>
            </div>
          </div>

          {estaSaldado && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30
                            rounded-xl px-4 py-2.5">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span className="text-emerald-300 text-sm font-body">Ingreso registrado</span>
            </div>
          )}
        </div>
      </Card>

      {/* Notas al pie del detalle (Escenario 1): debajo de todo el contenido actual.
          Independiente del estado del registro (Escenario 7) y excluida de PDF/impresión (Escenario 8). */}
      <NotasRegistro tipo="saldo" idRegistro={saldo.idSaldo} />

      {/* Modal confirmar cobro del remanente completo */}
      <Modal open={confirmPago} onClose={() => setConfirmPago(false)} title="Confirmar cobro" width="max-w-sm">
        <p className="text-surface-300 text-sm font-body mb-2">
          ¿Marcar el saldo <span className="text-white font-mono">#{saldo.idSaldo}</span> como cobrado en su totalidad?
        </p>
        <p className="text-surface-500 text-xs font-body mb-4">
          Se registrará el ingreso del remanente de{' '}
          <span className="text-brand-400 font-mono font-bold">{fmt(saldo.montoPendiente)}</span>{' '}
          en el sistema de estadísticas. Esta acción no se puede deshacer.
        </p>

        {/* CORRECCIÓN (cierre de remanente): solo tiene sentido pedir método
            de pago cuando efectivamente se va a dejar un registro en el
            ledger — o sea, cuando había un pago parcial en curso. */}
        {esParcial && (
          <div className="mb-6">
            <label className="text-surface-400 text-xs uppercase tracking-widest font-body mb-1 block">
              Método de cobro del remanente
            </label>
            <select value={metodoCierre} onChange={e => setMetodoCierre(e.target.value)}
              className="w-full min-h-[44px] bg-surface-700 border border-surface-600 rounded-xl px-3 py-2.5 text-white
                         text-base sm:text-sm font-body focus:outline-none focus:border-brand-500 transition-all">
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="cheque">Cheque</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1 min-h-[44px]" onClick={() => setConfirmPago(false)}>Cancelar</Button>
          <Button className="flex-1 min-h-[44px]" icon={BadgeCheck} onClick={marcarPagado}>Confirmar cobro</Button>
        </div>
      </Modal>
    </div>
  )
}

// ─── Lista de saldos ────────────────────────────────────────────────────────
//
// Arquitectura de la vista (mobile-first):
//
//   Saldos (contenedor: estado de filtros, datos, paginación)
//    ├─ KpiCard ×4
//    ├─ SaldosFilters      1 columna en <640px · wrap fluido en ≥640px
//    └─ Card
//        ├─ SaldosCardList  (<768px)  una tarjeta por saldo
//        └─ SaldosTable     (≥768px)  en tablet se colapsan columnas secundarias
//
// Ambos layouts consumen el MISMO array `paginated` y el MISMO `onOpen`, y el
// filtrado y la paginación ocurren en el servidor (una sola vez). Por eso el
// comportamiento y los resultados son idénticos en cualquier dispositivo
// (Escenario 6). Breakpoints Tailwind: sm 640 · md 768 · lg 1024.
//
// «Fecha de pago» (rango + orden): el filtro y el ORDER BY los resuelve la base (saldosService),
// por eso totales y paginación se recalculan solos sobre el resultado filtrado. El estado de
// filtros vive en este contenedor, que NO se desmonta al abrir un detalle (se alterna con
// `selected`): al volver se conservan filtros, orden y página.

const ESTADOS = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'parcial',   label: 'Parciales'  },
  { value: 'pagado',    label: 'Cobrados'   },
  { value: 'all',       label: 'Todos'      },
]

const ESTADO_DEFAULT = 'pendiente'

const FILTROS_INICIALES = Object.freeze({
  search:     '',
  estado:     ESTADO_DEFAULT,
  orden:      ORDEN_DEFAULT,   // 'urgencia:asc' | 'urgencia:desc' | 'fechaPago:asc' | 'fechaPago:desc'
  pagoDesde:  '',              // AAAA-MM-DD o '' (sin extremo)
  pagoHasta:  '',
})

/** Cantidad de filtros distintos del valor por defecto (alimenta el badge de «Limpiar» en escritorio). */
function contarFiltrosActivos({ search, estado, pagoDesde, pagoHasta }) {
  return (search.trim() ? 1 : 0)
    + (estado !== ESTADO_DEFAULT ? 1 : 0)
    + (pagoDesde ? 1 : 0)
    + (pagoHasta ? 1 : 0)
}

// Controles táctiles: alto mínimo 44px (WCAG 2.5.5 / HIG) y 16px de fuente en
// mobile para que iOS Safari no haga zoom automático al enfocar el campo.
const FIELD_CLASS =
  'w-full min-w-0 min-h-[44px] bg-surface-700 border border-surface-600 rounded-xl px-3 text-white ' +
  'text-base sm:text-sm font-body placeholder-surface-500 focus:outline-none focus:border-brand-500 ' +
  'focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-all'

const LABEL_CLASS = 'text-surface-400 text-xs uppercase tracking-widest font-body mb-1 block'

/** Deriva todo lo que la fila y la tarjeta necesitan, en un solo lugar (DRY). */
function derivarSaldo(s) {
  const dias        = diasRestantes(s.fechaVto)
  const fechaPago   = fmtFecha(s.fechaPago)
  const estaSaldado = s.estado === 'pagado'
  const nombre      = `${s.clienteNombre ?? ''} ${s.clienteApellido ?? ''}`.trim()
  return {
    dias,
    cols:         colorDias(dias),
    estaSaldado,
    esParcial:    s.estado === 'parcial',
    info:         estadoInfo(s.estado),
    montoVisible: estaSaldado ? s.monto : s.montoPendiente,
    nombre:       nombre || `Cliente #${s.idCliente}`,
    // dd/mm/aaaa o «—» si el saldo aún no se pagó / no tiene fecha registrada (Escenarios 1-3).
    fechaPago,
    tienePago:    fechaPago !== '—',
  }
}

// ── KPIs ────────────────────────────────────────────────────────────────────

// ── Estados transversales ───────────────────────────────────────────────────

function OfflineBanner() {
  return (
    <div role="status"
      className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
      <WifiOff size={16} className="text-yellow-400 flex-shrink-0" aria-hidden="true" />
      <p className="text-yellow-300 text-xs font-body">
        Sin conexión. Los saldos que ves pueden estar desactualizados.
      </p>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div role="status" className="p-3 grid gap-3 sm:grid-cols-2 md:grid-cols-1">
      <span className="sr-only">Cargando saldos…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-28 md:h-14 rounded-xl bg-surface-700/50 animate-pulse" />
      ))}
    </div>
  )
}

function ListError({ onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center py-12 px-4 gap-3 text-center">
      <AlertTriangle size={28} className="text-red-400" aria-hidden="true" />
      <p className="text-surface-300 text-sm font-body">No pudimos cargar los saldos. Revisá tu conexión e intentá de nuevo.</p>
      <Button variant="secondary" className="min-h-[44px]" onClick={onRetry}>Reintentar</Button>
    </div>
  )
}

function EmptyState({ estado, hayFiltros, onClear }) {
  return (
    <div className="flex flex-col items-center py-16 px-4 gap-3 text-surface-500 text-center">
      <Wallet size={32} className="opacity-30" aria-hidden="true" />
      <p className="font-body text-sm">
        {!hayFiltros && estado === 'pendiente' ? 'No hay saldos pendientes.' : 'Sin saldos que coincidan.'}
      </p>
      {hayFiltros && (
        <Button variant="secondary" className="min-h-[44px]" onClick={onClear}>Limpiar filtros</Button>
      )}
    </div>
  )
}

// ── Filtros ─────────────────────────────────────────────────────────────────
//
// Mobile/tablet (≤ 1024px): patrón único del sistema (<FiltrosMovil>): buscador siempre
// visible + botón «Filtros»; Estado y Orden viven en el panel con borrador (Limpiar / Aplicar).
// Escritorio (> 1024px): una sola fila con buscador (flexible) + estados + orden, sin cambios.

const CAMPOS_FILTROS_MOVIL = [
  { tipo: 'chips', clave: 'estado', etiqueta: 'Estado', opciones: ESTADOS },
  // «Cobrados» no tiene urgencia: ahí solo se ofrece el orden por fecha de pago (igual que en escritorio).
  { tipo: 'chips', clave: 'orden', etiqueta: 'Orden', opciones: (b) => opcionesOrden(b.estado) },
  // Sin `min`/`max` a propósito: un rango invertido tiene que poder escribirse para que aparezca
  // el mensaje de error y el botón «Aplicar» quede deshabilitado (Escenario 6).
  { tipo: 'fecha', clave: 'pagoDesde', etiqueta: 'Fecha de pago desde' },
  { tipo: 'fecha', clave: 'pagoHasta', etiqueta: 'Fecha de pago hasta' },
]
const DEFAULTS_FILTROS_MOVIL = Object.freeze({
  estado: ESTADO_DEFAULT, orden: ORDEN_DEFAULT, pagoDesde: '', pagoHasta: '',
})
const validarFiltrosMovil = (b) => validarRangoFechaPago(b.pagoDesde, b.pagoHasta)
// El orden cuenta como filtro activo solo si difiere del que corresponde por defecto al estado elegido.
const contarFiltrosMovil = (v) =>
  (v.estado !== ESTADO_DEFAULT ? 1 : 0)
  + (v.orden !== ordenPorDefecto(v.estado) ? 1 : 0)
  + (v.pagoDesde ? 1 : 0)
  + (v.pagoHasta ? 1 : 0)
// Campos dependientes: al cambiar el estado en el borrador, el orden se ajusta a las opciones válidas.
const reglaFiltrosMovil = (clave, _valor, siguiente) =>
  clave === 'estado' ? { ...siguiente, orden: normalizarOrden(siguiente.orden, siguiente.estado) } : siguiente

function SaldosFilters(props) {
  const { isCompact } = useBreakpoint()
  return isCompact ? <SaldosFiltersMovil {...props} /> : <SaldosFiltersEscritorio {...props} />
}

function SaldosFiltersMovil({ filters, onChange, total }) {
  const { search, estado, orden, pagoDesde, pagoHasta } = filters
  return (
    <FiltrosMovil
      busqueda={(
        <BuscadorListado value={search} onChange={(texto) => onChange('search', texto)}
          placeholder="Buscar por cliente o ID..." etiqueta="Buscar por cliente o ID" />
      )}
      value={{ estado, orden, pagoDesde, pagoHasta }}
      defaults={DEFAULTS_FILTROS_MOVIL}
      campos={CAMPOS_FILTROS_MOVIL}
      validar={validarFiltrosMovil}
      alCambiar={reglaFiltrosMovil}
      contar={contarFiltrosMovil}
      onApply={(b) => {
        onChange('estado', b.estado)
        onChange('orden', normalizarOrden(b.orden, b.estado))
        onChange('pagoDesde', b.pagoDesde)
        onChange('pagoHasta', b.pagoHasta)
      }}
      debajo={(
        <p role="status" aria-live="polite" className="sr-only">
          {total} resultado{total !== 1 ? 's' : ''}
        </p>
      )}
    />
  )
}

const CLASE_LIMPIAR =
  `inline-flex items-center gap-1.5 ${ALTO_CONTROL} px-3 rounded-xl whitespace-nowrap flex-shrink-0 ` +
  'text-sm font-body text-surface-300 hover:text-white hover:bg-surface-700/60 transition-colors'

function ContenidoLimpiar({ cantidad }) {
  return (
    <>
      <X size={14} aria-hidden="true" />
      Limpiar filtros
      <span aria-hidden="true" className="min-w-[1.25rem] px-1.5 rounded-full bg-brand-500/20 text-brand-300 text-xs tabular-nums text-center">
        {cantidad}
      </span>
    </>
  )
}

/**
 * Control segmentado: UN solo control con varias opciones excluyentes (en vez de N botones sueltos).
 * Se usa para un conjunto chico y fijo de opciones (2–4), como el estado del saldo.
 */
function ControlSegmentado({ etiqueta, opciones, valor, onChange }) {
  return (
    <div role="group" aria-label={etiqueta}
      className={`inline-grid grid-flow-col auto-cols-fr gap-0.5 p-[3px] flex-shrink-0 ${ALTO_CONTROL}
                  bg-surface-700/60 border border-surface-600 rounded-xl`}>
      {opciones.map(({ value, label }) => {
        const activo = valor === value
        return (
          <button key={value} type="button" aria-pressed={activo} onClick={() => onChange(value)}
            className={`px-4 rounded-[9px] text-sm font-body whitespace-nowrap transition-colors
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60
                        ${activo
                          ? 'bg-brand-500/20 text-white ring-1 ring-inset ring-brand-500/50'
                          : 'text-surface-300 hover:text-white hover:bg-surface-600/50'}`}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Filtros de escritorio (≥1025px). Jerarquía en dos niveles:
 *   1) PRIMARIO  — «¿qué busco?»: buscador + estado (control segmentado).
 *   2) SECUNDARIO — afinar y ordenar: rango de fecha de pago a la izquierda; a la derecha
 *      «Ordenar por» (selector rotulado, con la dirección incluida en cada opción) y «Limpiar filtros».
 * Filtrar y ordenar usan controles de distinta forma a propósito: no se confunden entre sí.
 */
function SaldosFiltersEscritorio({ filters, onChange, onClear, filtrosActivos, total, errorRango }) {
  const { search, estado, orden, pagoDesde, pagoHasta } = filters
  const ID_ERROR_PAGO = 'saldos-pago-error'
  const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40'

  // Las opciones dependen del estado; `orden` ya llega normalizado desde el contenedor.
  const opciones = opcionesOrden(estado)
  const valorOrden = normalizarOrden(orden, estado)

  const describedBy = errorRango ? ID_ERROR_PAGO : undefined
  const invalido = errorRango ? true : undefined

  return (
    <Card className="p-4 space-y-3">

      {/* Nivel 1 · primario */}
      <div className="flex flex-row items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search size={14} aria-hidden="true"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
          <input
            type="search" inputMode="search" enterKeyHint="search" autoComplete="off"
            aria-label="Buscar por cliente o ID"
            value={search} onChange={e => onChange('search', e.target.value)}
            placeholder="Buscar por cliente o ID..."
            className={`${FIELD_CLASS} min-[1025px]:min-h-0 min-[1025px]:h-[42px] pl-9 pr-3`} />
        </div>
        <ControlSegmentado etiqueta="Estado" opciones={ESTADOS} valor={estado}
          onChange={(v) => onChange('estado', v)} />
      </div>

      {/* Nivel 2 · secundario (separado por una línea fina): rango de fechas a la izquierda; a la derecha,
          «Limpiar filtros» + «Ordenar por», con el selector SIEMPRE contra el margen derecho.
          El bloque derecho usa `grow` + `justify-end`: en una línea compartida ocupa el hueco sobrante y
          alinea su contenido a la derecha; si por zoom/ancho no cabe y baja de línea, ocupa toda su línea
          y el selector sigue pegado al margen derecho (nunca queda a medio camino ni con sangría). */}
      <div className="flex flex-row flex-wrap items-center gap-x-6 gap-y-3 pt-3 border-t border-surface-700/70">

        {/* IZQUIERDA — rango de fecha de pago: un grupo rotulado, «Desde → Hasta» (campos compactos) */}
        <div role="group" aria-labelledby="saldos-pago-leyenda" className="flex flex-row flex-wrap items-center gap-2.5">
          <span id="saldos-pago-leyenda" className={`${CLASE_ETIQUETA} whitespace-nowrap mr-0.5`}>Fecha de pago</span>
          <DateField compacto id="saldos-pago-desde" label="Desde" title="Fecha de pago desde" value={pagoDesde} className="w-44"
            onChange={(v) => onChange('pagoDesde', v)} aria-invalid={invalido} aria-describedby={describedBy} />
          <ArrowRight size={16} aria-hidden="true" className="text-surface-400 flex-shrink-0" />
          <DateField compacto id="saldos-pago-hasta" label="Hasta" title="Fecha de pago hasta" value={pagoHasta} className="w-44"
            onChange={(v) => onChange('pagoHasta', v)} aria-invalid={invalido} aria-describedby={describedBy} />
        </div>

        {/* DERECHA — «Limpiar filtros» (a la izquierda del selector) y «Ordenar por» (contra el margen) */}
        <div className="flex grow flex-row flex-nowrap items-center justify-end gap-3">

          {/* «Limpiar filtros» RESERVA su lugar aunque no haya filtros: si apareciera/desapareciera, el ancho
              de este bloque cambiaría y podría saltar de línea. Sin filtros se muestra un espacio invisible
              (fuera del árbol de accesibilidad); con filtros, el botón real. */}
          {filtrosActivos > 0 ? (
            <button type="button" onClick={onClear} className={`${CLASE_LIMPIAR} ${FOCUS}`}>
              <ContenidoLimpiar cantidad={filtrosActivos} />
            </button>
          ) : (
            <span aria-hidden="true" className={`${CLASE_LIMPIAR} invisible`}>
              <ContenidoLimpiar cantidad={0} />
            </span>
          )}

          {/* «Ordenar por» se resuelve con un ícono dentro del selector; el rótulo queda para lectores de
              pantalla y tooltip. */}
          <div className="relative flex-shrink-0">
            <label htmlFor="saldos-orden" className="sr-only">Ordenar por</label>
            <ArrowUpDown size={16} aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-300 pointer-events-none" />
            <select id="saldos-orden" title="Ordenar por" value={valorOrden} onChange={(e) => onChange('orden', e.target.value)}
              className={`appearance-none ${ALTO_CONTROL} w-[11.5rem] pl-9 pr-9 cursor-pointer
                          bg-surface-700 border border-surface-600 rounded-xl text-white text-sm font-body
                          [color-scheme:dark] focus:outline-none focus:border-brand-500 ${FOCUS}`}>
              {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-300 pointer-events-none" />
          </div>
        </div>
      </div>

      {errorRango && (
        <p id={ID_ERROR_PAGO} role="alert" className="flex items-center gap-1.5 min-w-0 text-red-400 text-xs font-body">
          <AlertCircle size={14} className="flex-shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{errorRango}</span>
        </p>
      )}

      {/* Contador solo para lectores de pantalla (el total visible está en el paginador) */}
      <p role="status" aria-live="polite" className="sr-only">
        {total} resultado{total !== 1 ? 's' : ''}
      </p>
    </Card>
  )
}

// ── Piezas de listado ───────────────────────────────────────────────────────

function EstadoBadge({ info }) {
  return (
    <Badge color={info.color}>
      {info.color === 'green'
        ? <CheckCircle2 size={10} className="inline mr-1" aria-hidden="true" />
        : <Clock size={10} className="inline mr-1" aria-hidden="true" />}
      {info.label}
    </Badge>
  )
}

/** Vista de tarjeta (<768px): toda la información clave + acción explícita. */
function SaldoCard({ saldo, onOpen }) {
  const v = derivarSaldo(saldo)
  return (
    <article onClick={() => onOpen(saldo)}
      className="h-full flex flex-col gap-3 bg-surface-700/40 border border-surface-700 rounded-xl p-4
                 cursor-pointer active:bg-surface-700/70 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-white text-sm font-body font-medium leading-tight break-words">{v.nombre}</p>
          <p className="text-surface-400 text-xs font-mono mt-1">
            <span className="text-brand-400 font-bold">#{saldo.idSaldo}</span> · Presupuesto #{saldo.idPresupuesto}
          </p>
        </div>
        <div className="flex-shrink-0"><EstadoBadge info={v.info} /></div>
      </div>

      <div>
        <p className="text-white font-mono font-medium text-xl">{fmt(v.montoVisible)}</p>
        {v.esParcial && <p className="text-surface-500 text-xs font-mono">de {fmt(saldo.monto)}</p>}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs font-body">
        <div>
          <dt className="text-surface-500">Emisión</dt>
          <dd className="text-surface-300 font-mono mt-0.5">{fmtFecha(saldo.fechaInicio)}</dd>
        </div>
        <div>
          <dt className="text-surface-500">Vencimiento</dt>
          <dd className="text-surface-300 font-mono mt-0.5">{fmtFecha(saldo.fechaVto)}</dd>
        </div>
        <div>
          <dt className="text-surface-500">Fecha de pago</dt>
          <dd className={`font-mono mt-0.5 ${v.tienePago ? 'text-surface-300' : 'text-surface-400'}`}>{v.fechaPago}</dd>
        </div>
      </dl>

      {!v.estaSaldado && (
        <p className={`self-start inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-body ${v.cols.bg} ${v.cols.text}`}>
          <CalendarClock size={12} aria-hidden="true" />{labelDias(v.dias)}
        </p>
      )}

      <Button variant="secondary" icon={Eye} className="w-full min-h-[44px] mt-auto"
        onClick={(e) => { e.stopPropagation(); onOpen(saldo) }}>
        Ver detalle
      </Button>
    </article>
  )
}

function SaldosCardList({ items, onOpen }) {
  return (
    <ul className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
      {items.map(s => (
        <li key={s.idSaldo}><SaldoCard saldo={s} onOpen={onOpen} /></li>
      ))}
    </ul>
  )
}

// Columnas de la tabla. En tablet (768–1023px) se colapsan las secundarias
// (`hidden lg:table-cell`); su información se reubica bajo otra celda.
const COLUMNAS = [
  { key: 'saldo',       label: 'Saldo' },
  { key: 'presupuesto', label: 'Presupuesto', cls: 'hidden lg:table-cell' },
  { key: 'cliente',     label: 'Cliente' },
  { key: 'emision',     label: 'Emisión',     cls: 'hidden lg:table-cell' },
  { key: 'vencimiento', label: 'Vencimiento' },
  { key: 'dias',        label: 'Días',        cls: 'hidden lg:table-cell' },
  { key: 'monto',       label: 'Monto' },
  { key: 'estado',      label: 'Estado' },
  // Ordenable por servidor (clic en el encabezado). En tablet se colapsa y viaja bajo «Estado».
  { key: 'fechaPago',   label: 'Fecha de pago', cls: 'hidden lg:table-cell', orden: CAMPO_FECHA_PAGO },
  { key: 'accion',      label: '', sr: 'Acciones' },
]

function SaldoRow({ saldo, onOpen }) {
  const v = derivarSaldo(saldo)
  const diasTxt = v.dias < 0 ? `−${Math.abs(v.dias)}` : v.dias
  return (
    <tr onClick={() => onOpen(saldo)}
      className="border-b border-surface-700/50 hover:bg-surface-700/40 active:bg-surface-700/60 cursor-pointer transition-colors">
      <td className="py-1 px-3">
        {/* Botón real: da acceso por teclado y lectores de pantalla (la fila sola no lo tiene) */}
        <button type="button" aria-label={`Ver detalle del saldo #${saldo.idSaldo}`}
          onClick={(e) => { e.stopPropagation(); onOpen(saldo) }}
          className="min-h-[44px] min-w-[44px] text-left text-brand-400 font-mono text-sm font-bold rounded
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
          #{saldo.idSaldo}
        </button>
        <span className="block lg:hidden text-surface-500 text-xs font-mono">Pres. #{saldo.idPresupuesto}</span>
      </td>
      <td className="hidden lg:table-cell py-3 px-3 text-surface-400 font-mono text-xs">#{saldo.idPresupuesto}</td>
      <td className="py-3 px-3">
        <p className="text-white text-sm font-body leading-tight">{v.nombre}</p>
      </td>
      <td className="hidden lg:table-cell py-3 px-3 text-surface-400 font-mono text-xs">{fmtFecha(saldo.fechaInicio)}</td>
      <td className="py-3 px-3 text-surface-300 font-mono text-xs">
        {fmtFecha(saldo.fechaVto)}
        {/* En tablet los «Días» viajan bajo el vencimiento */}
        {!v.estaSaldado && (
          <span className={`block lg:hidden font-bold mt-0.5 ${v.cols.text}`}>{diasTxt}d</span>
        )}
      </td>
      <td className="hidden lg:table-cell py-3 px-3">
        {!v.estaSaldado
          ? <span className={`text-xs font-mono font-bold ${v.cols.text}`}>{diasTxt}d</span>
          : <span className="text-surface-600 text-xs">—</span>}
      </td>
      <td className="py-3 px-3">
        <p className="text-white font-mono font-medium">{fmt(v.montoVisible)}</p>
        {v.esParcial && <p className="text-surface-500 text-xs font-mono">de {fmt(saldo.monto)}</p>}
      </td>
      <td className="py-3 px-3">
        <EstadoBadge info={v.info} />
        {/* En tablet la «Fecha de pago» viaja bajo el estado */}
        <span className="block lg:hidden mt-1 text-surface-400 text-xs font-mono">Pago: {v.fechaPago}</span>
      </td>
      <td className={`hidden lg:table-cell py-3 px-3 font-mono text-xs ${v.tienePago ? 'text-surface-300' : 'text-surface-400'}`}>
        {v.fechaPago}
      </td>
      <td className="py-3 px-3 text-surface-500"><Wallet size={14} aria-hidden="true" /></td>
    </tr>
  )
}

/** Encabezado ordenable: botón real (teclado + lector de pantalla) con `aria-sort` en el <th>. */
function EncabezadoOrdenable({ columna, orden, onOrden }) {
  const { campo, dir } = parseOrden(orden)
  const activa = campo === columna.orden
  const Icono = !activa ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown
  const siguiente = alternarOrdenFechaPago(orden)
  return (
    <button type="button" onClick={() => onOrden(siguiente)}
      className="inline-flex items-center gap-1.5 min-h-[44px] uppercase tracking-widest rounded
                 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
      {columna.label}
      <Icono size={13} aria-hidden="true" className={activa ? 'text-brand-400' : 'text-surface-500'} />
      <span className="sr-only">
        {activa ? `, ordenado ${dir === 'asc' ? 'ascendente' : 'descendente'}` : ', sin ordenar'}. Activar para ordenar
        {' '}{activa && dir === 'asc' ? 'descendente' : 'ascendente'}
      </span>
    </button>
  )
}

function SaldosTable({ items, onOpen, orden, onOrden, permiteOrdenPago }) {
  const { campo, dir } = parseOrden(orden)
  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm font-body">
        <caption className="sr-only">Listado de saldos</caption>
        <thead>
          <tr className="border-b border-surface-700">
            {COLUMNAS.map(c => {
              const ordenable = Boolean(c.orden) && permiteOrdenPago
              const activa = ordenable && campo === c.orden
              return (
                <th key={c.key} scope="col"
                  aria-sort={ordenable ? (activa ? (dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  className={`text-left text-surface-400 text-xs tracking-widest uppercase px-3 font-body
                              ${ordenable ? 'py-0' : 'py-3'} ${c.cls ?? ''}`}>
                  {ordenable
                    ? <EncabezadoOrdenable columna={c} orden={orden} onOrden={onOrden} />
                    : c.label}
                  {c.sr && <span className="sr-only">{c.sr}</span>}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {items.map(s => <SaldoRow key={s.idSaldo} saldo={s} onOpen={onOpen} />)}
        </tbody>
      </table>
    </div>
  )
}

// ─── Contenedor ─────────────────────────────────────────────────────────────

export default function Saldos() {
  const location = useLocation()
  const online   = useOnlineStatus()
  const [selected,      setSelected]      = useState(null)
  const [filters,       setFilters]       = useState(FILTROS_INICIALES)
  const [toast,         setToast]         = useState('')
  const [pagoModalOpen, setPagoModalOpen] = useState(false)
  // CORRECCIÓN #3: KPIs en estado propio, calculados por el service
  const [kpis, setKpis] = useState({
    totalPendiente: 0,
    cantPendientes: 0,
    vencidos:       0,
    cantVencidos:   0,
    totalCobrado:   0,
    cantParciales:  0,
    totalEnParcial: 0,
  })

  // Al cambiar el estado, el orden se reajusta a las opciones que ese estado ofrece.
  const setFilter = useCallback(
    (campo, valor) => setFilters(f => {
      const siguiente = { ...f, [campo]: valor }
      return { ...siguiente, orden: normalizarOrden(siguiente.orden, siguiente.estado) }
    }),
    [],
  )
  // «Limpiar» restablece búsqueda, estado y rango de fecha de pago, pero conserva el orden
  // elegido si sigue siendo válido para el estado por defecto (es una preferencia de lectura).
  const clearFilters = useCallback(
    () => setFilters(f => ({ ...FILTROS_INICIALES, orden: normalizarOrden(f.orden, FILTROS_INICIALES.estado) })),
    [],
  )

  // Si venimos desde Historial con un saldo pre-seleccionado, abrirlo directo
  useEffect(() => {
    if (location.state?.saldoInicial) {
      setSelected(location.state.saldoInicial)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  // ── Filtros derivados ─────────────────────────────────────────────────
  const searchDebounced = useDebounce(filters.search)
  const filtrosActivos  = contarFiltrosActivos(filters)
  // Red de seguridad: el orden efectivo SIEMPRE es válido para el estado (selector, tabla y consulta
  // leen el mismo valor).
  const ordenEfectivo = normalizarOrden(filters.orden, filters.estado)
  const { campo: ordenCampo, dir: ordenDir } = parseOrden(ordenEfectivo)
  // Rango de fecha de pago: lo escrito vs. lo consultado. Con «hasta» < «desde» se informa el
  // error y NO se consulta (Escenario 6): `pagoAplicado` conserva el último rango válido.
  const { aplicado: pagoAplicado, error: errorRango } =
    useRangoFechaAplicado(filters.pagoDesde, filters.pagoHasta)

  // ── KPIs sobre el conjunto FILTRADO ───────────────────────────────────
  // Usan exactamente los mismos filtros que el listado (estado, búsqueda con debounce y último rango
  // de fecha de pago válido), así que cifras y tabla coinciden. `reqKpisRef` descarta respuestas de
  // consultas anteriores (al tipear o cambiar filtros rápido no pisan a la más reciente); ante un
  // error se conservan los últimos valores mostrados.
  const reqKpisRef = useRef(0)
  const cargarKpis = useCallback(() => {
    const reqId = ++reqKpisRef.current
    obtenerKPIsSaldos({
      estado:         filters.estado !== 'all' ? filters.estado : null,
      search:         searchDebounced,
      fechaPagoDesde: pagoAplicado.desde || null,
      fechaPagoHasta: pagoAplicado.hasta || null,
    })
      .then((valores) => { if (reqId === reqKpisRef.current) setKpis(valores) })
      .catch((e) => { if (reqId === reqKpisRef.current) console.error('[Saldos] No se pudieron cargar los KPIs', e) })
  }, [filters.estado, searchDebounced, pagoAplicado.desde, pagoAplicado.hasta])

  useEffect(() => { cargarKpis() }, [cargarKpis])

  // ── Datos + paginación (EN EL SERVIDOR) ───────────────────────────────
  // Filtros, búsqueda, rango de fecha de pago, orden y la página pedida los resuelve la base
  // (obtenerSaldosPagina → `.range()` + total exacto): no hay tope de filas y solo viaja la página
  // visible. Cambiar un filtro refetchea y resetea la página; desktop y mobile leen el mismo
  // `paginated`. `reload()` nunca resetea la página (se usa tras marcar/imputar un pago).
  const {
    pageItems:  paginated,
    items:      saldos,
    totalCount,
    page, setPage, totalPages,
    loading:    isLoading,
    error,
    reload:     load,
  } = usePaginatedList({
    mode: 'server',
    fetcher: (f) => obtenerSaldosPagina({
      estado:         f.filterEst !== 'all' ? f.filterEst : null,
      ordenPor:       f.ordenCampo === CAMPO_FECHA_PAGO ? CAMPO_FECHA_PAGO : 'vencimiento',
      orden:          f.ordenDir,
      search:         f.search,
      fechaPagoDesde: f.pagoDesde || null,
      fechaPagoHasta: f.pagoHasta || null,
      page:           f.page,
      pageSize:       f.pageSize,
    }),
    serverFilters: {
      filterEst: filters.estado,
      search:    searchDebounced,
      ordenCampo,
      ordenDir,
      pagoDesde: pagoAplicado.desde,
      pagoHasta: pagoAplicado.hasta,
    },
    pageSize: PAGE_SIZE,
  })
  const hasError = Boolean(error)

  const { anchorRef: tableAnchorRef, scrollToStart } = useScrollAnchor()

  // Mobile/tablet: lista ↔ detalle se alternan por estado (sin cambiar la URL);
  // cada vista nueva debe arrancar desde el inicio. Va antes del `return` condicional.
  useScrollToTopOnView(selected ? `detalle:${selected.idSaldo ?? selected.idPresupuesto}` : 'lista')

  function handleUpdated(msg) {
    setToast(msg)
    // Refrescar también los KPIs después de marcar/imputar un pago
    cargarKpis()
    load()
  }

  if (selected) {
    return (
      <SaldoDetalle
        saldo={selected}
        onBack={() => { setSelected(null); load() }}
        onUpdated={handleUpdated}
      />
    )
  }

  const fmtCompactoARS = (n) =>
    new Intl.NumberFormat('es-AR', { notation: 'compact', style: 'currency', currency: 'ARS' }).format(n ?? 0)
  const plural = (n, uno, varios) => (n !== 1 ? varios : uno)

  return (
    <div className="w-full min-w-0 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
      {!online && <OfflineBanner />}

      <PagoParcialModal
        open={pagoModalOpen}
        onClose={() => setPagoModalOpen(false)}
        onSuccess={handleUpdated}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <PageHeader title="Saldos" subtitle="Cobros por cuenta corriente" />
        <Button icon={Coins} className="w-full sm:w-auto min-h-[44px]" onClick={() => setPagoModalOpen(true)}>
          Registrar Pago Parcial
        </Button>
      </div>

      {/* KPIs del conjunto filtrado (mismos filtros que el listado; sin filtros = total global) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="Pendiente de cobro" value={fmtCompactoARS(kpis.totalPendiente)}
          valueClass="text-yellow-400"
          hint={`${kpis.cantPendientes} ${plural(kpis.cantPendientes, 'saldo', 'saldos')}`} />

        {kpis.cantVencidos > 0 ? (
          <KpiCard label="Vencidos" surface="red" value={fmtCompactoARS(kpis.vencidos)}
            valueClass="text-red-400"
            hint={`${kpis.cantVencidos} ${plural(kpis.cantVencidos, 'saldo vencido', 'saldos vencidos')}`} />
        ) : (
          <KpiCard label="Vencidos" value="$0" valueClass="text-emerald-400" hint="Sin saldos vencidos" />
        )}

        <KpiCard label="Pagos parciales pendientes" surface="blue" value={fmtCompactoARS(kpis.totalEnParcial)}
          valueClass="text-blue-400"
          hint={`${kpis.cantParciales} ${plural(kpis.cantParciales, 'saldo con abono', 'saldos con abono')}`} />

        <KpiCard label="Total cobrado" value={fmtCompactoARS(kpis.totalCobrado)}
          valueClass="text-emerald-400" hint="ingresado al sistema" />
      </div>

      <SaldosFilters
        filters={{ ...filters, orden: ordenEfectivo }}
        onChange={setFilter}
        onClear={clearFilters}
        filtrosActivos={filtrosActivos}
        total={totalCount}
        errorRango={errorRango}
      />

      {/* Listado: tarjetas en mobile, tabla desde tablet */}
      <div ref={tableAnchorRef}>
        <Card className="overflow-hidden">
          {hasError ? (
            <ListError onRetry={load} />
          ) : isLoading && saldos.length === 0 ? (
            <ListSkeleton />
          ) : saldos.length === 0 ? (
            <EmptyState estado={filters.estado} hayFiltros={filtrosActivos > 0} onClear={clearFilters} />
          ) : (
            <>
              <SaldosCardList items={paginated} onOpen={setSelected} />
              <SaldosTable items={paginated} onOpen={setSelected} orden={ordenEfectivo} onOrden={(o) => setFilter('orden', o)}
                permiteOrdenPago={permiteOrdenFechaPago(filters.estado)} />
            </>
          )}

          {!hasError && (
            <PaginadorListado
              page={page} totalPages={totalPages} pageSize={PAGE_SIZE} total={totalCount}
              onChange={(n) => { setPage(n); scrollToStart() }}
            />
          )}
        </Card>
      </div>
    </div>
  )
}
