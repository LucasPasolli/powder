// src/components/notas/NotaEditor.jsx
/**
 * Editor de una nota (alta y edición). Texto plano, contador y validación.
 *
 * Diseño minimalista (divulgación progresiva):
 *  · Modo `expandible` (alta): arranca como UNA línea; al enfocar o escribir se
 *    despliega el pie con contador y botón. Vacío y sin foco = casi sin espacio.
 *  · Modo edición: siempre expandido, con "Cancelar".
 *  · El textarea crece con el contenido (hasta un máximo) en vez de reservar alto.
 *
 * Escenarios: 5 (validaciones + contador + error), 9 (latch anti doble envío),
 * 10 (conserva el texto y ofrece reintentar), 13 (táctil ≥ 44 px, teclado virtual).
 *
 * @module components/notas/NotaEditor
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '../ui'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import { useTecladoVirtual } from '../../hooks/useTecladoVirtual'
import { ErrorNota } from '../../services/notasService'
import { LIMITE_NOTA, estadoContador, mensajeErrorNota, validarNota } from '../../lib/notas'

const COLOR_CONTADOR = {
  ok:       'text-surface-500',
  cerca:    'text-yellow-400',
  excedido: 'text-red-400 font-semibold',
}
const ANUNCIO_CONTADOR = {
  ok: '',
  cerca: 'Te acercás al límite de caracteres.',
  excedido: 'Superaste el límite de caracteres.',
}
const TOUCH = 'min-h-[44px] min-[1025px]:min-h-0 justify-center'

/**
 * @param {Object} props
 * @param {string} [props.valorInicial]
 * @param {(texto: string) => Promise<{ ok: boolean, error?: ErrorNota }>} props.onSubmit
 * @param {() => void} [props.onCancel]
 * @param {boolean} [props.expandible]       Alta: pie visible solo con foco/texto.
 * @param {boolean} [props.limpiarAlGuardar]
 * @param {string} [props.etiqueta]          Etiqueta accesible (no visible).
 * @param {string} [props.etiquetaGuardar]
 * @param {string} [props.placeholder]
 * @param {boolean} [props.autoFocus]
 */
export default function NotaEditor({
  valorInicial = '',
  onSubmit,
  onCancel,
  expandible = false,
  limpiarAlGuardar = false,
  etiqueta = 'Nueva nota',
  etiquetaGuardar = 'Guardar nota',
  placeholder = 'Agregar una nota…',
  autoFocus = false,
}) {
  const id = useId()
  const contadorId = `${id}-contador`
  const errorId = `${id}-error`

  const [texto, setTexto] = useState(valorInicial)
  const [tocado, setTocado] = useState(false)
  const [enfocado, setEnfocado] = useState(false)
  /** @type {[ErrorNota|null, Function]} */
  const [errorGuardado, setErrorGuardado] = useState(null)

  const contenedorRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const campoRef = useRef(/** @type {HTMLTextAreaElement|null} */ (null))
  const tecladoAbierto = useTecladoVirtual()

  const v = useMemo(() => validarNota(texto), [texto])
  const estadoCont = estadoContador(v)
  const errorValidacion = v.error === 'excede' || (tocado && v.error === 'vacia')
    ? mensajeErrorNota(v)
    : ''
  const expandido = !expandible || enfocado || texto !== '' || errorGuardado !== null

  // Alto = contenido, siempre (sin scroll interno ni flechas). Con el límite de
  // 400 caracteres el campo nunca crece de forma excesiva. `scrollHeight` excluye
  // los bordes, por eso se suman (si no, quedaba 2 px corto y aparecía scroll).
  const ajustarAlto = useCallback(() => {
    const el = campoRef.current
    if (!el) return
    el.style.height = 'auto'
    const bordes = el.offsetHeight - el.clientHeight
    el.style.height = `${el.scrollHeight + bordes}px`
  }, [])

  useLayoutEffect(ajustarAlto, [texto, ajustarAlto])

  // Si cambia el ANCHO (rotar el equipo, redimensionar) el texto reacomoda sus líneas.
  useEffect(() => {
    window.addEventListener('resize', ajustarAlto)
    return () => window.removeEventListener('resize', ajustarAlto)
  }, [ajustarAlto])

  // Teclado virtual (Escenario 13): alinea el bloque (campo + botón) al borde visible.
  useEffect(() => {
    const el = contenedorRef.current
    if (!tecladoAbierto || !el || !el.contains(document.activeElement)) return
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'end', behavior: reducir ? 'auto' : 'smooth' })
  }, [tecladoAbierto])

  useEffect(() => { if (autoFocus) campoRef.current?.focus() }, [autoFocus])

  async function guardar() {
    setTocado(true)
    if (!validarNota(texto).valido) return
    setErrorGuardado(null)

    const res = await onSubmit(texto)
    if (res.ok) {
      if (limpiarAlGuardar) { setTexto(''); setTocado(false) }
      return
    }
    setErrorGuardado(res.error ?? new ErrorNota('DESCONOCIDO')) // el texto queda intacto
  }

  // minPendingMs: 0 → el latch se libera al terminar; así un "Reintentar" inmediato
  // no se descarta. El <Button> mantiene su propio latch anti doble clic.
  const { run, pending } = useAsyncAction(guardar, {
    nombre: 'guardar_nota',
    minPendingMs: 0,
    onError: (err) => setErrorGuardado(
      err?.codigo === 'TIMEOUT'
        ? new ErrorNota('TIMEOUT', 'La operación está tardando más de lo normal.')
        : new ErrorNota('DESCONOCIDO'),
    ),
  })

  const onChange = useCallback((e) => {
    setTexto(e.target.value); setTocado(true); setErrorGuardado(null)
  }, [])

  function onKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run() }
    else if (e.key === 'Escape' && onCancel && !pending) { e.preventDefault(); onCancel() }
  }

  const describedBy = [expandido ? contadorId : null, errorValidacion ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <div ref={contenedorRef} className="scroll-mb-4">
      <label htmlFor={id} className="sr-only">{etiqueta}</label>

      <textarea
        id={id}
        ref={campoRef}
        value={texto}
        rows={1}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        readOnly={pending}
        aria-invalid={errorValidacion ? true : undefined}
        aria-describedby={describedBy}
        aria-busy={pending || undefined}
        autoComplete="off"
        spellCheck
        placeholder={placeholder}
        className={`block w-full resize-none overflow-hidden min-h-[44px] min-[1025px]:min-h-[40px]
                    bg-surface-700/40 border rounded-lg px-3 py-2.5 text-white leading-relaxed
                    text-base sm:text-sm font-body placeholder-surface-500 read-only:opacity-70
                    focus:outline-none focus:bg-surface-700/70 focus:ring-1 transition-colors duration-150
                    ${errorValidacion
                      ? 'border-red-500/70 focus:border-red-500 focus:ring-red-500/30'
                      : 'border-surface-700 focus:border-brand-500 focus:ring-brand-500/30'}`}
      />

      {expandido && (
        <div className="mt-2 space-y-2">
          {(errorValidacion || errorGuardado) && (
            <div role="alert" id={errorValidacion ? errorId : undefined}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-red-400 text-xs font-body">
              <span className="flex items-start gap-1.5">
                <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
                <span>
                  {errorValidacion || errorGuardado.message}
                  {!errorValidacion && ' Tu texto se conservó.'}
                </span>
              </span>
              {!errorValidacion && errorGuardado.reintentable && (
                <button type="button" onClick={run}
                  className="min-h-[44px] min-[1025px]:min-h-0 px-1 underline underline-offset-2 hover:text-red-300
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 rounded">
                  Reintentar
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <p id={contadorId} className={`font-mono tabular-nums text-xs ${COLOR_CONTADOR[estadoCont]}`}>
              {v.longitud.toLocaleString('es-AR')} / {LIMITE_NOTA.toLocaleString('es-AR')}
            </p>
            <span role="status" aria-live="polite" className="sr-only">{ANUNCIO_CONTADOR[estadoCont]}</span>

            <div className="flex items-center gap-2">
              {onCancel && (
                <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending} className={TOUCH}>
                  Cancelar
                </Button>
              )}
              <Button size="sm" onClick={run} loading={pending} disabled={!v.valido}
                loadingText="Guardando la nota, aguardá un momento" className={TOUCH}>
                {etiquetaGuardar}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
