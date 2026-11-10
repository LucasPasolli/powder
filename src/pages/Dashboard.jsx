// src/pages/Dashboard.jsx
import {
  FileText, Clock, Package,
  Settings2, ShoppingCart, Wallet, Tag
} from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'
import { obtenerDatosDashboard } from '../services/dashboardService'
import PantallaTarjetas from './admin/PantallaTarjetas'

// Mismo formato que las áreas del Panel Administrativo (AreaAdmin), para reutilizar la tarjeta.
// Los gradientes van como literales: Tailwind sólo genera las clases que ve escritas completas.
const SECTIONS = Object.freeze([
  { id: 'presupuestador', ruta: '/presupuestador', icono: FileText,     titulo: 'Presupuestador',
    descripcion: 'Creá nuevos presupuestos con cálculo automático de descuentos y recargos.',
    accent: 'from-brand-500 to-brand-600' },
  { id: 'historial',      ruta: '/historial',      icono: Clock,        titulo: 'Historial',
    descripcion: 'Consultá todos los presupuestos emitidos en modo lectura.',
    accent: 'from-blue-500 to-blue-600' },
  { id: 'inventario',     ruta: '/inventario',     icono: Package,      titulo: 'Inventario',
    descripcion: 'Alta, baja, modificación y consulta del catálogo de productos.',
    accent: 'from-emerald-500 to-emerald-600' },
  { id: 'pedidos',        ruta: '/pedidos',        icono: ShoppingCart, titulo: 'Pedidos de Compra',
    descripcion: 'Armá pedidos a proveedores con precios y cantidades.',
    accent: 'from-pink-500 to-pink-600' },
  { id: 'saldos',         ruta: '/saldos',         icono: Wallet,       titulo: 'Saldos',
    descripcion: 'Seguimiento de cobros pendientes por cuenta corriente.',
    accent: 'from-cyan-500 to-cyan-600' },
  { id: 'promociones',    ruta: '/promociones',    icono: Tag,          titulo: 'Promociones',
    descripcion: 'Creá y gestioná promociones, descuentos especiales y ofertas activas.',
    accent: 'from-orange-500 to-orange-600' },
  { id: 'admin',          ruta: '/admin',          icono: Settings2,    titulo: 'Panel Administrativo',
    descripcion: 'Facturas, estadísticas, finanzas, terceros y ventas en un solo lugar.',
    accent: 'from-violet-500 to-violet-600' },
])

export default function Dashboard() {
  const [stats, setStats] = useState({ presupuestos: 0, pendientes: 0, productos: 0 })

  const loadStats = useCallback(() => {
    obtenerDatosDashboard()
      .then(datos => {
        setStats({
          presupuestos: datos.presupuestosBorrador + datos.presupuestosAprobadosMes,
          pendientes:   datos.saldosPendientes,
          productos:    datos.totalProductos,
        })
      })
      .catch(err => {
        // Si falla silenciosamente igual que antes, no interrumpe la UI
        console.error('[Dashboard] Error cargando stats:', err)
      })
  }, [])

  useEffect(() => {
    loadStats()
    window.addEventListener('focus', loadStats)
    return () => window.removeEventListener('focus', loadStats)
  }, [loadStats])

  return <PantallaTarjetas eyebrow="Panel Principal" titulo="POWDER" areas={SECTIONS} />
}
