// src/pages/Login.jsx
import { useState, useRef, useEffect } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, User, AlertCircle } from 'lucide-react'
import { useAuth } from '../lib/AuthContext'
import { resolveSafeRedirect } from '../lib/safeRedirect'
import { loginGuard, LOGIN_GUARD_KEY } from '../lib/loginThrottle'

// Límites defensivos de payload (no afectan a usuarios legítimos).
const MAX_USERNAME_LENGTH = 150
const MAX_PASSWORD_LENGTH = 128

// Mensajes cerrados por código: nunca se renderiza texto que venga del
// backend ni err.message (evita fuga de información). React escapa el
// texto; no se usa dangerouslySetInnerHTML.
const MESSAGES = {
  invalid_credentials: 'Credenciales inválidas',
  rate_limited:        'Demasiados intentos. Esperá unos minutos antes de reintentar.',
  network:             'No se pudo conectar. Intentá nuevamente en unos segundos.',
  required:            'Usuario y contraseña son obligatorios',
}

function formatRemaining(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const s = String(totalSeconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

export default function Login() {
  const { login, authed, loading: authLoading } = useAuth()
  const navigate       = useNavigate()
  const [searchParams] = useSearchParams()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [shaking,  setShaking]  = useState(false)

  const [lockedUntil, setLockedUntil] = useState(() => loginGuard.getLockedUntil())
  const [now,         setNow]         = useState(() => Date.now())

  // Guard síncrono: `loading` (state) se actualiza de forma asíncrona y dos
  // envíos en el mismo tick podrían pasar ambos. El ref cierra esa ventana.
  const inFlightRef = useRef(false)
  const mountedRef  = useRef(true)
  const shakeTimer  = useRef(null)

  // Destino post-login validado contra allowlist (anti open-redirect).
  const target = resolveSafeRedirect(searchParams.get('redirect'))

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearTimeout(shakeTimer.current)
    }
  }, [])

  // Cuenta regresiva con timestamp absoluto (no deriva ni se reinicia con F5).
  useEffect(() => {
    if (!lockedUntil) return undefined
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (t >= lockedUntil) setLockedUntil(0)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  // Sincroniza el bloqueo entre pestañas.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === LOGIN_GUARD_KEY || e.key === null) setLockedUntil(loginGuard.getLockedUntil())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const remaining  = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0
  const isLocked   = remaining > 0
  const isDisabled = loading || isLocked

  function fail(code) {
    setError(MESSAGES[code] ?? MESSAGES.invalid_credentials)
    setShaking(true)
    clearTimeout(shakeTimer.current)
    shakeTimer.current = setTimeout(() => setShaking(false), 500)
    setPassword('')
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (inFlightRef.current) return
    // Re-lee el estado persistido (pudo bloquearse desde otra pestaña).
    const persisted = loginGuard.getLockedUntil()
    if (persisted > Date.now()) { setLockedUntil(persisted); return }

    const cleanUsername = username.trim()
    if (!cleanUsername || !password) {
      setError(MESSAGES.required)
      return
    }

    inFlightRef.current = true
    setError('')
    setLoading(true)

    try {
      const result = await login(cleanUsername, password)
      if (!mountedRef.current) return

      if (result.ok) {
        loginGuard.recordSuccess()
        navigate(target, { replace: true })
        return
      }

      if (result.code === 'rate_limited') {
        setLockedUntil(loginGuard.lock())
      } else if (result.code !== 'network') {
        // Falla de infraestructura (network) no es un intento de adivinar → no cuenta.
        const until = loginGuard.recordFailure()
        if (until) setLockedUntil(until)
      }
      fail(result.code)
    } catch {
      // Nunca se muestra err.message crudo (puede filtrar infraestructura).
      if (mountedRef.current) fail('network')
    } finally {
      inFlightRef.current = false
      if (mountedRef.current) setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center" role="status" aria-label="Cargando">
        <span className="w-6 h-6 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" aria-hidden="true" />
      </div>
    )
  }

  // Usuario ya autenticado en /login → fuera.
  if (authed) return <Navigate to={target} replace />

  return (
    <div className="min-h-screen bg-surface-900 bg-grid-pattern bg-grid flex items-center justify-center p-4">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
        <div className="w-96 h-96 bg-brand-500/10 rounded-full blur-3xl" />
      </div>

      <main className="relative w-full max-w-sm animate-slide-up">
        <div className="text-center mb-10">
          <h1 className="font-display text-5xl text-white tracking-widest">POWDER</h1>
          <p className="text-surface-400 text-sm mt-1 font-body">Sistema de Gestión y Presupuestos</p>
        </div>

        <div className={`bg-surface-800 border border-surface-700 rounded-2xl p-8 shadow-2xl ${shaking ? 'animate-shake' : ''}`}>
          <div className="flex items-center gap-2 mb-6">
            <Lock size={16} className="text-brand-500" aria-hidden="true" />
            <span className="text-surface-300 text-sm font-body tracking-wider uppercase">Acceso</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-username" className="block text-surface-300 text-xs mb-2 tracking-widest uppercase font-body">
                Usuario
              </label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" aria-hidden="true" />
                <input
                  id="login-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setError('') }}
                  placeholder="Nombre de usuario"
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={MAX_USERNAME_LENGTH}
                  disabled={isDisabled}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'login-error' : undefined}
                  className="w-full bg-surface-700 border border-surface-600 rounded-xl pl-10 pr-4 py-3
                             text-white font-mono placeholder-surface-500
                             focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
                             disabled:opacity-50 transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-surface-300 text-xs mb-2 tracking-widest uppercase font-body">
                Contraseña
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none" aria-hidden="true" />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                  disabled={isDisabled}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'login-error' : undefined}
                  className="w-full bg-surface-700 border border-surface-600 rounded-xl pl-10 pr-4 py-3
                             text-white font-mono placeholder-surface-500
                             focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
                             disabled:opacity-50 transition-all"
                />
              </div>
            </div>

            {error && (
              <div
                id="login-error"
                role="alert"
                className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
              >
                <AlertCircle size={14} className="flex-shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {isLocked && (
              <div
                role="status"
                className="flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2"
              >
                <AlertCircle size={14} className="flex-shrink-0" aria-hidden="true" />
                {/* Texto estático anunciado una vez; el contador visual no se anuncia cada segundo. */}
                <span>
                  Formulario bloqueado temporalmente. Reintentá en{' '}
                  <span aria-hidden="true" className="font-mono">{formatRemaining(remaining)}</span>
                  <span className="sr-only">unos minutos</span>.
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={isDisabled}
              aria-busy={loading}
              className="w-full bg-brand-500 hover:bg-brand-400 active:bg-brand-600
                         disabled:opacity-60 disabled:cursor-not-allowed
                         text-white font-body font-semibold py-3 rounded-xl transition-all tracking-wide
                         flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />
                  <span>Verificando...</span>
                </>
              ) : isLocked ? (
                `Bloqueado ${formatRemaining(remaining)}`
              ) : (
                'Ingresar'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
