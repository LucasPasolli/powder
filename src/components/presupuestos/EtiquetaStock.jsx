// src/components/presupuestos/EtiquetaStock.jsx
// Marca INTERNA de stock: etiqueta discreta por fila + aviso resumen reutilizable.
// Solo informan: nunca deshabilitan nada ni alteran la detección o el guardado.
//
// Diseño (minimalista): fondo neutro, UN único acento (ámbar) en el ícono y en el borde izquierdo.
// Jerarquía: mensaje principal (claro) + detalle secundario (atenuado). Sin negritas ni colores
// mezclados en la misma frase. El aviso NO repite la etiqueta "Sin stock" por producto (ya está
// en cada fila): resume y lista solo nombres.
//
// Accesibilidad (WCAG 2.1 AA): el significado no depende del color (ícono + texto); textos
// surface-100/300 sobre fondo oscuro neutro superan 4.5:1; nada depende de `hover`; el colapsable
// es un <button> con aria-expanded y área táctil ≥ 44 px en mobile/tablet.
// Responsive: `min-w-0` + `break-words`; el contenido apila y envuelve en 320 px sin desbordar.
// No usar en PDF ni en vistas del cliente (es información interna).

import { useId, useState } from 'react'
import { AlertCircle, ChevronDown } from 'lucide-react'
import { detalleExcedente, etiquetaStock, tieneAdvertencia } from '../../lib/stockPresupuesto'

/** Hasta esta cantidad los productos se listan por nombre; con más se colapsan (Escenario 8). */
export const UMBRAL_LISTA_STOCK = 3

const plural = (n, singular, pluralForma) => (n === 1 ? singular : pluralForma)

/**
 * Etiqueta discreta de la fila: mismo lenguaje que el resto de chips (píldora neutra, sin borde),
 * con el ícono como único acento. Tamaño fijo y pequeño: no altera la alineación de la fila.
 * `conIcono` / `conExceso` (ambos true por defecto) permiten ocultar el ícono y el detalle
 * "Exceden el stock: N unidades" según el contexto (tabla de carga, detalle del historial).
 * @param {{ estado?: import('../../lib/stockPresupuesto').EstadoStock, className?: string, conIcono?: boolean, conExceso?: boolean }} props
 */
export default function EtiquetaStock({ estado, className = '', conIcono = true, conExceso = true }) {
  if (!tieneAdvertencia(estado)) return null
  const etiqueta = etiquetaStock(estado)
  const exceso = conExceso ? detalleExcedente(estado) : null

  return (
    <span
      data-testid="etiqueta-stock"
      className={`inline-flex max-w-full flex-wrap items-center gap-x-1 gap-y-0.5 rounded-full bg-surface-700/60
                  px-2 py-0.5 text-[11px] leading-4 font-body text-surface-200 ${className}`}
    >
      {conIcono && <AlertCircle size={11} className="flex-shrink-0 text-yellow-400" aria-hidden="true" />}
      <span className="min-w-0 break-words">{etiqueta}</span>
      {exceso && <span className="min-w-0 break-words text-surface-300">· {exceso}</span>}
    </span>
  )
}

/**
 * Textos del aviso a partir del resumen (puro, sin React).
 *  · Solo sin stock        → "2 productos sin stock"
 *  · Solo insuficientes    → "1 producto con stock insuficiente"
 *  · Mezcla                → "3 productos requieren gestión de stock" + desglose en el detalle
 */
export function textosAvisoStock({ total, sinStock, insuficientes }) {
  let principal
  let desglose = null
  if (insuficientes === 0) principal = `${total} ${plural(total, 'producto sin stock', 'productos sin stock')}`
  else if (sinStock === 0) principal = `${total} ${plural(total, 'producto con stock insuficiente', 'productos con stock insuficiente')}`
  else {
    principal = `${total} productos requieren gestión de stock`
    desglose = `${sinStock} sin stock · ${insuficientes} con stock insuficiente`
  }
  return { principal, desglose, secundario: 'Es informativo: podés continuar.' }
}

function NombreProducto({ a }) {
  // Sin "Sin stock" (ya está en la fila). Solo en insuficiente se aclara el disponible, que no se
  // ve en otro lado dentro del modal.
  const detalle = a.estado?.tipo === 'insuficiente' ? `disponible ${a.estado.disponible}` : null
  return (
    <>
      <span className="break-words text-surface-100">{a.nombre}</span>
      {a.medida ? <span className="text-surface-300"> · {a.medida}</span> : null}
      {detalle ? <span className="text-surface-300"> ({detalle})</span> : null}
    </>
  )
}

/**
 * Aviso informativo de stock (banner de carga, modal "Guardado" y Historial: mismo componente).
 * @param {{
 *   resumen: ReturnType<typeof import('../../lib/stockPresupuesto').resumirAdvertencias>,
 *   titulo?: string,
 *   variante?: 'carga' | 'modal',
 *   className?: string
 * }} props
 *   `variante="modal"` solo ajusta lo necesario por contexto: sin margen propio y más compacto,
 *   para no alargar el modal ni competir con las acciones.
 */
export function ResumenAdvertenciasStock({ resumen, titulo, variante = 'carga', className = '' }) {
  const [expandido, setExpandido] = useState(false)
  const idLista = useId()
  if (!resumen || resumen.total === 0) return null

  const { items } = resumen
  const { principal, desglose, secundario } = textosAvisoStock(resumen)
  const colapsable = items.length > UMBRAL_LISTA_STOCK
  const listaVisible = !colapsable || expandido
  const compacto = variante === 'modal'

  return (
    <section
      aria-label="Aviso de stock"
      data-variante={variante}
      className={`flex items-start rounded-lg border border-surface-700 border-l-2 border-l-yellow-500
                  bg-surface-800/60 text-left ${compacto ? 'px-3 py-2.5' : 'px-3 py-3 sm:px-4'} ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p role="status" className="text-sm font-body leading-snug text-surface-100 break-words">
          {titulo ?? principal}
        </p>
        <p className="mt-0.5 text-xs font-body leading-snug text-surface-300 break-words">
          {desglose ? `${desglose}. ` : ''}{secundario}
        </p>

        {colapsable && (
          <button
            type="button"
            aria-expanded={expandido}
            aria-controls={idLista}
            onClick={() => setExpandido((v) => !v)}
            className="mt-1 -ml-1 inline-flex min-h-[44px] items-center gap-1 rounded-md px-1 text-xs font-body text-surface-200
                       hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60
                       min-[1025px]:min-h-0 min-[1025px]:py-1"
          >
            {expandido ? 'Ocultar productos' : `Ver los ${items.length} productos`}
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${expandido ? 'rotate-180' : ''}`} />
          </button>
        )}

        {listaVisible && (
          <ul
            id={idLista}
            className={`mt-1.5 space-y-1 overflow-y-auto overscroll-contain pr-1 text-xs font-body ${compacto ? 'max-h-28' : 'max-h-40'}`}
          >
            {items.map((a) => (
              <li key={a.clave} className="min-w-0 leading-snug"><NombreProducto a={a} /></li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
