// src/components/notas/NotasRegistro.jsx
/**
 * Sección "Notas" al pie del detalle de un registro (Historial, Saldos, Pedidos).
 *
 * Uso:
 *   <NotasRegistro tipo="presupuesto"   idRegistro={pres.idPresupuesto} />
 *   <NotasRegistro tipo="saldo"         idRegistro={saldo.idSaldo} />
 *   <NotasRegistro tipo="pedido_compra" idRegistro={pedido.idPedido} />
 *
 * Es AUTÓNOMA y desacoplada del registro (Escenario 7): lee/escribe solo la
 * tabla `nota_registro`, de modo que nunca altera los datos ni el estado del
 * registro, y funciona igual en cualquier estado (Recibido, Pagado, Confirmado…).
 *
 * Escenario 8 (exportar / imprimir / PDF): los PDF del proyecto se generan a
 * partir de sus propias consultas, que no incluyen notas; para la impresión del
 * navegador la sección lleva `print:hidden` + `data-no-print` (ver index.css).
 *
 * @module components/notas/NotasRegistro
 */
import { useCallback, useEffect, useId, useState } from 'react'
import { AlertCircle, FileText, RefreshCw, WifiOff } from 'lucide-react'
import { Card } from '../ui'
import NotaEditor from './NotaEditor'
import NotaItem from './NotaItem'
import { useNotas } from '../../hooks/useNotas'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { NOTAS_VISIBLES_INICIAL, TIPOS_REGISTRO } from '../../lib/notas'

function EsqueletoNotas() {
  return (
    <div role="status" aria-label="Cargando notas" className="mt-4 space-y-2">
      <div className="h-4 w-3/4 rounded bg-surface-700/50 animate-pulse motion-reduce:animate-none" />
      <div className="h-4 w-1/2 rounded bg-surface-700/50 animate-pulse motion-reduce:animate-none" />
    </div>
  )
}

// Enlace de texto (acción terciaria): sin caja, área táctil de 44 px en touch.
const ENLACE = `inline-flex items-center min-h-[44px] min-[1025px]:min-h-0 text-xs font-body text-surface-400
  hover:text-white underline-offset-2 hover:underline rounded
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60`

function SeccionNotas({ tipo, idRegistro, className }) {
  const tituloId = useId()
  const online = useOnlineStatus()
  const { notas, estado, recargar, crear, editar, eliminar } = useNotas(tipo, idRegistro)

  const [verTodas, setVerTodas] = useState(false)
  const [confirmacion, setConfirmacion] = useState('')

  // Confirmación breve y anunciada, ubicada en la cabecera (no ocupa filas extra).
  useEffect(() => {
    if (!confirmacion) return undefined
    const t = setTimeout(() => setConfirmacion(''), 3000)
    return () => clearTimeout(t)
  }, [confirmacion])

  const alta = useCallback(async (texto) => {
    const res = await crear(texto)
    if (res.ok) setConfirmacion('Nota guardada.')
    return res
  }, [crear])

  const baja = useCallback(async (idNota) => {
    const res = await eliminar(idNota)
    if (res.ok) setConfirmacion('Nota eliminada.')
    return res
  }, [eliminar])

  const modif = useCallback(async (idNota, texto) => {
    const res = await editar(idNota, texto)
    if (res.ok && !res.sinCambios) setConfirmacion('Nota actualizada.')
    return res
  }, [editar])

  const visibles = verTodas ? notas : notas.slice(0, NOTAS_VISIBLES_INICIAL)
  const ocultas = notas.length - visibles.length

  return (
    <section aria-labelledby={tituloId} data-no-print className={`print:hidden ${className}`}>
      <Card className="p-4 sm:p-5">
        {/* Cabecera mínima: etiqueta discreta + contador / confirmación a la derecha. */}
        <div className="flex items-center justify-between gap-3 mb-3 min-h-[20px]">
          <h3 id={tituloId} className="flex items-center gap-1.5 text-xs font-body font-semibold tracking-widest uppercase text-surface-400">
            <FileText size={13} aria-hidden="true" />
            Notas
          </h3>
          <p role="status" aria-live="polite" className="text-xs font-body tabular-nums">
            {confirmacion
              ? <span className="text-emerald-400">{confirmacion}</span>
              : estado === 'ok' && notas.length > 0 && <span className="text-surface-500 font-mono">{notas.length}</span>}
          </p>
        </div>

        {!online && (
          <p role="status" className="flex items-center gap-1.5 mb-3 text-yellow-400 text-xs font-body">
            <WifiOff size={13} aria-hidden="true" />
            Sin conexión: no se guardará hasta que se restablezca.
          </p>
        )}

        <NotaEditor expandible limpiarAlGuardar onSubmit={alta} />

        {estado === 'cargando' && <EsqueletoNotas />}

        {estado === 'error' && (
          <p role="alert" className="mt-4 flex flex-wrap items-center gap-x-3 text-red-400 text-xs font-body">
            <span className="flex items-center gap-1.5"><AlertCircle size={13} aria-hidden="true" />No se pudieron cargar las notas.</span>
            <button type="button" onClick={recargar} className={`${ENLACE} !text-red-400 underline`}>
              <RefreshCw size={12} className="mr-1" aria-hidden="true" />Reintentar
            </button>
          </p>
        )}

        {estado === 'ok' && notas.length > 0 && (
          <div className="mt-4">
            <ul aria-label="Notas del registro, de la más reciente a la más antigua"
              className="divide-y divide-surface-700/60">
              {visibles.map((n) => (
                <NotaItem key={n.idNota} nota={n} onEditar={modif} onEliminar={baja} />
              ))}
            </ul>
            {notas.length > NOTAS_VISIBLES_INICIAL && (
              <button type="button" className={`${ENLACE} mt-1`} aria-expanded={verTodas}
                onClick={() => setVerTodas((x) => !x)}>
                {verTodas ? 'Mostrar menos' : `Ver ${ocultas} más`}
              </button>
            )}
          </div>
        )}
      </Card>
    </section>
  )
}

/**
 * Wrapper: valida props y reinicia TODO el estado interno al cambiar de registro
 * (`key`), evitando mostrar por un instante las notas del registro anterior.
 *
 * @param {Object} props
 * @param {keyof typeof TIPOS_REGISTRO} props.tipo
 * @param {number|string} props.idRegistro
 * @param {string} [props.className]
 */
export default function NotasRegistro({ tipo, idRegistro, className = '' }) {
  const id = Number(idRegistro)
  if (!TIPOS_REGISTRO[tipo] || !Number.isInteger(id) || id <= 0) return null
  return <SeccionNotas key={`${tipo}:${id}`} tipo={tipo} idRegistro={id} className={className} />
}
