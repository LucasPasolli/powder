// src/components/encargos/SelectorEncargosPedido.jsx
// TASK 2 — «Añadir Encargo(s)» al crear un Pedido de Compra (Escenarios 1, 2 y 6).
//   · E1  Lista los encargos «Pendiente» disponibles (se consulta al abrir: siempre datos frescos).
//   · E2  Selección múltiple; al confirmar, el padre incorpora productos y cantidades a las líneas.
//   · E6  Los cancelados (y cualquier no pendiente) NO aparecen.
// Estados: cargando · error (reintento) · vacío · sin conexión. Responsive vía ResponsiveDialog
// (pantalla completa ≤ 1024 px, modal en escritorio). Filas con área táctil ≥ 44 px.

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, Loader2, Search } from 'lucide-react'
import ResponsiveDialog from '../ui/ResponsiveDialog'
import { Button } from '../ui'
import { TOUCH, fmtFecha } from '../pedidos/pedidosPresentacion'
import { obtenerEncargosDisponibles } from '../../services/encargosService'
import { LIMITE_ENCARGOS_POR_PEDIDO, filtrarEncargos, nombreCompletoCliente } from '../../lib/encargos'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { logger } from '../../lib/logger'
import { LineasEncargo } from './encargosPresentacion'

/**
 * @param {object} props
 * @param {()=>void} props.onClose
 * @param {Set<number>} props.yaAnadidos                       ids ya incorporados al pedido en edición.
 * @param {number} props.cupo                                  cuántos más se pueden añadir (límite por pedido).
 * @param {(encargos: object[])=>void} props.onConfirmar
 */
export default function SelectorEncargosPedido({ onClose, yaAnadidos, cupo, onConfirmar }) {
  const uid = useId()
  const online = useOnlineStatus()
  const [estado, setEstado] = useState(/** @type {'cargando'|'listo'|'error'} */ ('cargando'))
  const [encargos, setEncargos] = useState([])
  const [seleccion, setSeleccion] = useState(() => new Set())
  const [texto, setTexto] = useState('')
  const [reintento, setReintento] = useState(0)

  useEffect(() => {
    let cancelado = false
    setEstado('cargando')
    obtenerEncargosDisponibles()
      .then((lista) => { if (!cancelado) { setEncargos(lista.filter((e) => !yaAnadidos.has(e.idEncargo))); setEstado('listo') } })
      .catch((err) => { logger.error('encargos.disponibles_error', { error: err }); if (!cancelado) setEstado('error') })
    return () => { cancelado = true }
  }, [reintento]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => filtrarEncargos(encargos, texto), [encargos, texto])
  const conBaja = (e) => e.detalles.some((d) => !d.productoActivo)

  const alternar = useCallback((e) => {
    setSeleccion((prev) => {
      const sig = new Set(prev)
      if (sig.has(e.idEncargo)) sig.delete(e.idEncargo)
      else if (sig.size < cupo) sig.add(e.idEncargo)
      return sig
    })
  }, [cupo])

  const confirmar = () => onConfirmar(encargos.filter((e) => seleccion.has(e.idEncargo)))
  const n = seleccion.size

  const buscador = (
    <div className="relative">
      <label htmlFor={`${uid}-buscar`} className="sr-only">Buscar encargos por cliente, producto o número</label>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" aria-hidden="true" />
      <input id={`${uid}-buscar`} type="search" value={texto} maxLength={60} autoComplete="off"
        onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por cliente, producto o número"
        className="w-full bg-surface-700 border border-surface-600 rounded-xl pl-10 pr-3 min-h-[44px] text-white text-base min-[1025px]:text-sm font-body
                   placeholder:text-surface-500 focus:outline-none focus:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40" />
    </div>
  )

  const pie = (
    <div className="px-4 sm:px-6 py-3 border-t border-surface-700 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
      <p role="status" aria-live="polite" className="text-surface-400 text-sm font-body sm:mr-auto">
        {n === 0 ? 'Ningún encargo seleccionado.' : `${n} ${n === 1 ? 'encargo seleccionado' : 'encargos seleccionados'}.`}
        {n >= cupo && ` Máximo ${LIMITE_ENCARGOS_POR_PEDIDO} por pedido.`}
      </p>
      <Button variant="secondary" className={TOUCH} onClick={onClose}>Cancelar</Button>
      <Button className={TOUCH} onClick={confirmar} disabled={n === 0}>Añadir {n > 0 ? `(${n})` : ''}</Button>
    </div>
  )

  return (
    <ResponsiveDialog open onClose={onClose} title="Añadir Encargo(s)" toolbar={estado === 'listo' && encargos.length > 0 ? buscador : null}
      subtitle="Encargos pendientes de clientes. Sus productos y cantidades se suman a las líneas del pedido."
      busy={estado === 'cargando'} footer={pie}>
      {!online && (
        <p role="status" className="m-4 flex items-center gap-2 text-yellow-300 text-sm font-body"><AlertTriangle size={14} aria-hidden="true" />Sin conexión: la lista puede estar desactualizada.</p>
      )}

      {estado === 'cargando' && (
        <p role="status" className="flex items-center justify-center gap-2 py-16 text-surface-400 text-sm font-body">
          <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Cargando encargos pendientes…
        </p>
      )}
      {estado === 'error' && (
        <div role="alert" className="flex flex-col items-center gap-3 py-12 px-4 text-center">
          <AlertCircle size={24} className="text-red-400" aria-hidden="true" />
          <p className="text-surface-300 text-sm font-body">No pudimos cargar los encargos pendientes.</p>
          <Button variant="secondary" className={TOUCH} onClick={() => setReintento((r) => r + 1)}>Reintentar</Button>
        </div>
      )}
      {estado === 'listo' && encargos.length === 0 && (
        <p className="py-16 px-4 text-center text-surface-400 text-sm font-body">No hay encargos pendientes disponibles para añadir.</p>
      )}
      {estado === 'listo' && encargos.length > 0 && visibles.length === 0 && (
        <p className="py-12 px-4 text-center text-surface-400 text-sm font-body">Ningún encargo coincide con “{texto.trim()}”.</p>
      )}

      {estado === 'listo' && visibles.length > 0 && (
        <ul aria-label="Encargos pendientes" className="p-3 sm:p-4 space-y-2">
          {visibles.map((e) => {
            const marcado = seleccion.has(e.idEncargo)
            const baja = conBaja(e)
            const sinCupo = !marcado && seleccion.size >= cupo
            const idChk = `${uid}-e${e.idEncargo}`
            return (
              <li key={e.idEncargo} className={`rounded-xl border transition-colors ${marcado ? 'border-brand-500/50 bg-brand-500/10' : 'border-surface-700 bg-surface-800/60'}`}>
                <div className="flex items-start gap-3 p-3">
                  <input id={idChk} type="checkbox" checked={marcado} disabled={baja || sinCupo} onChange={() => alternar(e)}
                    aria-describedby={baja ? `${idChk}-baja` : undefined}
                    className="mt-0.5 h-6 w-6 flex-shrink-0 accent-brand-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40" />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={idChk} className="block cursor-pointer min-h-[44px] -mt-1 pt-1">
                      <span className="block text-white text-sm font-body font-semibold break-words">{nombreCompletoCliente(e.cliente)}</span>
                      <span className="block text-surface-400 text-xs font-mono">Encargo #{e.idEncargo} · {fmtFecha(e.fecha)}</span>
                    </label>
                    <LineasEncargo detalles={e.detalles} max={3} />
                    {baja && (
                      <p id={`${idChk}-baja`} className="mt-1 text-amber-300 text-sm min-[1025px]:text-xs font-body">
                        Incluye productos dados de baja: reactivalos en Inventario o cancelá el encargo.
                      </p>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </ResponsiveDialog>
  )
}
