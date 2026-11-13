// src/pages/admin/abmc/DebeHaber.jsx
// Migrado desde ABMC.jsx sin cambios funcionales (Task 2).
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Button, Input, Select, Modal, Table, Tr, Td, Badge, Card, Spinner } from '../../../components/ui'
import { useScrollAnchor } from '../../../hooks/useScrollToTopOnChange'
import { Plus, Pencil, Trash2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { registrarMonto, confirmarMonto, editarMonto, eliminarMonto, buscarClientesParaMonto } from '../../../services/clienteMontosService'
import { validarMonto, validarFormularioMonto, nuevaClaveIdempotencia } from '../../../services/clienteMontosValidation'
import { useMontosPendientes, useOnlineStatus } from '../../../hooks/useMontosPendientes'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { useDebounce } from '../../../hooks/useDebounce'
import { Pagination, ConfirmModal, InfoBanner } from './comunes'
import FiltrosMovil, { BuscadorListado } from '../../../components/ui/FiltrosMovil'
import { useBreakpoint } from '../../../hooks/useBreakpoint'

// ═══════════════════════════════════════════════════════════════════════════════
// DEBE / HABER
// Alta desde el ABMC de clientes (DebeHaberModal) + listado de pendientes con
// confirmación irreversible (panel DebeHaber).
// ═══════════════════════════════════════════════════════════════════════════════

// Panel de filtros mobile/tablet: valores por defecto = los del hook (Pendientes, todos los tipos, más recientes).
const DEFAULTS_FILTROS_MOVIL = Object.freeze({ estado: 'pendiente', tipo: '', orden: 'desc' })
const CAMPOS_FILTROS_MOVIL = [
  { tipo: 'select', clave: 'estado', etiqueta: 'Estado', opciones: [
    { value: 'pendiente', label: 'Pendientes' }, { value: 'confirmado', label: 'Confirmados' }, { value: '', label: 'Todos' },
  ] },
  { tipo: 'select', clave: 'tipo', etiqueta: 'Tipo', opciones: [
    { value: '', label: 'Todos' }, { value: 'debe', label: 'Debe' }, { value: 'haber', label: 'Haber' },
  ] },
  { tipo: 'select', clave: 'orden', etiqueta: 'Ordenar por fecha', opciones: [
    { value: 'desc', label: 'Más recientes' }, { value: 'asc', label: 'Más antiguos' },
  ] },
]

const TIPO_META = {
  debe:  { label: 'Debe',  color: 'red',   hint: 'El cliente adeuda este monto (a cobrar)' },
  haber: { label: 'Haber', color: 'green', hint: 'Monto a favor del cliente (a reintegrar)' },
}

// fmt() global oculta los centavos; para montos Debe/Haber siempre mostramos 2 decimales.
const fmtMonto = (n) =>
  n != null
    ? Number(n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—'

// Formato de cliente: NOMBRE APELLIDO (sin coma).
const nombreCompleto = (c) => (c ? [c.nombre, c.apellido].filter(Boolean).join(' ') : '')

// Mismo formato que el resto del ABMC (formatearFecha): DD-MM-AAAA. created_at es timestamptz (UTC),
// así que se toma el día en la zona horaria local para no correr la fecha de noche.
const fmtFecha = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

function SuccessBanner({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [message, onClose])
  if (!message) return null
  return (
    <div role="status" aria-live="polite" className="flex items-start gap-3 bg-green-500/10 border border-green-500/30 rounded-xl p-3">
      <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-green-200 text-xs font-body leading-relaxed flex-1">{message}</p>
      <button onClick={onClose} className="text-green-400/70 hover:text-green-200 text-xs shrink-0" aria-label="Cerrar aviso">✕</button>
    </div>
  )
}

const inputBase = 'w-full bg-surface-700 border rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500'

function DebeHaberModal({ open, editRow, onClose, onSaved }) {
  const [cliente, setCliente] = useState(null)
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState('')
  const [monto, setMonto] = useState('')
  const [tipo, setTipo] = useState('')
  const [errors, setErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const online = useOnlineStatus()
  const claveRef = useRef(null)   // clave de idempotencia de ESTE intento de guardado
  const busquedaDebounced = useDebounce(busquedaCliente, 350)

  // useAsyncAction = latch síncrono (cubre también Enter, que no pasa por el Button),
  // watchdog de timeout y setState seguro si el modal se desmonta.
  const { run: ejecutarGuardado, pending, reset } = useAsyncAction(
    async (valor) => {
      if (editRow) {
        await editarMonto({ idMonto: editRow.idMonto, idCliente: cliente.idCliente, monto: valor, tipo })
      } else {
        if (!claveRef.current) claveRef.current = nuevaClaveIdempotencia()
        await registrarMonto({
          idCliente: cliente.idCliente, monto: valor, tipo, idempotencyKey: claveRef.current,
        })
      }
      return { tipo, monto: valor, cliente, editado: !!editRow }
    },
    {
      nombre: editRow ? 'editarMonto' : 'registrarMonto',
      onSuccess: (r) => { if (r) onSaved?.(r) },
      onError: (e) => setSubmitError(e.message),
    },
  )

  useEffect(() => {
    if (!open) return
    setCliente(editRow?.cliente ?? null)
    setBusquedaCliente(''); setResultados([]); setErrorBusqueda('')
    setMonto(editRow ? String(editRow.monto).replace('.', ',') : '')
    setTipo(editRow?.tipo ?? '')
    setErrors({}); setSubmitError('')
    claveRef.current = null
    reset()
  }, [open, editRow, reset])

  // Búsqueda de cliente (debounced, descarta respuestas obsoletas).
  useEffect(() => {
    const q = busquedaDebounced.trim()
    if (!open || cliente || q === '') { setResultados([]); setBuscando(false); setErrorBusqueda(''); return undefined }
    let vigente = true
    setBuscando(true); setErrorBusqueda('')
    buscarClientesParaMonto(q)
      .then((r) => { if (vigente) setResultados(r) })
      .catch((e) => { if (vigente) { setResultados([]); setErrorBusqueda(e.message) } })
      .finally(() => { if (vigente) setBuscando(false) })
    return () => { vigente = false }
  }, [busquedaDebounced, cliente, open])

  const parsed = useMemo(() => validarMonto(monto), [monto])
  const preview = parsed.valid && parsed.redondeado ? parsed.value : null

  // Si cambia el contenido, es otra intención de guardado → clave nueva.
  const tocar = (campo) => {
    claveRef.current = null; setSubmitError('')
    if (errors[campo]) setErrors(p => ({ ...p, [campo]: undefined }))
  }
  const onMonto = (e) => { setMonto(e.target.value); tocar('monto') }
  const onTipo = (v) => { setTipo(v); tocar('tipo') }
  const elegirCliente = (c) => { setCliente(c); setBusquedaCliente(''); setResultados([]); tocar('cliente') }
  const cambiarCliente = () => { setCliente(null); claveRef.current = null }

  function guardar() {
    const res = validarFormularioMonto({ monto, tipo })
    const errs = res.valid ? {} : { ...res.errors }
    if (!cliente) errs.cliente = 'Seleccioná un cliente.'
    if (Object.keys(errs).length > 0) { setErrors(errs); return undefined }
    setSubmitError('')
    return ejecutarGuardado(res.value) // devuelve Promise → el Button muestra spinner
  }

  const nombreCliente = nombreCompleto(cliente)

  return (
    <Modal open={open} onClose={onClose} busy={pending} title={editRow ? 'Editar Debe/Haber' : 'Nuevo Debe/Haber'} width="max-w-md">
      <div className="space-y-5">
        {cliente ? (
          <div className="bg-surface-700 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-surface-400 text-xs font-body">Cliente</p>
              <p className="text-white text-sm font-body font-medium break-words">{nombreCliente}</p>
              {(cliente.apodo || cliente.nombreComercio) && (
                <p className="text-surface-500 text-xs">{[cliente.apodo, cliente.nombreComercio].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={cambiarCliente} disabled={pending}>Cambiar</Button>
          </div>
        ) : (
          <div>
            <Input
              label="Cliente *" type="search" autoComplete="off" disabled={pending}
              value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)}
              placeholder="Buscar por ID, nombre, apellido o apodo…" error={errors.cliente}
            />
            <div className="mt-2" aria-live="polite">
              {buscando && <p className="text-surface-500 text-xs">Buscando…</p>}
              {errorBusqueda && <p role="alert" className="text-red-400 text-xs">{errorBusqueda}</p>}
              {!buscando && !errorBusqueda && busquedaDebounced.trim() !== '' && resultados.length === 0 && (
                <p className="text-surface-500 text-xs">No se encontraron clientes.</p>
              )}
            </div>
            {resultados.length > 0 && (
              <ul aria-label="Resultados de búsqueda" className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-surface-600 divide-y divide-surface-700">
                {resultados.map(c => (
                  <li key={c.idCliente}>
                    <button
                      type="button" onClick={() => elegirCliente(c)}
                      className="w-full text-left px-3 py-2.5 min-h-[44px] bg-surface-700 hover:bg-surface-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <span className="block text-sm text-white">{nombreCompleto(c)}</span>
                      <span className="block text-xs text-surface-400">
                        #{c.idCliente}{(c.apodo || c.nombreComercio) ? ` · ${[c.apodo, c.nombreComercio].filter(Boolean).join(' · ')}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <Input
            label="Monto ($) *" value={monto} onChange={onMonto} error={errors.monto}
            type="text" inputMode="decimal" autoComplete="off" placeholder="0,00" disabled={pending}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardar() } }}
          />
          {!errors.monto && (
            <p className="text-surface-500 text-xs mt-1.5" aria-live="polite">
              {preview != null ? `Se guardará como ${fmtMonto(preview)}` : 'Usá coma o punto para los decimales (ej. 1500,50).'}
            </p>
          )}
        </div>

        <fieldset disabled={pending} aria-describedby={errors.tipo ? 'dh-tipo-err' : undefined}>
          <legend className="block text-surface-300 text-xs tracking-widest uppercase font-body mb-1.5">Tipo *</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-required="true">
            {Object.entries(TIPO_META).map(([val, meta]) => (
              <label key={val} className="cursor-pointer">
                <input
                  type="radio" name="dh-tipo" value={val} checked={tipo === val}
                  onChange={() => onTipo(val)} className="sr-only peer"
                />
                <span className={`block rounded-xl border px-3 py-2.5 min-h-[44px] transition-colors
                  peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500
                  ${errors.tipo ? 'border-red-500' : 'border-surface-600'}
                  bg-surface-700 hover:border-surface-500
                  ${val === 'debe'
                    ? 'peer-checked:border-red-400 peer-checked:bg-red-500/10'
                    : 'peer-checked:border-green-400 peer-checked:bg-green-500/10'}`}>
                  <span className="block text-sm font-body font-medium text-white">{meta.label}</span>
                  <span className="block text-xs font-body text-surface-400">{meta.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.tipo && <p id="dh-tipo-err" role="alert" className="text-red-400 text-xs mt-1.5">{errors.tipo}</p>}
        </fieldset>

        {!online && <p role="alert" className="text-yellow-300 text-xs">Sin conexión: no se puede guardar hasta reconectar.</p>}
        {submitError && <p role="alert" className="text-red-400 text-xs">{submitError}</p>}

        <div className="flex gap-3 pt-3 mt-2 -mx-6 -mb-6 px-6 pb-6 sticky bottom-0 bg-surface-800 border-t border-surface-700/60 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0 sm:pt-2 sm:mt-0 sm:border-t-0 sm:bg-transparent">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button className="flex-1" onClick={guardar} loading={pending} loadingText="Guardando el movimiento" disabled={!online}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function DebeHaber() {
  const {
    rows, total, page, pageSize, loading, error, estado, tipo, orden, busqueda, hayFiltros,
    setPage, setEstado, setTipo, setOrden, setBusqueda, limpiarFiltros, refetch,
  } = useMontosPendientes()
  const { isCompact } = useBreakpoint()
  const online = useOnlineStatus()
  const { anchorRef: tableAnchorRef, scrollToStart } = useScrollAnchor()
  const [target, setTarget] = useState(null)
  const [confirmError, setConfirmError] = useState('')
  const [flash, setFlash] = useState('')
  const [modal, setModal] = useState({ open: false, row: null }) // alta (row=null) o edición
  const [delTarget, setDelTarget] = useState(null)
  const [delError, setDelError] = useState('')
  const clearFlash = useCallback(() => setFlash(''), [])

  const cerrarModal = () => setModal(m => ({ ...m, open: false }))

  function alGuardar({ tipo, monto, cliente, editado }) {
    cerrarModal()
    const base = `${TIPO_META[tipo]?.label ?? ''} de ${fmtMonto(monto)} para ${nombreCompleto(cliente)}`
    setFlash(editado ? `Se actualizó el movimiento ${base}.` : `Se registró ${base} (Pendiente).`)
    if (!editado && estado === 'confirmado') setEstado('pendiente') // el alta nueva es Pendiente: mostrarla
    else if (!editado && page !== 1) setPage(1)                    // el alta más reciente aparece en la primera página
    else refetch()                                                 // edición: se mantiene la página actual
  }

  // Eliminación (solo pendientes): mismo latch que el resto de acciones críticas.
  const { run: ejecutarEliminacion, pending: deleting } = useAsyncAction(
    async (row) => { await eliminarMonto(row.idMonto); return row },
    {
      nombre: 'eliminarMonto',
      onSuccess: (row) => {
        if (!row) return
        setFlash(`Se eliminó el movimiento ${TIPO_META[row.tipo]?.label ?? ''} de ${fmtMonto(row.monto)} (${row.clienteEtiqueta}).`)
        setDelTarget(null)
        refetch() // usePaginatedList ajusta la página si quedó vacía
      },
      onError: (e) => {
        setDelError(e.message)
        if (e.code === 'MONTO_YA_CONFIRMADO' || e.code === 'MONTO_NO_ENCONTRADO') refetch()
      },
    },
  )
  function cerrarEliminacion() {
    if (deleting) return
    setDelTarget(null); setDelError('')
  }

  // La confirmación es irreversible: latch síncrono para que NUNCA se envíe dos veces.
  const { run: ejecutarConfirmacion, pending: confirming } = useAsyncAction(
    async (row) => { await confirmarMonto(row.idMonto); return row },
    {
      nombre: 'confirmarMonto',
      onSuccess: (row) => {
        if (!row) return
        setFlash(`Se confirmó el movimiento ${TIPO_META[row.tipo]?.label ?? ''} de ${fmtMonto(row.monto)} (${row.clienteEtiqueta}).`)
        setTarget(null)
        refetch() // sin resetear la página (usePaginatedList)
      },
      onError: (e) => {
        setConfirmError(e.message)
        // Otro usuario lo confirmó / ya no existe: refrescamos para que desaparezca de la lista.
        if (e.code === 'MONTO_YA_CONFIRMADO' || e.code === 'MONTO_NO_ENCONTRADO') refetch()
      },
    },
  )

  function abrirConfirmacion(row) { setConfirmError(''); setTarget(row) }
  function cerrarConfirmacion() {
    if (confirming) return
    setTarget(null); setConfirmError('')
  }
  const aceptar = () => (target ? ejecutarConfirmacion(target) : undefined)

  let body
  if (loading && rows.length === 0 && !error) {
    body = (
      <div className="py-12 flex justify-center"><Spinner label="Cargando montos pendientes" /></div>
    )
  } else if (error) {
    body = (
      <div role="alert" className="p-8 flex flex-col items-center gap-3 text-center">
        <AlertTriangle size={28} className="text-red-400" aria-hidden="true" />
        <p className="text-surface-200 text-sm font-body">{error}</p>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={refetch}>Reintentar</Button>
      </div>
    )
  } else if (rows.length === 0) {
    body = (
      <div className="p-10 text-center space-y-2">
        <p className="text-surface-200 text-sm font-body">
          {estado === 'confirmado' ? 'No hay montos confirmados' : estado === '' ? 'No hay montos registrados' : 'No hay montos pendientes'}
        </p>
        {!hayFiltros && <p className="text-surface-500 text-xs">Usá “Nuevo Debe/Haber” para registrar el primero.</p>}
        {hayFiltros && (
          <button onClick={limpiarFiltros} className="text-brand-400 hover:underline text-xs font-body">Limpiar filtros</button>
        )}
      </div>
    )
  } else {
    body = (
      <div aria-busy={loading} className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <Table headers={['Cliente', 'Fecha', 'Tipo', 'Monto', 'Estado', '']} empty={null}>
          {rows.map(r => (
            <Tr key={r.idMonto}>
              <Td>
                <span className="text-white">{r.clienteEtiqueta}</span>
                {r.clienteSecundario && <span className="block text-xs text-surface-500">{r.clienteSecundario}</span>}
              </Td>
              <Td className="text-surface-400">{fmtFecha(r.fechaAlta)}</Td>
              <Td><Badge color={TIPO_META[r.tipo]?.color ?? 'gray'}>{TIPO_META[r.tipo]?.label ?? r.tipo}</Badge></Td>
              <Td className="font-mono tabular-nums">{fmtMonto(r.monto)}</Td>
              <Td>
                <Badge color={r.estado === 'confirmado' ? 'green' : 'yellow'}>{r.estado.charAt(0).toUpperCase() + r.estado.slice(1)}</Badge>
                {r.estado === 'confirmado' && r.confirmadoAt && (
                  <span className="block text-xs text-surface-500 mt-0.5">{fmtFecha(r.confirmadoAt)}</span>
                )}
              </Td>
              <Td>
                <div className="flex gap-2 justify-end">
                  {/* Solo pendientes muestran acciones: un confirmado es inmutable. */}
                  {r.estado === 'pendiente' && (
                    <>
                      <Button
                        size="sm" variant="secondary" icon={CheckCircle2} disabled={!online}
                        aria-label={`Confirmar ${TIPO_META[r.tipo]?.label ?? ''} de ${fmtMonto(r.monto)} de ${r.clienteEtiqueta}`}
                        onClick={() => { setConfirmError(''); setTarget(r) }}
                      >
                        Confirmar
                      </Button>
                      <Button
                        variant="ghost" size="sm" icon={Pencil} disabled={!online}
                        aria-label={`Editar movimiento de ${r.clienteEtiqueta}`}
                        onClick={() => setModal({ open: true, row: r })}
                      />
                      <Button
                        variant="ghost" size="sm" icon={Trash2} className="hover:text-red-400" disabled={!online}
                        aria-label={`Eliminar movimiento de ${r.clienteEtiqueta}`}
                        onClick={() => { setDelError(''); setDelTarget(r) }}
                      />
                    </>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </Table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SuccessBanner message={flash} onClose={clearFlash} />
      {!online && <InfoBanner message="Sin conexión: no se pueden confirmar movimientos hasta reconectar." />}

      {/* Mobile/tablet (≤ 1024px): patrón único de filtros (buscador + botón «Filtros» + panel).
          Desktop: barra inline original, aplicación inmediata (sin cambios). */}
      {isCompact ? (
        <div className="space-y-2">
          <FiltrosMovil
            busqueda={(
              <BuscadorListado id="dh-buscar" value={busqueda} onChange={setBusqueda}
                placeholder="Buscar cliente por ID, nombre, apellido o apodo…" etiqueta="Buscar cliente" />
            )}
            value={{ estado, tipo, orden }}
            defaults={DEFAULTS_FILTROS_MOVIL}
            campos={CAMPOS_FILTROS_MOVIL}
            onApply={(b) => { setEstado(b.estado); setTipo(b.tipo); setOrden(b.orden) }}
          />
          <Button icon={Plus} className="w-full justify-center" onClick={() => setModal({ open: true, row: null })}>Nuevo Debe/Haber</Button>
        </div>
      ) : (
      <div className="flex flex-col lg:flex-row gap-2 lg:items-center w-full">
        <div className="flex-1">
          <label htmlFor="dh-buscar" className="sr-only">Buscar cliente</label>
          <input
            id="dh-buscar" type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar cliente por ID, nombre, apellido o apodo…"
            className={`${inputBase} border-surface-600`}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 lg:w-48">
            <Select aria-label="Filtrar por estado" value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="pendiente">Pendientes</option>
              <option value="confirmado">Confirmados</option>
              <option value="">Todos los estados</option>
            </Select>
          </div>
          <div className="flex-1 lg:w-48">
            <Select aria-label="Filtrar por tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="">Todos los tipos</option>
              <option value="debe">Debe</option>
              <option value="haber">Haber</option>
            </Select>
          </div>
          <div className="flex-1 lg:w-48">
            <Select aria-label="Ordenar por fecha" value={orden} onChange={e => setOrden(e.target.value)}>
              <option value="desc">Más recientes</option>
              <option value="asc">Más antiguos</option>
            </Select>
          </div>
        </div>
        <Button icon={Plus} onClick={() => setModal({ open: true, row: null })}>Nuevo Debe/Haber</Button>
      </div>
      )}

      <div ref={tableAnchorRef}>
        <Card>
          {body}
          {!error && rows.length > 0 && (
            <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} onNavigate={scrollToStart} />
          )}
        </Card>
      </div>

      <ConfirmModal
        open={!!target} onClose={cerrarConfirmacion} onConfirm={aceptar}
        loading={confirming} error={confirmError}
        title="Confirmar movimiento" confirmLabel="Aceptar" loadingLabel="Confirmando…"
        confirmVariant={null} Icon={CheckCircle2} iconClassName="text-green-400"
        details={target ? [
          ['Cliente', target.clienteEtiqueta],
          ['Tipo', TIPO_META[target.tipo]?.label ?? target.tipo],
          ['Monto', fmtMonto(target.monto)],
          ['Fecha', fmtFecha(target.fechaAlta)],
        ] : []}
        message="¿Confirmar que este monto se concretó?"
        warning="Esta acción es irreversible: una vez confirmado, el movimiento no podrá volver a confirmarse ni modificarse."
      />

      <DebeHaberModal open={modal.open} editRow={modal.row} onClose={cerrarModal} onSaved={alGuardar} />

      <ConfirmModal
        open={!!delTarget} onClose={cerrarEliminacion}
        onConfirm={() => (delTarget ? ejecutarEliminacion(delTarget) : undefined)}
        loading={deleting} error={delError}
        details={delTarget ? [
          ['Cliente', delTarget.clienteEtiqueta],
          ['Tipo', TIPO_META[delTarget.tipo]?.label ?? delTarget.tipo],
          ['Monto', fmtMonto(delTarget.monto)],
          ['Fecha', fmtFecha(delTarget.fechaAlta)],
        ] : []}
        message="¿Estás seguro de ELIMINAR este movimiento?"
      />
    </div>
  )
}
