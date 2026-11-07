// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth }        from './lib/AuthContext'
import { buildLoginUrl }  from './lib/safeRedirect'
import AppShell           from './components/layout/AppShell'
import SpecialAuthGate    from './components/auth/SpecialAuthGate'
import Login              from './pages/Login'
import Dashboard          from './pages/Dashboard'
import Presupuestador     from './pages/Presupuestador'
import Inventario         from './pages/Inventario'
import Historial          from './pages/Historial'
import PedidosCompra      from './pages/PedidosCompra'
import Saldos             from './pages/Saldos'
import Promociones        from './pages/Promociones'
import AdminRoutes        from './pages/admin/AdminRoutes'
import { REDIRECCIONES_LEGADAS } from './pages/admin/rutasLegadas'

/**
 * Spinner de carga — se muestra mientras AuthContext resuelve
 * la sesión inicial (getSession). Evita el flash de /login
 * en usuarios ya autenticados, y evita el bypass de rutas
 * protegidas antes de que loading termine.
 */
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center">
      <span className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
    </div>
  )
}

/**
 * CAPA 1: Protege rutas contra usuarios no autenticados.
 *
 * CRÍTICO: espera a que loading sea false antes de tomar cualquier
 * decisión. Sin esto, user=null (estado inicial) se interpreta como
 * "no autenticado" y redirige a /login antes de que getSession termine,
 * permitiendo el bypass inverso (acceso sin login) si la sesión
 * se resuelve tarde.
 */
function RequireAuth({ children }) {
  const { authed, loading } = useAuth()
  const location = useLocation()

  // Mientras resolvemos la sesión: no redirigir, no renderizar
  if (loading) return <LoadingScreen />

  // Sesión resuelta y no autenticado: ir a login
  // Conserva el destino original; Login lo valida contra una allowlist.
  if (!authed) return <Navigate to={buildLoginUrl(location.pathname)} replace />

  // Autenticado: renderizar dentro del shell
  return <AppShell>{children}</AppShell>
}

/**
 * CAPA 2: Protege rutas que requieren segunda capa de autorización.
 * Se apila dentro de RequireAuth (el usuario ya pasó la capa 1).
 */
function RequireSpecialAuth({ pageKey, label, children }) {
  return (
    <SpecialAuthGate pageKey={pageKey} label={label}>
      {children}
    </SpecialAuthGate>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"          element={<Login />} />
        <Route path="/"               element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/presupuestador" element={<RequireAuth><Presupuestador /></RequireAuth>} />
        <Route path="/historial"      element={<RequireAuth><Historial /></RequireAuth>} />
        <Route path="/inventario"     element={<RequireAuth><Inventario /></RequireAuth>} />
        <Route path="/pedidos"        element={<RequireAuth><PedidosCompra /></RequireAuth>} />
        <Route path="/saldos"         element={<RequireAuth><Saldos /></RequireAuth>} />
        <Route path="/promociones"    element={<RequireAuth><Promociones /></RequireAuth>} />

        {/* ── Panel Administrativo (Facturas, Estadísticas y ex-ABMC) ──────────
            Cada sección conserva su segunda capa (SpecialAuthGate) a nivel de ruta. */}
        <Route
          path="/admin/*"
          element={<RequireAuth><AdminRoutes Guard={RequireSpecialAuth} /></RequireAuth>}
        />

        {/* Marcadores viejos → nuevas rutas (el destino sigue pidiendo login y contraseña). */}
        {REDIRECCIONES_LEGADAS.map(([desde, hacia]) => (
          <Route key={desde} path={desde} element={<Navigate to={hacia} replace />} />
        ))}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
