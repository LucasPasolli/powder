// src/pages/admin/secciones.js
// Distribución de las funciones del ex-ABMC por área de negocio (Task 2).
// Invariante verificado por test: cada pestaña existe en EXACTAMENTE una sección.
// Cada pestaña se carga bajo demanda (code-splitting): sólo se descarga lo que se abre.
import { lazy } from 'react'
import {
  TrendingDown, TrendingUp, Scale, Wallet, PiggyBank,
  Users, Truck, FileText, ShoppingCart, Tag,
} from 'lucide-react'

const pestana = (key, label, icon, cargar) => Object.freeze({ key, label, icon, Componente: lazy(cargar) })

export const SECCIONES = Object.freeze({
  finanzas: Object.freeze({
    titulo: 'Finanzas',
    subtitulo: 'Panel administrativo',
    pestanas: Object.freeze([
      pestana('egresos',     'Egresos',    TrendingDown, () => import('./abmc/Egresos')),
      pestana('ingresos',    'Ingresos',   TrendingUp,   () => import('./abmc/Ingresos')),
      pestana('debe-haber',  'Debe/Haber', Scale,        () => import('./abmc/DebeHaber')),
      pestana('saldos',      'Saldos',     Wallet,       () => import('./abmc/Saldos')),
      pestana('inversiones', 'Inversiones',PiggyBank,    () => import('./abmc/Inversiones')),
    ]),
  }),
  terceros: Object.freeze({
    titulo: 'Terceros',
    subtitulo: 'Panel administrativo',
    pestanas: Object.freeze([
      pestana('clientes',    'Clientes',    Users, () => import('./abmc/Clientes')),
      pestana('proveedores', 'Proveedores', Truck, () => import('./abmc/Proveedores')),
    ]),
  }),
  'ventas-pedidos': Object.freeze({
    titulo: 'Ventas y Pedidos',
    subtitulo: 'Panel administrativo',
    pestanas: Object.freeze([
      pestana('presupuestos', 'Presupuestos', FileText,     () => import('./abmc/Presupuestos')),
      pestana('pedidos',      'Pedidos',      ShoppingCart, () => import('./abmc/Pedidos')),
      pestana('categorias',   'Categorías',   Tag,          () => import('./abmc/Categorias')),
    ]),
  }),
})

/** Rutas absolutas de una pestaña (única fuente de armado de URLs). */
export const rutaPestana = (slug, key) => `/admin/${slug}/${key}`
