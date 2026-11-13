// src/components/presupuestos/BuscadorProductos.jsx
// Carga rápida de ítems del Presupuestador: DOS buscadores independientes.
//   · "Buscar por nombre": solo el nombre (sin tildes/mayúsculas, varias palabras en cualquier orden).
//   · "Buscar por ID":     solo dígitos, ID exacto.
// Tocar (o Enter sobre) un resultado agrega el producto con cantidad 1, limpia el campo y devuelve el
// foco al mismo buscador. El componente NO toca los ítems: delega en `onAgregar` (SRP), por lo que
// los cálculos de promociones, ajustes y totales siguen siendo los del Presupuestador.
//
// Responsive (breakpoints del proyecto: mobile < 768, tablet 768–1024, desktop ≥ 1025):
//   mobile  → campos apilados, resultados a ancho completo, objetivos táctiles ≥ 44 px.
//   tablet+ → campos lado a lado (nombre 2fr / ID 1fr). El panel de resultados es SIEMPRE en línea
//             (no un portal): scrollea dentro de su contenedor y no queda tapado por el teclado.

import { useEffect, useId, useMemo, useRef, useState, useDeferredValue, useCallback } from 'react'
import { Search, Hash, AlertCircle, RefreshCw, Tag, CheckCircle2, WifiOff } from 'lucide-react'
import { calcularPromocionParaItem } from '../../services/promocionesService'
import { buscarPorNombre, sanitizarDigitosId, LIMITE_RESULTADOS } from '../../lib/busquedaProductos'
import { useCatalogoProductos } from '../../hooks/useCatalogoProductos'
import { useProductoPorId } from '../../hooks/useProductoPorId'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

const formatoARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const ars = (n) => formatoARS.format(n ?? 0)

const CAMPO = `w-full bg-surface-700 border border-surface-600 rounded-xl pl-10 pr-3 py-2 min-h-[44px]
               text-white text-base font-body placeholder:text-surface-500
               focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40
               transition-all min-[1025px]:text-sm`

const ETIQUETA = 'block mb-1 text-surface-300 text-sm min-[1025px]:text-xs font-body'

const MS_MENSAJE_AGREGADO = 3000

/** Fila de resultado: ID, nombre, precio (con la promoción vigente identificada) y stock. */
function Resultado({ producto, promociones, idDom, activo, onElegir }) {
  const { promoAplicada, precioFinal } = useMemo(() => calcularPromocionParaItem(
    {
      idProducto:     producto.idProducto,
      idCategoria:    producto.idCategoria ?? null,
      precioUnitario: producto.precioUnitario,
      cantidad:       1,
    },
    promociones,
  ), [producto, promociones])

  const sinStock = producto.cantidad <= 0

  return (
    <li
      id={idDom}
      role="option"
      aria-selected={activo}
      // preventDefault evita que el campo pierda el foco al tocar (en mobile mantiene el teclado).
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onElegir(producto)}
      className={`cursor-pointer px-3 py-2.5 min-h-[44px] border-b border-surface-700/60 last:border-0
                  hover:bg-surface-700 ${activo ? 'bg-surface-700 ring-1 ring-inset ring-brand-500/60' : ''}`}
    >
      <p className="text-white text-sm font-body leading-snug break-words">{producto.nombre}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono">
        <span className="text-surface-400">ID {producto.idProducto}</span>

        {promoAplicada ? (
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span className="text-surface-500 line-through">{ars(producto.precioUnitario)}</span>
            <span className="text-emerald-400 font-semibold">{ars(precioFinal)}</span>
            <span className="flex items-center gap-1 text-emerald-500 font-body">
              <Tag size={10} aria-hidden="true" />
              <span className="sr-only">Promoción:</span>{promoAplicada.nombre}
            </span>
          </span>
        ) : producto.precioUnitario > 0 ? (
          <span className="text-surface-200">{ars(producto.precioUnitario)}</span>
        ) : (
          <span className="text-yellow-400 font-body">Sin precio</span>
        )}

        <span className={sinStock ? 'text-red-400 font-body' : 'text-surface-300 font-body'}>
          {sinStock ? 'Sin stock' : `Stock: ${producto.cantidad}`}
        </span>
        {producto.tieneMedidas ? <span className="text-surface-400 font-body">Con medidas</span> : null}
      </div>
    </li>
  )
}

function Mensaje({ icono: Icono, children, accion, tono = 'neutro' }) {
  const color = tono === 'error' ? 'text-red-400' : 'text-surface-300'
  return (
    <div role={tono === 'error' ? 'alert' : 'status'}
         className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 text-sm font-body ${color}`}>
      {Icono ? <Icono size={16} className="flex-shrink-0" aria-hidden="true" /> : null}
      <span className="min-w-0 break-words">{children}</span>
      {accion}
    </div>
  )
}

/**
 * @param {object} props
 * @param {Array}  props.promociones  Promociones vigentes (las mismas que usa el Presupuestador).
 * @param {(producto: object) => void} props.onAgregar  Recibe el producto elegido (cantidad 1 la fija el padre).
 */
export default function BuscadorProductos({ promociones, onAgregar }) {
  const uid = useId()
  const online = useOnlineStatus()

  const [campo, setCampo] = useState('nombre')       // buscador que manda sobre el panel
  const [textoNombre, setTextoNombre] = useState('')
  const [textoId, setTextoId] = useState('')
  const [indiceActivo, setIndiceActivo] = useState(-1)
  const [agregado, setAgregado] = useState('')

  const refNombre = useRef(null)
  const refId = useRef(null)
  const temporizador = useRef(0)

  const catalogo = useCatalogoProductos()
  const porId = useProductoPorId(textoId)

  // Filtrar el catálogo es síncrono y barato; el valor diferido evita que tipear se sienta trabado.
  const consultaNombre = useDeferredValue(textoNombre)
  const resultadoNombre = useMemo(
    () => buscarPorNombre(catalogo.productos, consultaNombre),
    [catalogo.productos, consultaNombre],
  )

  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  // ── Qué se muestra en el panel, según el buscador activo ─────────────────────────────
  const hayConsulta = campo === 'nombre' ? textoNombre.trim() !== '' : textoId !== ''
  const items = campo === 'nombre' ? resultadoNombre.items : (porId.producto ? [porId.producto] : [])
  const total = campo === 'nombre' ? resultadoNombre.total : items.length

  let vista = 'nada'
  if (hayConsulta) {
    if (campo === 'nombre') {
      if (catalogo.estado === 'cargando' && !catalogo.productos.length) vista = 'cargando'
      else if (catalogo.estado === 'error' && !catalogo.productos.length) vista = 'error'
      else vista = items.length ? 'lista' : 'vacio'
    } else {
      vista = { buscando: 'cargando', error: 'error', no_encontrado: 'vacio', encontrado: 'lista' }[porId.estado] ?? 'nada'
    }
  }

  const idLista = `${uid}-lista`
  const idOpcion = (i) => `${uid}-op-${i}`

  const agregar = useCallback((producto) => {
    onAgregar(producto)
    const origen = campo
    setTextoNombre('')
    setTextoId('')
    setIndiceActivo(-1)
    setAgregado(producto.nombre)
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setAgregado(''), MS_MENSAJE_AGREGADO)
    // Escenario 5: el foco vuelve al buscador usado, listo para la siguiente carga.
    ;(origen === 'nombre' ? refNombre : refId).current?.focus()
  }, [campo, onAgregar])

  function alCambiarNombre(valor) {
    setCampo('nombre'); setTextoNombre(valor); setTextoId(''); setIndiceActivo(-1); setAgregado('')
  }

  function alCambiarId(valor) {
    // Solo dígitos, también ante pegados ("12 a3" → "123").
    setCampo('id'); setTextoId(sanitizarDigitosId(valor)); setTextoNombre(''); setIndiceActivo(-1); setAgregado('')
  }

  function alTeclear(e) {
    if (vista !== 'lista') {
      if (e.key === 'Escape') { setTextoNombre(''); setTextoId('') }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setIndiceActivo((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setIndiceActivo((i) => (i <= 0 ? items.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Sin selección explícita, Enter solo agrega si hay UN único resultado (típico del ID).
      const elegido = indiceActivo >= 0 ? items[indiceActivo] : (items.length === 1 ? items[0] : null)
      if (elegido) agregar(elegido)
    } else if (e.key === 'Escape') {
      e.preventDefault(); setTextoNombre(''); setTextoId(''); setIndiceActivo(-1)
    }
  }

  const propsCombobox = (esteCampo) => ({
    role: 'combobox',
    'aria-expanded': campo === esteCampo && vista === 'lista',
    'aria-controls': idLista,
    'aria-autocomplete': 'list',
    'aria-activedescendant': campo === esteCampo && vista === 'lista' && indiceActivo >= 0 ? idOpcion(indiceActivo) : undefined,
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    onKeyDown: alTeclear,
  })

  const reintentar = campo === 'nombre' ? catalogo.reintentar : porId.reintentar
  const botonReintentar = (
    <button type="button" onClick={reintentar}
      className="inline-flex items-center gap-1.5 min-h-[44px] min-[1025px]:min-h-0 px-3 py-1.5 rounded-lg border border-surface-600
                 text-surface-100 hover:border-brand-500 hover:text-white transition-colors
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60">
      <RefreshCw size={14} aria-hidden="true" /> Reintentar
    </button>
  )

  return (
    <section aria-labelledby={`${uid}-titulo`} className="px-4 sm:px-6 py-4 border-b border-surface-700">
      <h3 id={`${uid}-titulo`} className="sr-only">Buscar productos para agregar al presupuesto</h3>

      <div className="grid grid-cols-1 gap-3 min-[768px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <label htmlFor={`${uid}-nombre`} className={ETIQUETA}>Buscar por nombre</label>
          <div className="relative">
            <Search size={16} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
            <input
              id={`${uid}-nombre`} ref={refNombre} type="search" enterKeyHint="search"
              value={textoNombre} placeholder="Nombre de producto..."
              onChange={(e) => alCambiarNombre(e.target.value)}
              onFocus={() => { setCampo('nombre'); catalogo.refrescarSiVencido() }}
              className={CAMPO}
              {...propsCombobox('nombre')}
            />
          </div>
        </div>

        <div className="min-w-0">
          <label htmlFor={`${uid}-id`} className={ETIQUETA}>Buscar por ID</label>
          <div className="relative">
            <Hash size={16} aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
            <input
              id={`${uid}-id`} ref={refId} type="text" inputMode="numeric" pattern="[0-9]*" enterKeyHint="go"
              value={textoId} placeholder="Ej.: 1234"
              onChange={(e) => alCambiarId(e.target.value)}
              onFocus={() => setCampo('id')}
              className={`${CAMPO} font-mono`}
              {...propsCombobox('id')}
            />
          </div>
        </div>
      </div>

      {/* Panel de resultados en línea: reserva su lugar solo cuando hay algo que decir. */}
      {vista !== 'nada' && (
        <div className="mt-3 rounded-xl border border-surface-600 bg-surface-800 overflow-hidden">
          {vista === 'cargando' && (
            <Mensaje>
              <span className="inline-block w-3 h-3 mr-2 align-middle border-2 border-brand-500/30 border-t-brand-400 rounded-full animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {campo === 'nombre' ? 'Cargando productos…' : 'Buscando…'}
            </Mensaje>
          )}

          {vista === 'error' && (
            <Mensaje icono={online ? AlertCircle : WifiOff} tono="error" accion={botonReintentar}>
              {online
                ? 'No pudimos buscar los productos. Los ítems ya cargados se conservan.'
                : 'Sin conexión. Los ítems ya cargados se conservan.'}
            </Mensaje>
          )}

          {vista === 'vacio' && (
            <Mensaje>{campo === 'nombre' ? 'Sin resultados' : 'Producto no encontrado'}</Mensaje>
          )}

          {vista === 'lista' && (
            <>
              <ul id={idLista} role="listbox" aria-label="Resultados de la búsqueda"
                  className="max-h-[min(50dvh,22rem)] overflow-y-auto overscroll-contain">
                {items.map((p, i) => (
                  <Resultado key={p.idProducto} producto={p} promociones={promociones}
                             idDom={idOpcion(i)} activo={i === indiceActivo} onElegir={agregar} />
                ))}
              </ul>
              {total > LIMITE_RESULTADOS && (
                <p className="px-3 py-2 border-t border-surface-700 text-surface-400 text-xs font-body">
                  Mostrando {LIMITE_RESULTADOS} de {total}. Sumá palabras para acotar la búsqueda.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Anuncios para lector de pantalla + confirmación visible del último agregado. */}
      <p role="status" aria-live="polite" className="sr-only">
        {vista === 'lista' ? `${total} ${total === 1 ? 'resultado' : 'resultados'}` : vista === 'vacio' ? (campo === 'nombre' ? 'Sin resultados' : 'Producto no encontrado') : ''}
      </p>
      <div className="min-h-[1.25rem] mt-2" aria-live="polite">
        {agregado && (
          <p className="flex items-center gap-1.5 text-emerald-400 text-sm min-[1025px]:text-xs font-body min-w-0">
            <CheckCircle2 size={14} className="flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">Agregado: {agregado}</span>
          </p>
        )}
      </div>
    </section>
  )
}
