// src/components/encargos/SelectorProducto.jsx
// Buscador de productos ACTIVOS por nombre (sin tildes, varias palabras en cualquier orden)
// o por ID exacto. Reutiliza el catálogo en memoria y el motor de búsqueda del Presupuestador
// (useCatalogoProductos + lib/busquedaProductos): una sola carga, filtrado instantáneo.
// Elegir un producto llama a `onElegir` y deja el campo listo para cargar el siguiente.

import { useCallback, useId, useMemo, useRef, useState, useDeferredValue } from 'react'
import { AlertCircle, Loader2, Plus, Search } from 'lucide-react'
import { useCatalogoProductos } from '../../hooks/useCatalogoProductos'
import { buscarPorNombre, LIMITE_RESULTADOS, sanitizarDigitosId, normalizarTexto } from '../../lib/busquedaProductos'
import ListaOpciones, { idOpcion, useNavegacionLista } from './ListaOpciones'

/** Pura (testeable): ID exacto primero (si el texto son sólo dígitos) y luego coincidencias por nombre. */
export function buscarProductosParaEncargo(catalogo, texto) {
  const limpio = String(texto ?? '').trim()
  if (!normalizarTexto(limpio)) return { items: [], total: 0 }
  const porNombre = buscarPorNombre(catalogo, limpio, { limite: LIMITE_RESULTADOS })
  if (!/^\d+$/.test(limpio)) return porNombre
  const id = Number(sanitizarDigitosId(limpio))
  const exacto = catalogo.find((p) => p.idProducto === id)
  if (!exacto) return porNombre
  const resto = porNombre.items.filter((p) => p.idProducto !== exacto.idProducto)
  return { items: [exacto, ...resto].slice(0, LIMITE_RESULTADOS), total: porNombre.total + (porNombre.items.some((p) => p.idProducto === id) ? 0 : 1) }
}

/**
 * @param {object} props
 * @param {(producto: {idProducto:number,nombre:string,tieneMedidas:number})=>void} props.onElegir
 * @param {string} [props.error]
 * @param {boolean} [props.disabled]
 */
export default function SelectorProducto({ onElegir, error, disabled = false }) {
  const uid = useId()
  const { estado, productos, reintentar, refrescarSiVencido } = useCatalogoProductos()
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [anuncio, setAnuncio] = useState('')
  const inputRef = useRef(null)
  const textoDiferido = useDeferredValue(texto)

  const { items, total } = useMemo(() => buscarProductosParaEncargo(productos, textoDiferido), [productos, textoDiferido])

  const elegir = useCallback((p) => {
    onElegir(p)
    setAnuncio(`«${p.nombre}» agregado al encargo.`)
    setTexto('')
    setAbierto(false)
    inputRef.current?.focus() // listo para el siguiente
  }, [onElegir])

  const { indiceActivo, onKeyDown } = useNavegacionLista({
    cantidad: items.length, abierto: abierto && items.length > 0,
    onElegirIndice: (i) => elegir(items[i]), onCerrar: () => setAbierto(false),
  })

  const idCampo = `${uid}-campo`, idLista = `${uid}-lista`, idError = `${uid}-error`
  const hayTexto = texto.trim() !== ''
  const mostrarPanel = abierto && hayTexto

  return (
    <div>
      <label htmlFor={idCampo} className="block text-surface-300 text-sm min-[1025px]:text-xs tracking-widest uppercase font-body mb-1">
        Agregar producto
      </label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" aria-hidden="true" />
        <input
          id={idCampo} ref={inputRef} type="text" autoComplete="off" maxLength={80}
          disabled={disabled || estado === 'error'}
          role="combobox" aria-expanded={mostrarPanel} aria-controls={idLista} aria-autocomplete="list"
          aria-activedescendant={indiceActivo >= 0 ? idOpcion(idLista, indiceActivo) : undefined}
          aria-invalid={error ? true : undefined} aria-describedby={error ? idError : undefined}
          data-encargo-invalido={error ? 'true' : undefined}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
          onFocus={() => { setAbierto(true); refrescarSiVencido() }}
          onKeyDown={onKeyDown}
          placeholder={estado === 'cargando' ? 'Cargando productos…' : 'Nombre o ID del producto'}
          className={`w-full bg-surface-700 border rounded-xl pl-10 pr-3 min-h-[44px] text-white text-base min-[1025px]:text-sm font-body
                      placeholder:text-surface-500 focus:outline-none focus-visible:ring-2 transition-all disabled:opacity-40
                      ${error ? 'border-red-500 focus-visible:ring-red-500/40' : 'border-surface-600 focus:border-brand-500 focus-visible:ring-brand-500/40'}`}
        />
        {estado === 'cargando' && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
      </div>
      {error && <p id={idError} role="alert" className="mt-1 text-red-400 text-sm min-[1025px]:text-xs font-body">{error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{anuncio}</p>

      {estado === 'error' && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-3 text-sm font-body text-red-300">
          <AlertCircle size={14} aria-hidden="true" />No pudimos cargar el catálogo de productos.
          <button type="button" onClick={reintentar} className="min-h-[44px] px-3 rounded-lg border border-surface-600 text-white hover:bg-surface-700">Reintentar</button>
        </div>
      )}

      {mostrarPanel && estado === 'listo' && items.length > 0 && (
        <>
          <ListaOpciones
            idBase={idLista} etiqueta="Productos encontrados" opciones={items}
            claveDe={(p) => p.idProducto} indiceActivo={indiceActivo} onElegir={elegir}
            renderOpcion={(p) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-body leading-snug break-words">{p.nombre}</p>
                  <p className="text-surface-400 text-xs font-mono mt-0.5">#{p.idProducto}{p.tieneMedidas ? ' · Con medidas' : ''}</p>
                </div>
                <Plus size={16} className="mt-0.5 flex-shrink-0 text-brand-400" aria-hidden="true" />
              </div>
            )}
          />
          {total > items.length && (
            <p className="mt-1 text-surface-400 text-sm min-[1025px]:text-xs font-body">Hay {total - items.length} coincidencias más: seguí escribiendo para acotar.</p>
          )}
        </>
      )}
      {mostrarPanel && estado === 'listo' && items.length === 0 && (
        <p className="mt-2 text-surface-300 text-sm font-body">Sin resultados para “{texto.trim()}”.</p>
      )}
    </div>
  )
}
