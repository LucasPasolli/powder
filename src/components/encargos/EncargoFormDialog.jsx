// src/components/encargos/EncargoFormDialog.jsx
// TASK 1 — Crear encargo de cliente (Escenarios 2, 3 y 4).
//
//   · E2  Pide los datos mínimos (cliente, productos, cantidad) y muestra la fecha que se asigna
//         automáticamente (el valor real lo fija el servidor, en hora de Argentina).
//   · E3  «Guardar» → crearEncargo → queda «Pendiente» y asociado al cliente (un solo RPC transaccional).
//   · E4  Campo obligatorio sin completar → resumen + marca por campo, foco al primero, NO se registra.
//
// Responsive: ResponsiveDialog = pantalla completa en mobile/tablet (≤ 1024 px) y modal centrado en
// escritorio. Es UN solo árbol DOM: rotar el equipo no remonta ni pierde lo cargado.
// Se monta SÓLO mientras está abierto (el padre lo renderiza condicionalmente): cada apertura es un
// formulario limpio con una clave de idempotencia nueva.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, ClipboardList, Loader2, Save, WifiOff } from 'lucide-react'
import ResponsiveDialog from '../ui/ResponsiveDialog'
import { Button } from '../ui'
import { TOUCH, fmtFecha } from '../pedidos/pedidosPresentacion'
import { hoyLocalISO } from '../../lib/pedidoFlujo'
import { construirDetallesEncargo, validarEncargo, LIMITE_ITEMS_ENCARGO } from '../../lib/encargos'
import { crearEncargo } from '../../services/encargosService'
import { crearGestorIdempotencia } from '../../services/pedidosGuardadoService'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { logger } from '../../lib/logger'
import SelectorCliente from './SelectorCliente'
import SelectorProducto from './SelectorProducto'
import LineaEncargoEditor from './LineaEncargoEditor'

function IconoGuardando({ className = '', ...rest }) {
  return <Loader2 {...rest} className={`${className} animate-spin motion-reduce:animate-none`} aria-hidden="true" />
}

/**
 * @param {object} props
 * @param {()=>void} props.onClose
 * @param {(encargo: import('../../services/encargosService').Encargo)=>void} props.onCreado
 */
export default function EncargoFormDialog({ onClose, onCreado }) {
  const online = useOnlineStatus()
  const [cliente, setCliente] = useState(null)
  const [lineas, setLineas] = useState(/** @type {import('../../lib/encargos').LineaForm[]} */ ([]))
  const [intentoGuardar, setIntentoGuardar] = useState(false) // los errores se muestran tras el 1.er intento
  const [errorServidor, setErrorServidor] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)

  const savingRef = useRef(false)              // guardia síncrona contra doble envío
  const montadoRef = useRef(true)
  const contadorRef = useRef(0)
  // Misma intención (reintento) = misma clave; contenido corregido = clave nueva.
  const idemRef = useRef(crearGestorIdempotencia())

  useEffect(() => { montadoRef.current = true; return () => { montadoRef.current = false } }, [])

  const validacion = useMemo(() => validarEncargo({ cliente, lineas }), [cliente, lineas])
  const mostrar = intentoGuardar && !validacion.valido
  const sucio = Boolean(cliente) || lineas.length > 0

  const agregarProducto = useCallback((p) => {
    setErrorServidor('')
    setLineas((prev) => (prev.length >= LIMITE_ITEMS_ENCARGO ? prev : [...prev, {
      uid: `l${++contadorRef.current}`, idProducto: p.idProducto, nombreProducto: p.nombre,
      tieneMedidas: Boolean(p.tieneMedidas), medida: null, cantidad: '1',
    }]))
  }, [])

  const cambiarLinea = useCallback((uid, campo, valor) => {
    setErrorServidor('')
    setLineas((prev) => prev.map((l) => (l.uid === uid ? { ...l, [campo]: valor } : l)))
  }, [])
  const quitarLinea = useCallback((uid) => setLineas((prev) => prev.filter((l) => l.uid !== uid)), [])

  const pedirCerrar = useCallback(() => {
    if (savingRef.current) return
    if (sucio) setConfirmarDescarte(true)
    else onClose()
  }, [sucio, onClose])

  async function guardar() {
    if (savingRef.current) return
    setErrorServidor('')
    setIntentoGuardar(true)

    if (!validacion.valido) {
      // Foco al primer campo inválido (el DOM ya refleja los errores en el siguiente frame).
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-encargo-invalido="true"]')
        el?.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        el?.focus({ preventScroll: true })
      })
      return
    }
    if (!online) { setErrorServidor('Sin conexión. Tus datos siguen cargados: guardá cuando vuelva la señal.'); return }

    savingRef.current = true
    setSaving(true)
    try {
      const huella = JSON.stringify({ c: cliente.idCliente, d: construirDetallesEncargo(lineas) })
      const idempotencyKey = idemRef.current.obtener(huella)
      const encargo = await crearEncargo({ idCliente: cliente.idCliente, lineas, idempotencyKey })
      idemRef.current.reiniciar()
      logger.info('encargos.creado', { idEncargo: encargo.idEncargo, reutilizado: encargo.reutilizado })
      onCreado(encargo)
    } catch (err) {
      // Mensaje ya traducido y seguro (EncargoError). El formulario conserva todo para reintentar.
      if (montadoRef.current) setErrorServidor(err?.message || 'No se pudo guardar el encargo.')
    } finally {
      savingRef.current = false
      if (montadoRef.current) setSaving(false)
    }
  }

  const hoy = fmtFecha(hoyLocalISO())

  const pie = (
    <div className="px-4 sm:px-6 py-3 border-t border-surface-700 space-y-3">
      {confirmarDescarte && (
        <div role="alertdialog" aria-label="Descartar encargo" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-amber-200 text-sm font-body">¿Descartar el encargo sin guardar? Se perderá lo que cargaste.</p>
          <div className="mt-2 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="secondary" className={TOUCH} onClick={() => setConfirmarDescarte(false)}>Seguir editando</Button>
            <Button variant="danger" className={TOUCH} onClick={onClose}>Descartar</Button>
          </div>
        </div>
      )}
      {mostrar && (
        <div role="alert" className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 max-h-32 overflow-y-auto">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" /><span>{validacion.resumen}</span>
        </div>
      )}
      {errorServidor && (
        <div role="alert" className="flex items-start gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 max-h-32 overflow-y-auto">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" /><span>{errorServidor}</span>
        </div>
      )}
      {!online && (
        <p role="status" className="flex items-center gap-2 text-yellow-300 text-sm font-body"><WifiOff size={14} aria-hidden="true" />Sin conexión: no se podrá guardar hasta que vuelva.</p>
      )}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Button variant="secondary" className={`${TOUCH} sm:min-w-[8rem]`} onClick={pedirCerrar} disabled={saving}>Cancelar</Button>
        <Button className={`${TOUCH} sm:min-w-[10rem]`} icon={saving ? IconoGuardando : Save} onClick={guardar} aria-busy={saving} loadingText="Guardando el encargo…">
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{saving ? 'Guardando el encargo…' : ''}</p>
    </div>
  )

  return (
    <ResponsiveDialog
      open onClose={pedirCerrar} title="Crear Encargo" icon={ClipboardList} busy={saving}
      subtitle="Registrá lo que un cliente necesita para incluirlo luego en un pedido a proveedor."
      footer={pie}
    >
      <div className="p-4 sm:p-6 space-y-5">
        <p className="flex items-center gap-2 text-surface-300 text-sm font-body">
          <CalendarDays size={15} className="text-brand-400 flex-shrink-0" aria-hidden="true" />
          <span>Fecha del encargo: <strong className="text-white">{hoy}</strong> <span className="text-surface-500">(se asigna automáticamente al guardar)</span></span>
        </p>

        <SelectorCliente value={cliente} onChange={(c) => { setCliente(c); setErrorServidor('') }} error={mostrar ? validacion.cliente : undefined} disabled={saving} />

        <section aria-labelledby="enc-productos" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="enc-productos" className="text-surface-300 text-sm min-[1025px]:text-xs tracking-widest uppercase font-body">Productos *</h3>
            <span className="text-surface-500 text-sm min-[1025px]:text-xs font-body">{lineas.length} de {LIMITE_ITEMS_ENCARGO}</span>
          </div>
          <SelectorProducto onElegir={agregarProducto} error={mostrar ? validacion.productos : undefined} disabled={saving || lineas.length >= LIMITE_ITEMS_ENCARGO} />

          {lineas.length === 0 ? (
            <p className="text-center py-6 text-surface-500 text-sm font-body border border-dashed border-surface-700 rounded-xl">
              Todavía no agregaste productos. Buscalos por nombre o ID.
            </p>
          ) : (
            <ul aria-label="Productos del encargo" className="space-y-2">
              {lineas.map((l, i) => (
                <LineaEncargoEditor key={l.uid} linea={l} indice={i} error={mostrar ? validacion.lineas[l.uid] : undefined}
                  disabled={saving} onCambiar={cambiarLinea} onQuitar={quitarLinea} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </ResponsiveDialog>
  )
}
