// src/components/ui/PaginadorListado.jsx
// Pie de paginación de los listados de Historial y Saldos, extraído como componente
// compartido (DRY) para que Pedidos de Compra se comporte EXACTAMENTE igual:
//   · una sola fila en todos los anchos: contador a la izquierda, «← Anterior» / «Siguiente →» a la derecha;
//   · botones de 44 px de alto (área táctil mínima, WCAG 2.5.5);
//   · se renderiza DENTRO del <Card> del listado (la línea `border-t` lo separa del contenido).
//
// Presentacional: no conoce el hook ni el scroll. Avisa con `onChange(nuevaPagina)` y el
// padre decide qué más hacer (p. ej. `scrollToStart()`).

import { Button } from './index'

/**
 * @param {object}   props
 * @param {number}   props.page         Página actual (1-based).
 * @param {number}   props.totalPages
 * @param {number}   props.pageSize
 * @param {number}   props.total        Total de elementos del listado ya filtrado.
 * @param {(pagina:number)=>void} props.onChange
 */
export default function PaginadorListado({ page, totalPages, pageSize, total, onChange }) {
  if (totalPages <= 1) return null

  const desde = (page - 1) * pageSize + 1
  const hasta = Math.min(page * pageSize, total)

  return (
    <nav aria-label="Paginación del listado"
      className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-surface-700">
      <p role="status" aria-live="polite" className="text-surface-400 text-xs font-body">
        {desde}–{hasta} de {total}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" className="min-h-[44px]"
          onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}>
          ← Anterior
        </Button>
        <Button size="sm" variant="secondary" className="min-h-[44px]"
          onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
          Siguiente →
        </Button>
      </div>
    </nav>
  )
}
