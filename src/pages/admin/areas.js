// src/pages/admin/areas.js
// Fuente única de verdad de las tarjetas del Panel Administrativo (Task 1).
// Agregar un área = agregar un objeto aquí (+ su ruta en AdminRoutes). Open/Closed.
import { Wallet, Receipt, BarChart2, Users, ShoppingCart } from 'lucide-react'

export const RUTA_PANEL = '/admin'

/**
 * @typedef {Object} AreaAdmin
 * @property {string} id           Identificador estable (también slug de ruta).
 * @property {string} titulo
 * @property {string} descripcion  Texto de la referencia visual (no editar sin diseño).
 * @property {import('react').ElementType} icono
 * @property {string} accent        Gradiente Tailwind literal (mismos acentos que Dashboard; necesario para el escaneo de Tailwind).
 * @property {string} ruta
 */

/** @type {ReadonlyArray<AreaAdmin>} Orden = orden de la grilla. */
export const AREAS = Object.freeze([
  { id: 'finanzas',        titulo: 'Finanzas',         icono: Wallet,       accent: 'from-brand-500 to-brand-600',    ruta: '/admin/finanzas',
    descripcion: 'Gestiona ingresos, egresos, saldos y movimientos de tus cuentas.' },
  { id: 'facturas',        titulo: 'Facturas',         icono: Receipt,      accent: 'from-violet-500 to-violet-600',  ruta: '/admin/facturas',
    descripcion: 'Genera y exporta PDFs con el listado acorde para la facturación.' },
  { id: 'estadisticas',    titulo: 'Estadísticas',     icono: BarChart2,    accent: 'from-yellow-500 to-yellow-600',  ruta: '/admin/estadisticas',
    descripcion: 'Métricas clave de tu negocio.' },
  { id: 'terceros',        titulo: 'Terceros',         icono: Users,        accent: 'from-emerald-500 to-emerald-600', ruta: '/admin/terceros',
    descripcion: 'Administra los datos de tus clientes y proveedores.' },
  { id: 'ventas-pedidos',  titulo: 'Ventas y Pedidos', icono: ShoppingCart, accent: 'from-pink-500 to-pink-600',    ruta: '/admin/ventas-pedidos',
    descripcion: 'Gestiona y modificá el estado de tus presupuestos, pedidos y categorías de producto.' },
].map(Object.freeze))
