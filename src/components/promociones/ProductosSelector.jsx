// src/components/promociones/ProductosSelector.jsx
// Selector MÚLTIPLE de productos para promociones de tipo «Producto específico».
//
// PATRÓN: ARIA 1.2 combobox + listbox multiseleccionable.
//   · El input filtra por nombre/ID; la lista queda ABIERTA al marcar (multi-selección
//     fluida, a diferencia del buscador de un solo producto que se cerraba al elegir).
//   · La lista es "en flujo" (no flota): dentro de un modal con scroll un dropdown
//     absoluto se recorta o queda tapado por el teclado virtual en mobile.
//   · Lo seleccionado se guarda como objetos {idProducto, nombre} y NO como ids sueltos:
//     así un producto dado de baja (que ya no viene en el catálogo) sigue mostrando su
//     nombre al editar una promoción existente.
//
// TECLADO: ↓/↑ mueven la opción activa · Enter marca/desmarca · Escape cierra la lista
// (y NO cierra el modal mientras la lista esté abierta) · Backspace con input vacío no
// borra chips (evita pérdidas accidentales).
//
// RESPONSIVE: áreas táctiles ≥ 44 px hasta 1024 px (misma convención que `controles.js`),
// tipografía de 16 px en táctil (iOS no hace zoom al enfocar), chips que envuelven línea
// y nunca desbordan (break-words + min-w-0), lista y chips con scroll interno acotado.

import { useId, useMemo, useRef, useState } from 'react'
import { Check, Search, X, AlertCircle } from 'lucide-react'
import { ALTO_CONTROL } from '../ui/controles'
import { normalizarIds, textoCantidadProductos } from '../../lib/promocionesConfig'

/** Máximo de opciones renderizadas: evita montar miles de nodos con catálogos grandes. */
const MAX_RESULTADOS = 50

/** Área táctil de 44 px mientras el layout es táctil (≤ 1024 px). */
const TOQUE = 'min-h-[44px] min-[1025px]:min-h-[32px]'

const norm = (s) =>
  (s ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/**
 * @param {object} props
 * @param {Array<{idProducto:number, nombre:string|null}>} props.value      Selección actual.
 * @param {(next: Array<{idProducto:number, nombre:string|null}>) => void} props.onChange
 * @param {Array<{idProducto:number, nombre:string}>} props.productos      Catálogo completo.
 * @param {boolean} [props.cargando]       El catálogo todavía se está cargando.
 * @param {string}  [props.errorCarga]     Falló la carga del catálogo.
 * @param {() => void} [props.onReintentar]
 * @param {string}  [props.error]          Error de validación (p. ej. selección vacía).
 */
export default function ProductosSelector({
  value, onChange, productos, cargando = false, errorCarga = '', onReintentar, error = '',
}) {
  const uid        = useId()
  const listId     = `${uid}-lista`
  const errorId    = `${uid}-error`
  const contadorId = `${uid}-contador`
  const wrapRef    = useRef(null)
  const inputRef   = useRef(null)

  const [query,  setQuery]  = useState('')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)

  const idsSel = useMemo(() => new Set(normalizarIds(value.map((p) => p.idProducto))), [value])

  const { resultados, hayMas } = useMemo(() => {
    const q = norm(query)
    const filtrados = q
      ? productos.filter((p) => norm(p.nombre).includes(q) || String(p.idProducto).includes(q))
      : productos
    return { resultados: filtrados.slice(0, MAX_RESULTADOS), hayMas: filtrados.length > MAX_RESULTADOS }
  }, [productos, query])

  // Mantiene la opción activa dentro de rango si el filtro la dejó afuera.
  const activoSeguro = Math.min(activo, Math.max(0, resultados.length - 1))

  function alternar(p) {
    if (idsSel.has(p.idProducto)) {
      onChange(value.filter((s) => s.idProducto !== p.idProducto))
    } else {
      onChange([...value, { idProducto: p.idProducto, nombre: p.nombre }])
    }
  }

  function quitar(idProducto) {
    onChange(value.filter((s) => s.idProducto !== idProducto))
    inputRef.current?.focus()
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!abierto) { setAbierto(true); return }
      setActivo(Math.min(activoSeguro + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo(Math.max(activoSeguro - 1, 0))
    } else if (e.key === 'Enter') {
      // Enter nunca debe enviar/cerrar el formulario desde este campo.
      e.preventDefault()
      if (abierto && resultados[activoSeguro]) alternar(resultados[activoSeguro])
    } else if (e.key === 'Escape' && abierto) {
      // Cierra solo la lista; el modal contenedor sigue abierto.
      e.stopPropagation()
      setAbierto(false)
    }
  }

  function onBlurWrapper(e) {
    if (!wrapRef.current?.contains(e.relatedTarget)) setAbierto(false)
  }

  const descIds = [error ? errorId : null, contadorId].filter(Boolean).join(' ')

  return (
    <div ref={wrapRef} onBlur={onBlurWrapper} className="space-y-2">
      {/* ── Buscador ── */}
      <div className="relative">
        <Search size={14} aria-hidden="true"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={abierto && resultados[activoSeguro] ? `${uid}-op-${resultados[activoSeguro].idProducto}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={descIds}
          aria-label="Buscar productos para agregar a la promoción"
          autoComplete="off"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActivo(0); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscá por nombre o ID…"
          className={`w-full ${ALTO_CONTROL} bg-surface-700 border rounded-xl pl-8 pr-3 text-white text-base
                      min-[1025px]:text-sm font-body placeholder-surface-500 focus:outline-none
                      focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-all
                      ${error ? 'border-red-500' : 'border-surface-600'}`}
        />
      </div>

      {/* ── Lista de resultados (en flujo) ── */}
      {abierto && (
        <div className="bg-surface-800 border border-surface-600 rounded-xl overflow-hidden">
          {errorCarga ? (
            <div role="alert" className="flex flex-col gap-2 px-4 py-3">
              <p className="text-red-300 text-sm min-[1025px]:text-xs font-body">{errorCarga}</p>
              {onReintentar && (
                <button type="button" onClick={onReintentar} onMouseDown={(e) => e.preventDefault()}
                  className={`self-start ${TOQUE} px-3 rounded-lg border border-surface-600 text-surface-100
                              text-sm font-body hover:bg-surface-700 focus-visible:outline-none
                              focus-visible:ring-2 focus-visible:ring-brand-500/60`}>
                  Reintentar
                </button>
              )}
            </div>
          ) : cargando ? (
            <p role="status" className="px-4 py-3 text-surface-300 text-sm min-[1025px]:text-xs font-body">
              Cargando productos…
            </p>
          ) : (
            <>
              <ul
                id={listId}
                role="listbox"
                aria-multiselectable="true"
                aria-label="Productos disponibles"
                className="max-h-56 overflow-y-auto overscroll-contain"
              >
                {resultados.length === 0 ? (
                  <li role="presentation" className="px-4 py-3 text-surface-300 text-sm min-[1025px]:text-xs font-body">
                    {query.trim() ? `Sin resultados para «${query.trim()}»` : 'No hay productos disponibles'}
                  </li>
                ) : resultados.map((p, i) => {
                  const marcado = idsSel.has(p.idProducto)
                  return (
                    <li
                      key={p.idProducto}
                      id={`${uid}-op-${p.idProducto}`}
                      role="option"
                      aria-selected={marcado}
                      // mousedown + preventDefault: el input conserva el foco y la lista no se cierra.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => alternar(p)}
                      onMouseEnter={() => setActivo(i)}
                      className={`flex items-center gap-3 px-4 py-2 min-h-[44px] cursor-pointer
                                  border-b border-surface-700/60 last:border-0 transition-colors
                                  ${i === activoSeguro ? 'bg-surface-700' : 'hover:bg-surface-700/60'}`}
                    >
                      <span aria-hidden="true"
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border
                                    ${marcado ? 'bg-brand-500 border-brand-500 text-white' : 'border-surface-500'}`}>
                        {marcado && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-white text-sm font-body leading-tight break-words">{p.nombre}</span>
                        <span className="block text-surface-400 text-xs font-mono mt-0.5">#{p.idProducto}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>

              <div className="flex items-center justify-between gap-3 px-4 py-1.5 border-t border-surface-700 bg-surface-800">
                <p className="text-surface-400 text-xs font-body">
                  {hayMas ? `Mostrando ${MAX_RESULTADOS}. Refiná la búsqueda para ver más.` : `${resultados.length} resultado${resultados.length === 1 ? '' : 's'}`}
                </p>
                {/* Cierre explícito para táctil (no hay tecla Escape). */}
                <button type="button" onClick={() => setAbierto(false)} onMouseDown={(e) => e.preventDefault()}
                  className={`${TOQUE} px-3 rounded-lg text-brand-400 hover:text-brand-300 text-sm font-body
                              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60`}>
                  Listo
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Seleccionados ── */}
      <div className="flex items-center justify-between gap-3">
        <p id={contadorId} role="status" aria-live="polite" className="text-surface-300 text-sm min-[1025px]:text-xs font-body">
          {value.length === 0 ? 'Ningún producto seleccionado' : `${textoCantidadProductos(value.length)} seleccionado${value.length === 1 ? '' : 's'}`}
        </p>
        {value.length > 1 && (
          <button type="button" onClick={() => { onChange([]); inputRef.current?.focus() }}
            className={`${TOQUE} px-2 rounded-lg text-surface-400 hover:text-red-400 text-sm min-[1025px]:text-xs font-body
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60`}>
            Quitar todos
          </button>
        )}
      </div>

      {value.length > 0 && (
        <ul aria-label="Productos seleccionados" className="flex flex-wrap gap-2 max-h-40 overflow-y-auto overscroll-contain">
          {value.map((p) => (
            <li key={p.idProducto}
              className="flex max-w-full items-center gap-1 rounded-xl border border-brand-500/40 bg-brand-500/10 pl-3 text-white">
              <span className="min-w-0 py-1 text-sm min-[1025px]:text-xs font-body break-words">
                <span className="text-surface-400 font-mono">#{p.idProducto}</span>{' '}
                {p.nombre ?? 'Producto sin nombre'}
              </span>
              <button type="button" onClick={() => quitar(p.idProducto)}
                aria-label={`Quitar ${p.nombre ?? `producto ${p.idProducto}`}`}
                className={`flex ${TOQUE} min-w-[44px] min-[1025px]:min-w-[32px] flex-shrink-0 items-center justify-center rounded-xl
                            text-surface-300 hover:text-red-400 focus-visible:outline-none
                            focus-visible:ring-2 focus-visible:ring-brand-500/60`}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-red-400 text-sm min-[1025px]:text-xs font-body">
          <AlertCircle size={13} aria-hidden="true" className="flex-shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
