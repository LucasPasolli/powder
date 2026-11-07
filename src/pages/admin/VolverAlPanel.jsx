// src/pages/admin/VolverAlPanel.jsx
// Flecha de retorno al Panel Administrativo. ÚNICA fuente del componente: la usan las secciones
// con pestañas (Finanzas, Terceros, Ventas y Pedidos) y los módulos Facturas y Estadísticas,
// por lo que posición, tamaño, icono, estilo y comportamiento son idénticos en todos.
// Es un <Link> (no un botón con history.back): funciona con URL directa, marcadores y nueva pestaña,
// y no depende del historial del navegador. Destino: RUTA_PANEL (fuente única en areas.js).
// Accesibilidad: objetivo táctil ≥ 44 px (WCAG 2.5.5), foco visible por teclado, icono decorativo.
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { RUTA_PANEL } from './areas'

export default function VolverAlPanel() {
  return (
    <Link to={RUTA_PANEL}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-lg font-body text-sm text-surface-200 hover:text-white
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
      <ArrowLeft size={16} aria-hidden="true" /> Panel Administrativo
    </Link>
  )
}
