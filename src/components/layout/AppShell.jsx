// src/components/layout/AppShell.jsx
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Clock, Package,
  ShoppingCart, Wallet, Settings2, LogOut, Tag, Menu, X,
} from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { useState, useEffect } from 'react'

const NAV_ITEMS = [
  { to: '/',               icon: LayoutDashboard, label: 'Dashboard'       },
  { to: '/presupuestador', icon: FileText,         label: 'Presupuestador' },
  { to: '/historial',      icon: Clock,            label: 'Historial'      },
  { to: '/inventario',     icon: Package,          label: 'Inventario'     },
  { to: '/pedidos',        icon: ShoppingCart,     label: 'Pedidos de Compra' },
  { to: '/saldos',         icon: Wallet,           label: 'Saldos'         },
  { to: '/promociones',    icon: Tag,              label: 'Promociones'    },
  // Facturas, Estadísticas y el ex-ABMC viven dentro del Panel (cada uno con su segunda capa).
  // Sin `end`: queda resaltado en todo /admin/*.
  { to: '/admin',          icon: Settings2,        label: 'Panel Administrativo' },
]

export default function AppShell({ children }) {
  const { logout }      = useAuth()
  const navigate        = useNavigate()
  const location        = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  // Cerrar el menú al cambiar de ruta
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // Bloquear scroll del body cuando el menú está abierto en mobile
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const navContent = (
    <>
      {/* Nav principal */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm font-body font-medium
              transition-all duration-150 group
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
              ${isActive
                ? 'bg-brand-500/10 text-brand-500'
                : 'text-surface-200 hover:bg-surface-700 hover:text-white'
              }
            `}
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={16}
                  className={`flex-shrink-0 transition-colors ${
                    isActive ? 'text-brand-500' : 'text-surface-300 group-hover:text-brand-400'
                  }`}
                />
                <span className="flex-1">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Cerrar sesión */}
      <div className="px-3 py-4 border-t border-surface-700">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-sm
                     font-body font-medium text-surface-400
                     hover:bg-red-500/10 hover:text-red-400
                     transition-all duration-150 group"
        >
          <LogOut size={16} className="flex-shrink-0 text-surface-500 group-hover:text-red-400 transition-colors" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-surface-900">

      {/* ── Sidebar desktop (≥ lg) ──────────────────────────────── */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-56 bg-surface-800 border-r border-surface-700 flex-col z-40">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-surface-700">
          <span className="font-display text-3xl tracking-widest text-white leading-none">
            POWDER
          </span>
          <p className="text-brand-500 text-[10px] font-mono tracking-[0.25em] uppercase mt-0.5">
            Sistema de gestión
          </p>
        </div>

        {navContent}
      </aside>

      {/* ── Topbar mobile (< lg) ────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-surface-800 border-b border-surface-700 flex items-center justify-between px-4 z-50">
        <span className="font-display text-2xl tracking-widest text-white leading-none">
          POWDER
        </span>
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-surface-200 hover:text-white hover:bg-surface-700 transition-all"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* ── Drawer mobile ───────────────────────────────────────── */}
      {/* Backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-300
                    ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Panel */}
      <div
        className={`lg:hidden fixed top-0 left-0 h-screen w-64 bg-surface-800 border-r border-surface-700
                    flex flex-col z-50 transition-transform duration-300 ease-in-out
                    ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo dentro del drawer */}
        <div className="px-6 py-5 border-b border-surface-700 flex items-center justify-between">
          <div>
            <span className="font-display text-2xl tracking-widest text-white leading-none">
              POWDER
            </span>
            <p className="text-brand-500 text-[10px] font-mono tracking-[0.25em] uppercase mt-0.5">
              Sistema de gestión
            </p>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-surface-200 hover:text-white hover:bg-surface-700 transition-all"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>
        </div>

        {navContent}
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 lg:ml-56 min-h-screen">
        {/* `min-w-0` (arriba): un hijo flex tiene min-width:auto y una tabla ancha estiraba toda la página. */}
        {/* Spacer para el topbar en mobile */}
        <div className="lg:hidden h-14" />
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>

    </div>
  )
}
