// src/pages/admin/SeccionConPestanas.jsx
// Contenedor genérico de sección: la pestaña activa vive en la URL (/admin/:slug/:tab),
// por lo que es compartible, recargable y funciona con atrás/adelante del navegador.
// Cada pestaña se remonta al cambiar (datos siempre frescos: p. ej. un presupuesto
// rechazado modifica saldos, y el listado de Saldos no debe quedar desactualizado).
import { Suspense, useEffect, useRef } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { PageHeader, Spinner } from '../../components/ui'
import LimiteError from './LimiteError'
import VolverAlPanel from './VolverAlPanel'
import { rutaPestana } from './secciones'

const BASE = 'flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl border px-4 font-body text-sm transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'
const ACTIVA = 'border-brand-500/40 bg-brand-500/10 text-brand-400'
const INACTIVA = 'border-surface-700 bg-surface-800 text-surface-200 hover:border-surface-500 hover:text-white'

export default function SeccionConPestanas({ slug, seccion }) {
  const { tab } = useParams()
  const { pestanas, titulo, subtitulo } = seccion
  const activa = pestanas.find((p) => p.key === tab)
  const activaRef = useRef(null)

  // Centra la pestaña activa dentro de su propio contenedor (sin mover el scroll de la página).
  useEffect(() => {
    const el = activaRef.current
    if (!el) return
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: reducir ? 'auto' : 'smooth' })
  }, [activa?.key])

  // /admin/finanzas o pestaña inexistente → primera pestaña (replace: no ensucia el historial).
  if (!activa) return <Navigate to={rutaPestana(slug, pestanas[0].key)} replace />

  const Activa = activa.Componente

  return (
    <div className="mx-auto max-w-6xl min-w-0 space-y-6">
      <VolverAlPanel />

      <PageHeader title={titulo} subtitle={subtitulo} />

      {/* Barra de pestañas: scroll horizontal CONTENIDO (no desborda la página). */}
      <nav aria-label={`Secciones de ${titulo}`} className="-mx-1">
        <ul className="flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x">
          {pestanas.map(({ key, label, icon: Icono }) => {
            const esActiva = key === activa.key
            return (
              <li key={key} className="shrink-0 snap-start">
                <Link to={rutaPestana(slug, key)} ref={esActiva ? activaRef : undefined}
                  aria-current={esActiva ? 'page' : undefined}
                  className={`${BASE} ${esActiva ? ACTIVA : INACTIVA}`}>
                  <Icono size={16} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div key={activa.key} className="min-w-0">
        <LimiteError resetKey={activa.key}>
          <Suspense fallback={<div className="flex justify-center py-12"><Spinner label={`Cargando ${activa.label}`} /></div>}>
            <Activa />
          </Suspense>
        </LimiteError>
      </div>
    </div>
  )
}
