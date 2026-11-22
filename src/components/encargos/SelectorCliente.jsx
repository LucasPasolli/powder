// src/components/encargos/SelectorCliente.jsx
// Búsqueda y selección de UN cliente activo (por nombre, apellido, apodo, comercio o ID).
//
// Estados límite: sin buscar · buscando · sin resultados · error (con reintento) · sin conexión.
// Accesibilidad: combobox ARIA, etiqueta visible, error asociado (aria-describedby), foco visible,
// objetivos táctiles ≥ 44 px y texto de 16 px en táctil (evita el zoom automático de iOS).
// Seguridad: el texto se depura de caracteres con significado en filtros PostgREST (, ( ) % * " ' \)
// antes de llegar al servicio.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, Loader2, Search, User, WifiOff } from 'lucide-react'
import { buscarClientes } from '../../services/clientesService'
import { useDebounce } from '../../hooks/useDebounce'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { logger } from '../../lib/logger'
import { nombreCompletoCliente } from '../../lib/encargos'
import ListaOpciones, { idOpcion, useNavegacionLista } from './ListaOpciones'

const MAX_RESULTADOS = 30
const CAMPO = `w-full bg-surface-700 border rounded-xl pl-10 pr-3 min-h-[44px] text-white text-base min-[1025px]:text-sm
  font-body placeholder:text-surface-500 focus:outline-none focus-visible:ring-2 transition-all
  disabled:opacity-40 disabled:cursor-not-allowed`

/** Quita caracteres con significado en la sintaxis de filtros de PostgREST. */
export const depurarBusquedaCliente = (t) => String(t ?? '').replace(/[,()%*"'\\]/g, ' ').replace(/\s+/g, ' ').trim()

/** ¿La consulta amerita buscar? ID numérico desde 1 dígito; texto desde 2 caracteres. */
export const consultaBuscable = (t) => /^\d+$/.test(t) || t.length >= 2

/**
 * @param {object} props
 * @param {{idCliente:number,nombre:string,apellido:string,apodo?:string|null,nombreComercio?:string|null}|null} props.value
 * @param {(cliente: object|null)=>void} props.onChange
 * @param {string} [props.error]
 * @param {boolean} [props.disabled]
 */
export default function SelectorCliente({ value, onChange, error, disabled = false }) {
  const uid = useId()
  const online = useOnlineStatus()
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState(/** @type {'inactivo'|'buscando'|'listo'|'error'} */ ('inactivo'))
  const [resultados, setResultados] = useState([])
  const [abierto, setAbierto] = useState(false)
  const [reintento, setReintento] = useState(0)
  const reqRef = useRef(0)
  const inputRef = useRef(null)

  const consulta = depurarBusquedaCliente(useDebounce(texto, 300))

  useEffect(() => {
    if (!consultaBuscable(consulta)) { setEstado('inactivo'); setResultados([]); return }
    const req = ++reqRef.current
    setEstado('buscando')
    buscarClientes(consulta)
      .then(({ porId, porNombre }) => {
        if (req !== reqRef.current) return // respuesta de una búsqueda vieja
        const vistos = new Set()
        const unicos = [...porId, ...porNombre].filter((c) => !vistos.has(c.idCliente) && vistos.add(c.idCliente))
        setResultados(unicos.slice(0, MAX_RESULTADOS))
        setEstado('listo')
      })
      .catch((err) => {
        if (req !== reqRef.current) return
        logger.error('encargos.buscar_cliente_error', { error: err })
        setEstado('error')
      })
  }, [consulta, reintento])

  const elegir = useCallback((cliente) => {
    onChange(cliente)
    setTexto(''); setResultados([]); setAbierto(false); setEstado('inactivo')
  }, [onChange])

  const { indiceActivo, onKeyDown } = useNavegacionLista({
    cantidad: resultados.length,
    abierto: abierto && estado === 'listo',
    onElegirIndice: (i) => elegir(resultados[i]),
    onCerrar: () => setAbierto(false),
  })

  const idCampo = `${uid}-campo`
  const idLista = `${uid}-lista`
  const idError = `${uid}-error`
  const idAyuda = `${uid}-ayuda`

  // ── Cliente ya elegido ─────────────────────────────────────────────────────
  if (value) {
    const sub = [value.apodo && `“${value.apodo}”`, value.nombreComercio].filter(Boolean).join(' · ')
    return (
      <div>
        <p className="block text-surface-300 text-sm min-[1025px]:text-xs tracking-widest uppercase font-body mb-1">Cliente *</p>
        <div className="flex items-center justify-between gap-3 bg-surface-700 border border-surface-600 rounded-xl pl-4 pr-1 min-h-[44px]">
          <div className="min-w-0 py-2">
            <p className="text-white text-sm font-body break-words">
              <User size={14} className="inline mr-1.5 text-brand-400" aria-hidden="true" />
              {nombreCompletoCliente(value)} <span className="text-surface-400 font-mono text-xs">#{value.idCliente}</span>
            </p>
            {sub && <p className="text-surface-400 text-xs font-body break-words">{sub}</p>}
          </div>
          <button
            type="button" disabled={disabled}
            onClick={() => { onChange(null); requestAnimationFrame(() => inputRef.current?.focus()) }}
            className="min-h-[44px] min-w-[44px] px-3 rounded-lg text-brand-400 hover:text-brand-300 text-sm font-body
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-40"
          >
            Cambiar{' '}<span className="sr-only">cliente</span>
          </button>
        </div>
      </div>
    )
  }

  // ── Búsqueda ───────────────────────────────────────────────────────────────
  const mostrarPanel = abierto && consultaBuscable(consulta)
  return (
    <div>
      <label htmlFor={idCampo} className="block text-surface-300 text-sm min-[1025px]:text-xs tracking-widest uppercase font-body mb-1">
        Cliente *
      </label>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" aria-hidden="true" />
        <input
          id={idCampo} ref={inputRef} type="text" autoComplete="off" disabled={disabled}
          role="combobox" aria-expanded={mostrarPanel} aria-controls={idLista} aria-autocomplete="list"
          aria-activedescendant={indiceActivo >= 0 ? idOpcion(idLista, indiceActivo) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error && idError, idAyuda].filter(Boolean).join(' ')}
          data-encargo-invalido={error ? 'true' : undefined}
          value={texto} maxLength={60}
          onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          onKeyDown={onKeyDown}
          placeholder="Nombre, apellido, apodo o ID"
          className={`${CAMPO} ${error ? 'border-red-500 focus-visible:ring-red-500/40' : 'border-surface-600 focus:border-brand-500 focus-visible:ring-brand-500/40'}`}
        />
        {estado === 'buscando' && (
          <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        )}
      </div>
      <p id={idAyuda} className="mt-1 text-surface-500 text-sm min-[1025px]:text-xs font-body">Escribí al menos 2 letras, o el ID del cliente.</p>
      {error && <p id={idError} role="alert" className="mt-1 text-red-400 text-sm min-[1025px]:text-xs font-body">{error}</p>}

      <div role="status" aria-live="polite" className="sr-only">
        {estado === 'listo' ? `${resultados.length} clientes encontrados` : ''}
      </div>

      {!online && mostrarPanel && (
        <p className="mt-1 flex items-center gap-2 text-yellow-300 text-sm font-body"><WifiOff size={14} aria-hidden="true" />Sin conexión: la búsqueda puede fallar.</p>
      )}

      {mostrarPanel && estado === 'listo' && resultados.length > 0 && (
        <ListaOpciones
          idBase={idLista} etiqueta="Clientes encontrados" opciones={resultados}
          claveDe={(c) => c.idCliente} indiceActivo={indiceActivo} onElegir={elegir}
          renderOpcion={(c) => (
            <>
              <p className="text-white text-sm font-body leading-snug break-words">{nombreCompletoCliente(c)}</p>
              <p className="text-surface-400 text-xs font-mono mt-0.5 break-words">
                #{c.idCliente}{c.apodo ? ` · ${c.apodo}` : ''}{c.nombreComercio ? ` · ${c.nombreComercio}` : ''}
              </p>
            </>
          )}
        />
      )}
      {mostrarPanel && estado === 'listo' && resultados.length === 0 && (
        <p className="mt-2 text-surface-300 text-sm font-body">Sin resultados para “{consulta}”. Revisá el texto o creá el cliente desde Clientes.</p>
      )}
      {mostrarPanel && estado === 'error' && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-3 text-sm font-body text-red-300">
          <AlertCircle size={14} aria-hidden="true" />No pudimos buscar clientes.
          <button type="button" onClick={() => setReintento((n) => n + 1)}
            className="min-h-[44px] px-3 rounded-lg border border-surface-600 text-white hover:bg-surface-700">Reintentar</button>
        </div>
      )}
    </div>
  )
}
