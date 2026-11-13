// src/pages/Promociones.jsx
// ABMC del sistema de Promociones.
// Usa exclusivamente promocionesService y productosService (sin lógica de BD aquí).
//
// Cambios de esta versión:
//   · Task 1 — una promoción «Producto específico» admite N productos (ProductosSelector).
//   · Task 2 — selector de tipo de promoción con orden fijo: Producto específico,
//              Categoría, A todo el carrito (fuente única: lib/promocionesConfig).
//   · Task 3 — botón «Eliminar» por fila con confirmación (ConfirmModal compartido).
//   · Task 4 — paginación con el MISMO componente y tamaño de página que el resto de
//              las tablas (Pagination + PAGE_SIZE) y el hook usePaginatedList, que
//              conserva la página tras crear/editar/eliminar y la ajusta si queda fuera
//              de rango.

import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Tag, Pencil, Trash2, Power, PowerOff, AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'

import {
  obtenerPromociones,
  crearPromocion,
  actualizarPromocion,
  togglePromocion,
  eliminarPromocion,
} from '../services/promocionesService'
import { ErrorOperacion } from '../services/idempotencia'
import { obtenerProductos, obtenerCategorias } from '../services/productosService'
import { Button, Card, PageHeader, Modal, Input, Table, Tr, Td, Spinner } from '../components/ui'
import FiltrosMovil from '../components/ui/FiltrosMovil'
import { ALTO_CONTROL, CLASE_ETIQUETA } from '../components/ui/controles'
import ProductosSelector from '../components/promociones/ProductosSelector'
import ProductosAsociados from '../components/promociones/ProductosAsociados'
import ResolverConflictos from '../components/promociones/ResolverConflictos'
import { Pagination, ConfirmModal, PAGE_SIZE } from './admin/abmc/comunes'
import { useBreakpoint } from '../hooks/useBreakpoint'
import usePaginatedList from '../hooks/usePaginatedList'
import { useScrollAnchor } from '../hooks/useScrollToTopOnChange'
import {
  ALCANCE_OPCIONES,
  ALCANCE_LABELS,
  ALCANCE_POR_DEFECTO,
  ALCANCE_HISTORICO,
  MODALIDAD_OPCIONES,
  TIPO_LABELS,
  validarSeleccionProductos,
  textoCantidadProductos,
  detectarConflictos,
  construirResolucion,
  DECISION_NUEVA,
} from '../lib/promocionesConfig'

// ─── Helpers ────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10) }

function fmtFecha(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function vigenciaLabel(promo) {
  const hoy = today()
  if (hoy < promo.fechaInicio) return { text: 'Próxima',  color: 'text-brand-400' }
  if (hoy > promo.fechaFin)    return { text: 'Vencida',  color: 'text-red-400'   }
  return                              { text: 'Vigente',  color: 'text-emerald-400' }
}

const MSG_ERROR_GENERICO = 'No se pudo completar la operación. Intentá nuevamente.'

/** Solo se muestran al usuario errores ya saneados por el service (ErrorOperacion). */
const mensajeDeError = (err) => (err instanceof ErrorOperacion ? err.message : MSG_ERROR_GENERICO)

/** Orden original del listado: activas primero → fin más lejano → id más nuevo. */
function compararPromos(a, b) {
  if (b.activo !== a.activo) return (b.activo ? 1 : 0) - (a.activo ? 1 : 0)
  if (b.fechaFin !== a.fechaFin) return b.fechaFin.localeCompare(a.fechaFin)
  return b.idPromocion - a.idPromocion
}

const OPCIONES_FILTRO = [
  { value: 'todas',     label: 'Todas'     },
  { value: 'activas',   label: 'Activas'   },
  { value: 'inactivas', label: 'Inactivas' },
]

function pasaFiltro(promo, { filtro }) {
  if (filtro === 'activas')   return promo.activo === true
  if (filtro === 'inactivas') return promo.activo === false
  return true
}

/**
 * Botones «solo ícono» de la fila: 44 × 44 px en mobile Y tablet (≤ 1024 px).
 * <Button> ya fuerza 44 px por debajo de `md`; en tablet (768–1024) volvía a 0, por eso
 * se refuerza con `!` (important) y se restituye el tamaño compacto sólo en escritorio.
 */
const ICONO_TACTIL = 'md:!min-h-[44px] md:!min-w-[44px] min-[1025px]:!min-h-0 min-[1025px]:!min-w-0'

// Clases de controles de formulario (altura/tipografía alineadas con el sistema: 44 px y
// 16 px en táctil — iOS no hace zoom al enfocar —, 42 px y 14 px en escritorio).
const CONTROL = `w-full ${ALTO_CONTROL} bg-surface-700 border rounded-xl px-3 text-white text-base
  min-[1025px]:text-sm font-body focus:outline-none focus:border-brand-500 transition-all`

// ─── Toast ─────────────────────────────────────────────────────────────────

function Toast({ message, tone = 'ok', onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [onDone])

  const ok = tone === 'ok'
  const Icon = ok ? CheckCircle2 : AlertCircle
  return createPortal(
    <div className="fixed top-[calc(1.25rem+env(safe-area-inset-top))] right-5 left-5 sm:left-auto z-[9999] pointer-events-none
                    flex sm:justify-end">
      <div role={ok ? 'status' : 'alert'}
        className={`flex items-center gap-3 rounded-2xl px-5 py-3 shadow-2xl animate-slide-up border max-w-full
                    ${ok ? 'bg-emerald-900/95 border-emerald-500/50' : 'bg-red-900/95 border-red-500/50'}`}>
        <Icon size={18} aria-hidden="true" className={`flex-shrink-0 ${ok ? 'text-emerald-400' : 'text-red-400'}`} />
        <span className={`text-sm font-body break-words ${ok ? 'text-emerald-100' : 'text-red-100'}`}>{message}</span>
      </div>
    </div>,
    document.body
  )
}

// ─── Estado inicial del formulario ─────────────────────────────────────────

const formVacio = () => ({
  nombre:       '',
  descripcion:  '',
  tipo:         'porcentaje_producto',
  alcance:      ALCANCE_POR_DEFECTO,
  productosSel: [],            // [{ idProducto, nombre }] — alcance 'producto'
  idCategoria:  '',
  fechaInicio:  today(),
  fechaFin:     '',
  valor:        '',
  activo:       true,
})

// ─── Modal Formulario ───────────────────────────────────────────────────────

function PromoModal({ open, onClose, onSaved, promoEditar, promociones }) {
  const [form,       setForm]       = useState(formVacio)
  const [errors,     setErrors]     = useState({})
  const [productos,  setProductos]  = useState([])
  const [categorias, setCategorias] = useState([])
  const [catalogo,   setCatalogo]   = useState({ cargando: false, error: '' })
  const [loading,    setLoading]    = useState(false)
  // Paso 2 (solo si hay conflictos): el usuario decide qué promoción queda vigente por producto.
  const [paso,        setPaso]        = useState('form')   // 'form' | 'conflictos'
  const [conflictos,  setConflictos]  = useState([])
  const [decisiones,  setDecisiones]  = useState({})
  const formRef = useRef(null)
  const idBase  = useId()

  const esNueva = !promoEditar

  // Carga de listas auxiliares. `cancelado` evita pisar el estado si el modal se cerró
  // (o se reabrió) antes de que respondiera el servidor.
  const cargarCatalogos = useCallback(() => {
    let cancelado = false
    setCatalogo({ cargando: true, error: '' })
    Promise.all([obtenerProductos(), obtenerCategorias()])
      .then(([prods, cats]) => {
        if (cancelado) return
        setProductos(prods)
        setCategorias(cats)
        setCatalogo({ cargando: false, error: '' })
      })
      .catch((err) => {
        if (cancelado) return
        console.error('[Promociones] catálogos:', err?.message)
        setCatalogo({ cargando: false, error: 'No se pudieron cargar los productos. Revisá tu conexión e intentá de nuevo.' })
      })
    return () => { cancelado = true }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    return cargarCatalogos()
  }, [open, cargarCatalogos])

  // Rellenar form si estamos editando
  useEffect(() => {
    setPaso('form'); setConflictos([]); setDecisiones({})
    if (!open) { setForm(formVacio()); setErrors({}); return }
    if (promoEditar) {
      setForm({
        nombre:       promoEditar.nombre      ?? '',
        descripcion:  promoEditar.descripcion ?? '',
        tipo:         promoEditar.tipo        ?? 'porcentaje_producto',
        alcance:      promoEditar.alcance     ?? ALCANCE_HISTORICO,
        // Copia de {idProducto, nombre}: el nombre viaja con la promo, así que un
        // producto dado de baja del catálogo se sigue viendo al editar.
        productosSel: (promoEditar.productos ?? []).map(({ idProducto, nombre }) => ({ idProducto, nombre })),
        idCategoria:  promoEditar.idCategoria != null ? String(promoEditar.idCategoria) : '',
        fechaInicio:  promoEditar.fechaInicio ?? today(),
        fechaFin:     promoEditar.fechaFin    ?? '',
        valor:        promoEditar.valor       != null ? String(promoEditar.valor) : '',
        activo:       promoEditar.activo      ?? true,
      })
    } else {
      setForm(formVacio())
    }
    setErrors({})
  }, [open, promoEditar])

  function set(k, v) {
    setForm((p) => ({ ...p, [k]: v }))
    // El error de un campo se limpia apenas el usuario lo corrige.
    const claveError = k === 'productosSel' ? 'productos' : k
    setErrors((prev) => (prev[claveError] ? { ...prev, [claveError]: undefined } : prev))
  }

  // ¿Requiere campo `valor`? (solo los tipos editables del formulario lo requieren)
  const requiereValor = form.tipo === 'porcentaje_producto' || form.tipo === 'precio_fijo'

  // Aviso EN VIVO (no bloquea): usa el listado ya cargado. La verificación definitiva, con
  // datos frescos del servidor, se hace al guardar.
  const avisoConflictos = useMemo(() => (
    open && form.alcance === 'producto'
      ? detectarConflictos({
          productosSel: form.productosSel, fechaInicio: form.fechaInicio, fechaFin: form.fechaFin,
          activo: form.activo, promociones, excluirIdPromocion: promoEditar?.idPromocion ?? null, hoy: today(),
        })
      : []
  ), [open, form.alcance, form.productosSel, form.fechaInicio, form.fechaFin, form.activo, promociones, promoEditar])

  const resolucion = useMemo(() => construirResolucion({
    idsSeleccionados: form.productosSel.map((p) => p.idProducto), conflictos, decisiones,
  }), [form.productosSel, conflictos, decisiones])

  function validar() {
    const e = {}
    if (!form.nombre.trim())              e.nombre      = 'Requerido'
    if (!form.fechaInicio)                e.fechaInicio = 'Requerido'
    if (!form.fechaFin)                   e.fechaFin    = 'Requerido'
    if (form.fechaFin && form.fechaInicio && form.fechaFin < form.fechaInicio)
                                          e.fechaFin    = 'Debe ser ≥ fecha de inicio'
    if (requiereValor) {
      const v = parseFloat(form.valor)
      if (!form.valor || isNaN(v) || v <= 0) e.valor = 'Debe ser un número mayor a 0'
    }
    const errProductos = validarSeleccionProductos(form.alcance, form.productosSel)
    if (errProductos)                     e.productos   = errProductos
    if (form.alcance === 'categoria' && !form.idCategoria)
                                          e.idCategoria = 'Seleccioná una categoría'
    return e
  }

  /** Lleva el foco al primer campo inválido (WCAG 3.3.1 / 2.4.3). */
  function enfocarPrimerError() {
    requestAnimationFrame(() => {
      const nodo = formRef.current?.querySelector('[aria-invalid="true"]')
      nodo?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      nodo?.focus?.({ preventScroll: true })
    })
  }

  /** Payload en el formato que espera el service. Los productos solo viajan para el alcance
   *  'producto' (el service y la RPC lo vuelven a imponer). */
  function armarPayload() {
    return {
      nombre:       form.nombre.trim(),
      descripcion:  form.descripcion.trim() || null,
      tipo:         form.tipo,
      alcance:      form.alcance,
      idsProductos: form.alcance === 'producto' ? form.productosSel.map((p) => p.idProducto) : [],
      idCategoria:  form.alcance === 'categoria' ? parseInt(form.idCategoria, 10) : null,
      fechaInicio:  form.fechaInicio,
      fechaFin:     form.fechaFin,
      valor:        requiereValor ? parseFloat(form.valor) : null,
      activo:       form.activo,
    }
  }

  async function persistir(payload, quitarDeOtras = []) {
    setLoading(true)
    try {
      if (esNueva) {
        await crearPromocion(payload, { quitarDeOtras })
      } else {
        await actualizarPromocion(promoEditar.idPromocion, payload, { quitarDeOtras })
      }
      onClose()
      const base = esNueva ? 'Promoción creada correctamente ✓' : 'Promoción actualizada ✓'
      onSaved(quitarDeOtras.length ? `${base} Conflictos resueltos.` : base)
    } catch (err) {
      setErrors({ _general: mensajeDeError(err) })
    } finally {
      setLoading(false)
    }
  }

  async function guardar() {
    const e = validar()
    setErrors(e)
    if (Object.keys(e).length) { enfocarPrimerError(); return }

    // ¿Algún producto ya tiene otra promoción de producto activa en esas fechas?
    // Se consulta al servidor (datos frescos): otro usuario pudo crear una hace un instante.
    if (form.alcance === 'producto' && form.activo) {
      setLoading(true)
      let hallados
      try {
        const vigentes = await obtenerPromociones()
        hallados = detectarConflictos({
          productosSel: form.productosSel, fechaInicio: form.fechaInicio, fechaFin: form.fechaFin,
          activo: form.activo, promociones: vigentes, excluirIdPromocion: promoEditar?.idPromocion ?? null, hoy: today(),
        })
      } catch (err) {
        console.error('[Promociones] verificación de conflictos:', err?.message)
        setErrors({ _general: 'No se pudo verificar si los productos ya tienen otra promoción activa. Intentá nuevamente.' })
        return
      } finally {
        setLoading(false)
      }
      if (hallados.length) {
        setConflictos(hallados)
        setDecisiones({})
        setPaso('conflictos')
        return
      }
    }

    await persistir(armarPayload())
  }

  /** Paso 2: aplica la decisión (la promoción nueva conserva solo los productos que ganó). */
  async function confirmarResolucion() {
    if (resolucion.pendientes > 0 || resolucion.idsFinales.length === 0) return
    await persistir({ ...armarPayload(), idsProductos: resolucion.idsFinales }, resolucion.quitar)
  }

  function decidirTodos(modo) {
    setDecisiones(Object.fromEntries(conflictos.map((c) => [
      c.idProducto, modo === 'nueva' ? DECISION_NUEVA : String(c.promos[0].idPromocion),
    ])))
  }

  const lblTipo = `${idBase}-tipo`
  const lblModalidad = `${idBase}-modalidad`
  const lblCategoria = `${idBase}-categoria`
  const lblDesde = `${idBase}-desde`
  const lblHasta = `${idBase}-hasta`
  const lblDesc  = `${idBase}-desc`

  return (
    <Modal open={open} onClose={onClose} busy={loading} title={paso === 'conflictos' ? 'Resolver conflictos' : esNueva ? 'Nueva Promoción' : 'Editar Promoción'}>
      <div ref={formRef} className="space-y-4">

        {/* Error general (fallo de red / BD) */}
        {errors._general && (
          <div role="alert" className="flex items-center gap-2 bg-red-900/30 border border-red-500/40 rounded-xl px-4 py-3">
            <AlertCircle size={15} aria-hidden="true" className="text-red-400 flex-shrink-0" />
            <p className="text-red-300 text-sm min-[1025px]:text-xs font-body">{errors._general}</p>
          </div>
        )}

        {paso === 'conflictos' ? (
          <ResolverConflictos
            nombreNueva={form.nombre.trim()}
            conflictos={conflictos}
            decisiones={decisiones}
            onDecidir={(idProducto, valor) => setDecisiones((d) => ({ ...d, [idProducto]: valor }))}
            onTodos={decidirTodos}
            resolucion={resolucion}
          />
        ) : (
          <>
          {/* Nombre */}
          <Input
            label="Nombre *"
            value={form.nombre}
            onChange={e => set('nombre', e.target.value)}
            error={errors.nombre}
            placeholder="Ej: Descuento verano 20%"
          />

          {/* Descripción */}
          <div>
            <label htmlFor={lblDesc} className={`${CLASE_ETIQUETA} mb-1`}>Descripción</label>
            <textarea
              id={lblDesc}
              value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
              rows={2}
              placeholder="Descripción opcional de la promo..."
              className="w-full bg-surface-700 border border-surface-600 rounded-xl px-3 py-2 text-white text-base
                         min-[1025px]:text-sm font-body placeholder-surface-500 focus:outline-none
                         focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-all resize-none"
            />
          </div>

          {/* Tipo de promoción (orden fijo — ver ALCANCE_OPCIONES) + Modalidad de descuento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={lblTipo} className={`${CLASE_ETIQUETA} mb-1`}>Tipo de promoción *</label>
              <select id={lblTipo} value={form.alcance} onChange={e => set('alcance', e.target.value)}
                className={`${CONTROL} border-surface-600 cursor-pointer`}>
                {ALCANCE_OPCIONES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={lblModalidad} className={`${CLASE_ETIQUETA} mb-1`}>Modalidad *</label>
              <select id={lblModalidad} value={form.tipo} onChange={e => set('tipo', e.target.value)}
                className={`${CONTROL} border-surface-600 cursor-pointer`}>
                {MODALIDAD_OPCIONES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Campos condicionales por tipo de promoción */}
          {form.alcance === 'producto' && (
            <fieldset className="min-w-0">
              <legend className={`${CLASE_ETIQUETA} mb-1`}>Productos *</legend>
              <ProductosSelector
                value={form.productosSel}
                onChange={(v) => set('productosSel', v)}
                productos={productos}
                cargando={catalogo.cargando}
                errorCarga={catalogo.error}
                onReintentar={cargarCatalogos}
                error={errors.productos}
              />
              {avisoConflictos.length > 0 && (
                <div role="status" className="mt-2 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 flex-shrink-0 text-amber-300" />
                  <p className="text-amber-100 text-sm min-[1025px]:text-xs font-body break-words">
                    {avisoConflictos.length === 1
                      ? `«${avisoConflictos[0].nombre ?? `Producto ${avisoConflictos[0].idProducto}`}» ya tiene una promoción activa en esas fechas.`
                      : `${avisoConflictos.length} de los productos seleccionados ya tienen una promoción activa en esas fechas.`}
                    {' '}Al guardar vas a poder elegir cuál queda vigente.
                  </p>
                </div>
              )}
            </fieldset>
          )}

          {form.alcance === 'categoria' && (
            <div>
              <label htmlFor={lblCategoria} className={`${CLASE_ETIQUETA} mb-1`}>Categoría *</label>
              <select id={lblCategoria} value={form.idCategoria} onChange={e => set('idCategoria', e.target.value)}
                aria-invalid={errors.idCategoria ? true : undefined}
                className={`${CONTROL} cursor-pointer ${errors.idCategoria ? 'border-red-500' : 'border-surface-600'}`}>
                <option value="">— Seleccioná una categoría —</option>
                {categorias.map(c => (
                  <option key={c.idCategoria} value={c.idCategoria}>{c.nombre}</option>
                ))}
              </select>
              {errors.idCategoria && <p role="alert" className="text-red-400 text-sm min-[1025px]:text-xs mt-1 font-body">{errors.idCategoria}</p>}
            </div>
          )}

          {/* Valor — solo para tipos que lo requieren */}
          {requiereValor && (
            <Input
              label={form.tipo === 'porcentaje_producto' ? 'Descuento (%) *' : 'Precio fijo (ARS) *'}
              value={form.valor}
              onChange={e => { const v = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(v)) set('valor', v) }}
              error={errors.valor}
              placeholder={form.tipo === 'porcentaje_producto' ? 'Ej: 15 (para 15%)' : 'Ej: 9500'}
              inputMode="decimal"
            />
          )}

          {/* Fechas de vigencia */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={lblDesde} className={`${CLASE_ETIQUETA} mb-1`}>Desde *</label>
              <input id={lblDesde} type="date" value={form.fechaInicio} onChange={e => set('fechaInicio', e.target.value)}
                aria-invalid={errors.fechaInicio ? true : undefined}
                className={`${CONTROL} font-mono ${errors.fechaInicio ? 'border-red-500' : 'border-surface-600'}`} />
              {errors.fechaInicio && <p role="alert" className="text-red-400 text-sm min-[1025px]:text-xs mt-1 font-body">{errors.fechaInicio}</p>}
            </div>
            <div>
              <label htmlFor={lblHasta} className={`${CLASE_ETIQUETA} mb-1`}>Hasta *</label>
              <input id={lblHasta} type="date" value={form.fechaFin} onChange={e => set('fechaFin', e.target.value)}
                min={form.fechaInicio || undefined}
                aria-invalid={errors.fechaFin ? true : undefined}
                className={`${CONTROL} font-mono ${errors.fechaFin ? 'border-red-500' : 'border-surface-600'}`} />
              {errors.fechaFin && <p role="alert" className="text-red-400 text-sm min-[1025px]:text-xs mt-1 font-body">{errors.fechaFin}</p>}
            </div>
          </div>

          {/* Preview de la promo */}
          {form.nombre && form.fechaInicio && form.fechaFin && (
            <div className="bg-surface-700/50 border border-surface-600 rounded-xl px-4 py-3 text-sm min-[1025px]:text-xs font-body space-y-1">
              <p className="text-surface-400 uppercase tracking-widest">Vista previa</p>
              <p className="text-white break-words">
                <span className="text-brand-400 font-semibold">{form.nombre}</span>
                {' · '}
                {TIPO_LABELS[form.tipo]}
                {requiereValor && form.valor ? (form.tipo === 'porcentaje_producto' ? ` −${form.valor}%` : ` $${form.valor}`) : ''}
                {' · '}
                {ALCANCE_LABELS[form.alcance]}
                {form.alcance === 'producto' && form.productosSel.length > 0 && ` (${textoCantidadProductos(form.productosSel.length)})`}
              </p>
              <p className="text-surface-400">
                Vigente del {fmtFecha(form.fechaInicio)} al {fmtFecha(form.fechaFin)}
              </p>
            </div>
          )}

          </>
        )}

        {/* Botones — pegados al pie del modal: con muchos productos seleccionados el
            formulario crece y en mobile los botones no deben perderse al hacer scroll. */}
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 pt-3 pb-4 sm:pb-6
                        flex gap-2 bg-surface-800 border-t border-surface-700/60">
          {paso === 'conflictos' ? (
            <>
              <Button key="volver" variant="secondary" className="flex-1 justify-center min-h-[44px] min-[1025px]:min-h-0"
                onClick={() => { setPaso('form'); setErrors({}) }} disabled={loading}>Volver</Button>
              <Button key="confirmar" className="flex-1 justify-center min-h-[44px] min-[1025px]:min-h-0" onClick={confirmarResolucion}
                disabled={loading || resolucion.pendientes > 0 || resolucion.idsFinales.length === 0}>
                {loading ? 'Guardando…' : 'Confirmar y guardar'}
              </Button>
            </>
          ) : (
            <>
              <Button key="cancelar" variant="secondary" className="flex-1 justify-center min-h-[44px] min-[1025px]:min-h-0"
                onClick={onClose} disabled={loading}>Cancelar</Button>
              <Button key="guardar" className="flex-1 justify-center min-h-[44px] min-[1025px]:min-h-0" onClick={guardar} disabled={loading}>
                {loading
                  ? (esNueva ? 'Creando…' : 'Guardando…')
                  : (esNueva ? 'Crear Promoción' : 'Guardar Cambios')}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function Promociones() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editando,  setEditando]  = useState(null)
  const [toast,     setToast]     = useState(null)   // { message, tone } | null
  const [filtro,    setFiltro]    = useState('todas') // 'todas' | 'activas' | 'inactivas'
  const { isCompact } = useBreakpoint()
  const { anchorRef, scrollToStart } = useScrollAnchor()

  // Eliminación
  const [aEliminar,     setAEliminar]     = useState(null)
  const [eliminando,    setEliminando]    = useState(false)
  const [errorEliminar, setErrorEliminar] = useState('')

  // ── Datos + filtro + orden + paginación ─────────────────────────────────
  // usePaginatedList (mode 'client'):
  //   · reload() NO resetea la página (crear/editar/eliminar conservan la posición);
  //   · cambiar `filtro` SÍ vuelve a la página 1;
  //   · si la página queda fuera de rango (se borró el último registro de la última
  //     página) se ajusta sola a la última válida → nunca una página vacía.
  const {
    pageItems, items, rawItems, page, setPage, totalCount,
    loading, error: errorCarga, reload,
  } = usePaginatedList({
    fetcher:       obtenerPromociones,
    clientFilters: { filtro },
    clientFilter:  pasaFiltro,
    sort:          compararPromos,
    pageSize:      PAGE_SIZE,
  })

  // ── Acciones ────────────────────────────────────────────────────────────
  async function toggleActivo(promo) {
    try {
      await togglePromocion(promo.idPromocion, !promo.activo)
      await reload()
      setToast({ message: promo.activo ? 'Promoción desactivada' : 'Promoción activada ✓', tone: 'ok' })
    } catch (err) {
      setToast({ message: mensajeDeError(err), tone: 'error' })
    }
  }

  function abrirNueva()        { setEditando(null);  setModalOpen(true) }
  function abrirEditar(promo)  { setEditando(promo); setModalOpen(true) }

  async function handleSaved(msg) {
    await reload()
    setToast({ message: msg, tone: 'ok' })
  }

  function pedirEliminar(promo) {
    setErrorEliminar('')
    setAEliminar(promo)
  }

  function cancelarEliminar() {
    if (eliminando) return
    setAEliminar(null)
    setErrorEliminar('')
  }

  async function confirmarEliminar() {
    if (!aEliminar) return
    setEliminando(true)
    setErrorEliminar('')
    try {
      await eliminarPromocion(aEliminar.idPromocion)
      setAEliminar(null)
      await reload() // conserva la página; el hook la ajusta si quedó fuera de rango
      setToast({ message: 'Promoción eliminada ✓', tone: 'ok' })
    } catch (err) {
      // La promoción NO se tocó: sigue en el listado y el diálogo queda abierto con el error.
      setErrorEliminar(mensajeDeError(err))
    } finally {
      setEliminando(false)
    }
  }

  // ── Resumen rápido (sobre TODAS las promociones, no sobre la página) ────
  const hoy = today()
  const totalActivas  = rawItems.filter(p => p.activo === true  && p.fechaInicio <= hoy && p.fechaFin >= hoy).length
  const totalProximas = rawItems.filter(p => p.activo === true  && p.fechaInicio  > hoy).length
  const totalVencidas = rawItems.filter(p => p.fechaFin < hoy).length

  const primeraCarga = loading && rawItems.length === 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}

      <PageHeader
        title="Promociones"
        subtitle="Gestioná descuentos y ofertas especiales"
        actions={(
          <Button icon={Plus} onClick={abrirNueva}
            className="w-full justify-center min-h-[44px] md:w-auto min-[1025px]:min-h-0">
            Nueva Promoción
          </Button>
        )}
      />

      {/* Resumen rápido */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          { label: 'Vigentes hoy', value: totalActivas,  color: 'text-emerald-400' },
          { label: 'Próximas',     value: totalProximas, color: 'text-brand-400'   },
          { label: 'Vencidas',     value: totalVencidas, color: 'text-surface-400' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-3 sm:p-4 text-center">
            <p className={`text-2xl font-display font-bold ${color}`}>{value}</p>
            <p className="text-surface-400 text-[11px] sm:text-xs font-body mt-1 uppercase tracking-wider sm:tracking-widest break-words">{label}</p>
          </Card>
        ))}
      </div>

      {/* Filtros
          Mobile/tablet (≤ 1024px): patrón único del sistema (botón «Filtros» + panel con borrador).
          Esta pantalla no tiene buscador: la fila muestra la cantidad de resultados.
          Desktop: chips en línea, aplicación inmediata (sin cambios). */}
      {isCompact ? (
        <FiltrosMovil
          izquierda={(
            <p role="status" aria-live="polite" className="text-surface-300 text-sm font-body">
              {items.length} promoción{items.length !== 1 ? 'es' : ''}
            </p>
          )}
          value={{ filtro }}
          defaults={{ filtro: 'todas' }}
          campos={[{ tipo: 'chips', clave: 'filtro', etiqueta: 'Estado', opciones: OPCIONES_FILTRO }]}
          onApply={(b) => setFiltro(b.filtro)}
        />
      ) : (
      <div className="flex gap-2" role="group" aria-label="Filtrar por estado">
        {OPCIONES_FILTRO.map(f => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFiltro(f.value)}
            aria-pressed={filtro === f.value}
            className={`px-4 py-1.5 rounded-xl text-sm font-body transition-all border
              ${filtro === f.value
                ? 'bg-brand-500/15 border-brand-500/50 text-white'
                : 'bg-surface-700 border-surface-600 text-surface-400 hover:border-surface-500'}`}>
            {f.label}
          </button>
        ))}
      </div>
      )}

      {/* Si una recarga falla con datos ya en pantalla, se avisa sin ocultar el listado. */}
      {errorCarga && rawItems.length > 0 && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 bg-red-900/30 border border-red-500/40 rounded-xl px-4 py-3">
          <p className="text-red-300 text-sm min-[1025px]:text-xs font-body">No se pudo actualizar el listado. Es posible que los datos no estén al día.</p>
          <Button size="sm" variant="secondary" className="min-h-[44px] min-[1025px]:min-h-0" onClick={reload}>Reintentar</Button>
        </div>
      )}

      {/* Listado. El ancla permite reposicionar la vista al inicio de la tabla al paginar. */}
      <div ref={anchorRef}>
        <Card className="overflow-hidden">
          {primeraCarga ? (
            <div className="flex flex-col items-center gap-3 py-16" aria-busy="true">
              <Spinner label="Cargando promociones" />
              <p className="text-surface-400 font-body text-sm">Cargando promociones…</p>
            </div>
          ) : errorCarga && rawItems.length === 0 ? (
            <div role="alert" className="text-center py-16 px-4 space-y-3">
              <AlertCircle size={36} aria-hidden="true" className="text-red-400 mx-auto" />
              <p className="text-surface-300 font-body text-sm">No se pudieron cargar las promociones.</p>
              <Button size="sm" variant="secondary" className="min-h-[44px] min-[1025px]:min-h-0" onClick={reload}>
                Reintentar
              </Button>
            </div>
          ) : totalCount === 0 ? (
            <div className="text-center py-16 px-4 space-y-3">
              <Tag size={40} aria-hidden="true" className="text-surface-600 mx-auto" />
              <p className="text-surface-400 font-body text-sm">
                {filtro === 'todas'
                  ? 'Todavía no hay promociones. Creá la primera.'
                  : `No hay promociones ${filtro}.`}
              </p>
              {filtro === 'todas' && (
                <Button size="sm" icon={Plus} onClick={abrirNueva}>Nueva Promoción</Button>
              )}
            </div>
          ) : (
            <>
              {/* <Table> del sistema: tabla en ≥ md, tarjetas apiladas en mobile (las acciones
                  quedan siempre a la vista, sin scroll horizontal). Exactamente 6 <Td> por fila:
                  <Table> inyecta cada etiqueta por posición. */}
              <Table headers={['Nombre', 'Descuento', 'Tipo de promoción', 'Vigencia', 'Estado', '']}>
                {pageItems.map(promo => {
                  const vig = vigenciaLabel(promo)
                  return (
                    <Tr key={promo.idPromocion}>

                      {/* Nombre + descripción */}
                      <Td>
                        <p className="text-white font-body font-medium break-words">{promo.nombre}</p>
                        {promo.descripcion && (
                          <p className="text-surface-500 text-xs font-body mt-0.5 break-words md:truncate md:max-w-[200px]">
                            {promo.descripcion}
                          </p>
                        )}
                      </Td>

                      {/* Modalidad + valor */}
                      <Td>
                        <span className="bg-surface-700 border border-surface-600 text-surface-300 text-xs font-body px-2 py-0.5 rounded-lg">
                          {TIPO_LABELS[promo.tipo] ?? promo.tipo}
                        </span>
                        {promo.valor != null && (
                          <p className="text-brand-400 text-xs font-mono mt-1">
                            {promo.tipo === 'porcentaje_producto' ? `−${promo.valor}%` : `$${promo.valor}`}
                          </p>
                        )}
                      </Td>

                      {/* Tipo de promoción (+ productos / categoría asociados) */}
                      <Td>
                        <div>
                          <p className="text-surface-300 text-xs font-body">{ALCANCE_LABELS[promo.alcance] ?? promo.alcance}</p>
                          {promo.alcance === 'producto' && <ProductosAsociados productos={promo.productos} />}
                          {promo.alcance === 'categoria' && promo.nombreCategoria && (
                            <p className="text-surface-500 text-xs font-body mt-0.5 break-words">{promo.nombreCategoria}</p>
                          )}
                        </div>
                      </Td>

                      {/* Vigencia */}
                      <Td>
                        <div>
                          <p className={`text-xs font-body font-semibold ${vig.color}`}>{vig.text}</p>
                          <p className="text-surface-500 text-xs font-mono mt-0.5">
                            {fmtFecha(promo.fechaInicio)} → {fmtFecha(promo.fechaFin)}
                          </p>
                        </div>
                      </Td>

                      {/* Estado activo/inactivo */}
                      <Td>
                        <span className={`text-xs font-body px-2 py-0.5 rounded-full border
                          ${promo.activo
                            ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
                            : 'text-surface-500 bg-surface-700 border-surface-600'}`}>
                          {promo.activo ? 'Activa' : 'Inactiva'}
                        </span>
                      </Td>

                      {/* Acciones */}
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" icon={Pencil} className={ICONO_TACTIL}
                            onClick={() => abrirEditar(promo)}
                            title="Editar" aria-label={`Editar promoción ${promo.nombre}`} />
                          <Button variant="ghost" size="sm" icon={promo.activo ? PowerOff : Power}
                            className={`${ICONO_TACTIL} ${promo.activo ? 'hover:text-red-400' : 'hover:text-emerald-400'}`}
                            onClick={() => toggleActivo(promo)}
                            title={promo.activo ? 'Desactivar' : 'Activar'}
                            aria-label={`${promo.activo ? 'Desactivar' : 'Activar'} promoción ${promo.nombre}`} />
                          <Button variant="ghost" size="sm" icon={Trash2} className={`${ICONO_TACTIL} hover:text-red-400`}
                            onClick={() => pedirEliminar(promo)}
                            title="Eliminar" aria-label={`Eliminar promoción ${promo.nombre}`} />
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </Table>

              {/* Mismo componente y mismo PAGE_SIZE que el resto de las tablas. Se oculta solo
                  cuando hay una única página (criterio del resto del sistema). */}
              <Pagination page={page} total={totalCount} pageSize={PAGE_SIZE} onChange={setPage} onNavigate={scrollToStart} />
            </>
          )}
        </Card>
      </div>

      {/* Modal crear/editar */}
      <PromoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        promoEditar={editando}
        promociones={rawItems}
      />

      {/* Confirmación de eliminación */}
      <ConfirmModal
        open={!!aEliminar}
        onClose={cancelarEliminar}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        error={errorEliminar}
        details={aEliminar ? [
          ['Nombre', aEliminar.nombre],
          ['Tipo de promoción', ALCANCE_LABELS[aEliminar.alcance] ?? aEliminar.alcance],
          ['Vigencia', `${fmtFecha(aEliminar.fechaInicio)} → ${fmtFecha(aEliminar.fechaFin)}`],
        ] : []}
        message="¿Eliminar esta promoción?"
        warning="Dejará de aplicarse en los nuevos presupuestos. Los presupuestos ya generados conservan sus montos y ahorros sin cambios."
      />
    </div>
  )
}
