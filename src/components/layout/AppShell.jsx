// src/components/layout/AppShell.jsx
//
// Shell de navegación con TRES presentaciones a partir de UN solo árbol de ítems:
//
//   · Mobile  (< 768 px)      : topbar + drawer superpuesto (hamburguesa).
//   · Tablet  (768 – 1024 px) : rail compacto fijo, solo íconos (64 px) + tooltip.
//   · Desktop (≥ 1025 px)     : sidebar completa de 224 px (comportamiento original).
//
// El umbral de desktop es 1025 px, igual que ResponsiveDialog / PaginadorTabla
// (“≤ 1024 px = layout táctil”). Así toda la app comparte una sola definición
// de "tablet" y no hay anchos intermedios con comportamientos mezclados.
//
// Decisiones de diseño
//  · El rail y la sidebar son el MISMO <aside>; solo cambian clases CSS. Rotar
//    el equipo no remonta nada. El drawer es un árbol aparte porque su ciclo de
//    vida (abrir/cerrar, foco, scroll-lock) es distinto.
//  · <NavList> es presentacional y recibe `variant` ('sidebar' | 'drawer'):
//    una sola fuente de verdad para ítems, estado activo y tamaños de toque.
//  · Tooltip del rail: UN único nodo `position: fixed` calculado con
//    getBoundingClientRect. No puede ser un hijo absoluto del ítem porque el
//    <nav> tiene overflow-y: auto y lo recortaría.
//    Mouse → hover · Teclado → :focus-visible · Táctil → pulsación larga (450 ms).
//
// Accesibilidad (WCAG 2.1 AA)
//  · El rail oculta el texto con `sr-only` (no con display:none): el nombre
//    accesible de cada enlace sigue siendo su etiqueta.
//  · NavLink aporta aria-current="page" en la sección activa.
//  · Hamburguesa con aria-expanded / aria-controls; Escape cierra y devuelve
//    el foco; mientras el drawer está abierto el contenido y el drawer cerrado
//    quedan `inert` (sin foco ni lectura de pantalla).
//  · Todos los objetivos táctiles ≥ 44 × 44 px.

import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Clock, Package,
  ShoppingCart, Wallet, Settings2, LogOut, Tag, Menu, X,
} from 'lucide-react'
import { useAuth } from '../../lib/AuthContext'
import { useState, useEffect, useRef, useCallback } from 'react'

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

/** Desde 768 px el drawer deja de existir (rail o sidebar). */
const MQ_TABLET_UP = '(min-width: 768px)'
/** Rango donde la sidebar se muestra como rail de íconos. */
const MQ_RAIL = '(min-width: 768px) and (max-width: 1024px)'
const LONG_PRESS_MS = 450
const TIP_VISIBLE_MS = 1800

/** matchMedia seguro (SSR / entornos de test sin implementación). */
function matches(query) {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false
}

/* ──────────────────────────────────────────────────────────────────────────
   Tooltip del rail (hover · foco de teclado · pulsación larga táctil)
   ────────────────────────────────────────────────────────────────────────── */
function useRailTooltip() {
  const [tip, setTip] = useState(null)
  const timers = useRef({ press: 0, hide: 0 })
  const longPressed = useRef(false)
  const touching = useRef(false)

  const hide = useCallback(() => {
    clearTimeout(timers.current.press)
    clearTimeout(timers.current.hide)
    setTip(null)
  }, [])

  const show = useCallback((el, label) => {
    if (!matches(MQ_RAIL)) return false // en mobile/desktop la etiqueta ya es visible
    const r = el.getBoundingClientRect()
    setTip({ label, top: r.top + r.height / 2, left: r.right + 8 })
    return true
  }, [])

  useEffect(() => {
    const t = timers.current
    return () => { clearTimeout(t.press); clearTimeout(t.hide) }
  }, [])

  /** Props de interacción para un ítem del rail. */
  const bind = useCallback((label) => ({
    onPointerEnter: (e) => { if (e.pointerType === 'mouse') show(e.currentTarget, label) },
    onPointerLeave: (e) => { if (e.pointerType === 'mouse') hide() },
    onFocus: (e) => {
      // Solo foco de teclado; el foco por toque/click no debe dejar el tooltip pegado.
      if (e.currentTarget.matches(':focus-visible')) show(e.currentTarget, label)
    },
    onBlur: hide,
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse') { touching.current = false; return }
      touching.current = true
      longPressed.current = false
      const el = e.currentTarget
      clearTimeout(timers.current.press)
      timers.current.press = setTimeout(() => {
        if (show(el, label)) {
          longPressed.current = true
          timers.current.hide = setTimeout(hide, TIP_VISIBLE_MS)
        }
      }, LONG_PRESS_MS)
    },
    onPointerUp: () => clearTimeout(timers.current.press),
    onPointerCancel: () => clearTimeout(timers.current.press),
    // Una pulsación larga muestra la etiqueta: NO debe además navegar.
    onClick: (e) => {
      if (longPressed.current) { e.preventDefault(); longPressed.current = false } else hide()
    },
    // Evita el menú contextual del navegador en la pulsación larga táctil.
    onContextMenu: (e) => { if (touching.current) e.preventDefault() },
  }), [show, hide])

  return { tip, bind, hide }
}

/* ──────────────────────────────────────────────────────────────────────────
   Lista de navegación (compartida por sidebar/rail y drawer)
   ────────────────────────────────────────────────────────────────────────── */
function NavList({ variant, onLogout, tooltip }) {
  const compact = variant === 'sidebar'

  // En sidebar: texto oculto visualmente en rail, visible en desktop.
  const labelCls = compact ? 'sr-only min-[1025px]:not-sr-only flex-1' : 'flex-1'
  const itemLayout = compact
    ? 'justify-center px-0 min-[1025px]:justify-start min-[1025px]:px-3'
    : 'px-3'
  const iconCls = compact ? 'w-5 h-5 min-[1025px]:w-4 min-[1025px]:h-4' : ''

  return (
    <>
      {/* Nav principal */}
      <nav
        aria-label={compact ? 'Navegación principal' : 'Menú de navegación'}
        onScroll={compact ? tooltip.hide : undefined}
        className={`flex-1 overflow-y-auto py-4 space-y-0.5
                    ${compact ? 'px-2 min-[1025px]:px-3' : 'px-3'}`}
      >
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            {...(compact ? tooltip.bind(label) : {})}
            className={({ isActive }) => `
              relative flex items-center gap-3 min-h-[44px] rounded-xl text-sm font-body font-medium
              transition-all duration-150 group select-none
              [-webkit-touch-callout:none]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
              ${itemLayout}
              ${isActive
                ? 'bg-brand-500/10 text-brand-500'
                : 'text-surface-200 hover:bg-surface-700 hover:text-white'
              }
            `}
          >
            {({ isActive }) => (
              <>
                {/* Marca lateral de sección activa: solo en rail (en desktop el fondo ya lo indica). */}
                {compact && isActive && (
                  <span aria-hidden="true"
                    className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-500 min-[1025px]:hidden" />
                )}
                <Icon
                  size={16}
                  className={`flex-shrink-0 transition-colors ${iconCls} ${
                    isActive ? 'text-brand-500' : 'text-surface-300 group-hover:text-brand-400'
                  }`}
                />
                <span className={labelCls}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Cerrar sesión */}
      <div className={`py-4 border-t border-surface-700 ${compact ? 'px-2 min-[1025px]:px-3' : 'px-3'}`}>
        <LogoutButton compact={compact} onLogout={onLogout} tooltip={tooltip} />
      </div>
    </>
  )
}

function LogoutButton({ compact, onLogout, tooltip }) {
  const tp = compact ? tooltip.bind('Cerrar sesión') : null
  return (
    <button
      type="button"
      {...(tp || {})}
      onClick={(e) => {
        tp?.onClick(e)
        if (!e.defaultPrevented) onLogout()
      }}
      className={`w-full flex items-center gap-3 min-h-[44px] rounded-xl text-sm
                  font-body font-medium text-surface-400
                  hover:bg-red-500/10 hover:text-red-400
                  transition-all duration-150 group select-none
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500
                  ${compact ? 'justify-center px-0 min-[1025px]:justify-start min-[1025px]:px-3' : 'px-3'}`}
    >
      <LogOut
        size={16}
        className={`flex-shrink-0 text-surface-500 group-hover:text-red-400 transition-colors
                    ${compact ? 'w-5 h-5 min-[1025px]:w-4 min-[1025px]:h-4' : ''}`}
      />
      <span className={compact ? 'sr-only min-[1025px]:not-sr-only' : ''}>Cerrar sesión</span>
    </button>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Shell
   ────────────────────────────────────────────────────────────────────────── */
export default function AppShell({ children }) {
  const { logout }      = useAuth()
  const navigate        = useNavigate()
  const location        = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef(null)
  const closeBtnRef = useRef(null)
  const drawerRef = useRef(null)
  const tooltip = useRailTooltip()
  const { hide: hideTooltip } = tooltip

  // Escenario 4: cerrar el menú (y el tooltip) al cambiar de ruta.
  useEffect(() => {
    setMenuOpen(false)
    hideTooltip()
  }, [location.pathname, hideTooltip])

  // Bloquear scroll del body mientras el drawer está abierto (restaura el valor previo,
  // para no pisar a ResponsiveDialog / FullScreenSheet).
  useEffect(() => {
    if (!menuOpen) return undefined
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previo }
  }, [menuOpen])

  // Foco: entra al drawer al abrir · Escape cierra · al cerrar vuelve a la hamburguesa.
  useEffect(() => {
    if (!menuOpen) return undefined
    closeBtnRef.current?.focus({ preventScroll: true })

    function onKeyDown(e) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const activo = document.activeElement
      if (!activo || activo === document.body || drawerRef.current?.contains(activo)) {
        menuBtnRef.current?.focus({ preventScroll: true })
      }
    }
  }, [menuOpen])

  // Rotar / redimensionar a ≥ 768 px con el drawer abierto: ya no aplica, se cierra
  // (libera el scroll-lock y evita un backdrop huérfano).
  useEffect(() => {
    if (!menuOpen || typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(MQ_TABLET_UP)
    const onChange = (e) => { if (e.matches) setMenuOpen(false) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [menuOpen])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const { tip } = tooltip

  return (
    <div className="flex min-h-screen bg-surface-900">

      {/* ── Sidebar (≥ md): rail de íconos en tablet, completa en desktop ── */}
      <aside className="hidden md:flex fixed top-0 left-0 h-[100dvh] w-16 min-[1025px]:w-56
                        bg-surface-800 border-r border-surface-700 flex-col z-40">
        {/* Logo */}
        <div className="py-5 text-center border-b border-surface-700
                        min-[1025px]:px-6 min-[1025px]:py-6 min-[1025px]:text-left">
          <span aria-hidden="true"
            className="font-display text-3xl tracking-normal text-white leading-none min-[1025px]:hidden">
            P
          </span>
          <span className="sr-only min-[1025px]:not-sr-only min-[1025px]:inline
                           font-display text-3xl tracking-widest text-white leading-none">
            POWDER
          </span>
          <p className="hidden min-[1025px]:block text-brand-500 text-[10px] font-mono tracking-[0.25em] uppercase mt-0.5">
            Sistema de gestión
          </p>
        </div>

        <NavList variant="sidebar" onLogout={handleLogout} tooltip={tooltip} />
      </aside>

      {/* Tooltip del rail (fixed: no lo recorta el overflow del <nav>) */}
      {tip && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[60] -translate-y-1/2 whitespace-nowrap rounded-lg
                     border border-surface-600 bg-surface-700 px-2.5 py-1.5 text-xs font-body
                     font-medium text-white shadow-xl animate-fade-in"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.label}
        </div>
      )}

      {/* ── Topbar mobile (< md) ────────────────────────────────── */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-surface-800 border-b border-surface-700 flex items-center justify-between px-4 z-50">
        <span className="font-display text-2xl tracking-widest text-white leading-none">
          POWDER
        </span>
        <button
          ref={menuBtnRef}
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-surface-200 hover:text-white hover:bg-surface-700 transition-all
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* ── Drawer mobile ───────────────────────────────────────── */}
      {/* Backdrop (Escenario 3: tocar fuera cierra) */}
      <div
        data-testid="nav-backdrop"
        aria-hidden="true"
        className={`md:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-300
                    ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Panel. `inert` cuando está cerrado: sus enlaces no reciben foco ni se leen. */}
      <div
        id="mobile-nav"
        ref={drawerRef}
        inert={menuOpen ? undefined : ''}
        className={`md:hidden fixed top-0 left-0 h-[100dvh] w-64 max-w-[85vw] bg-surface-800 border-r border-surface-700
                    flex flex-col z-50 transition-transform duration-300 ease-in-out
                    motion-reduce:transition-none
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
            ref={closeBtnRef}
            type="button"
            onClick={() => setMenuOpen(false)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-surface-200 hover:text-white hover:bg-surface-700 transition-all
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>
        </div>

        <NavList variant="drawer" onLogout={handleLogout} tooltip={tooltip} />
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      {/* `inert` mientras el drawer está abierto: el foco y el lector de pantalla no escapan al fondo. */}
      <main
        inert={menuOpen ? '' : undefined}
        className="flex-1 min-w-0 md:ml-16 min-[1025px]:ml-56 min-h-screen"
      >
        {/* `min-w-0` (arriba): un hijo flex tiene min-width:auto y una tabla ancha estiraba toda la página. */}
        {/* Spacer para el topbar solo en mobile */}
        <div className="md:hidden h-14" />
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>

    </div>
  )
}
