// src/lib/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from './supabase'

// Dominio ficticio interno — el usuario nunca lo ve
const INTERNAL_DOMAIN = 'presupuestador.internal'

// Allowlist estricta del username visible (evita emails malformados).
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/

function toInternalEmail(username) {
  const clean = username.trim().toLowerCase()
  if (!USERNAME_PATTERN.test(clean)) return null
  return `${clean}@${INTERNAL_DOMAIN}`
}

/**
 * Clasifica el error de Supabase Auth SIN revelar si el usuario existe.
 * supabase-js NO lanza ante fallos de red: los devuelve en `error`
 * (AuthRetryableFetchError, status 0 / 5xx). Antes se confundían con
 * "credenciales incorrectas".
 * @returns {'rate_limited'|'network'|'invalid_credentials'}
 */
function classifyAuthError(error) {
  if (error.status === 429 || error.code === 'over_request_rate_limit') return 'rate_limited'
  if (error.name === 'AuthRetryableFetchError' || error.status === 0 || error.status >= 500) return 'network'
  // Cualquier otro 4xx (invalid_credentials, user_not_found, email_not_confirmed,
  // user_banned…) se unifica: mismo mensaje para todos.
  return 'invalid_credentials'
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // null → cargando · false → sin sesión · obj → autenticado
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // Callback de limpieza de tokens especiales (evita dependencia circular).
  const onLogoutCallbackRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? false)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? false)
        if (!session && onLogoutCallbackRef.current) onLogoutCallbackRef.current()
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  const registerLogoutCallback = useCallback((callback) => {
    onLogoutCallbackRef.current = callback
  }, [])

  /**
   * @returns {Promise<{ok:true}|{ok:false, code:'invalid_credentials'|'rate_limited'|'network'}>}
   */
  const login = useCallback(async (username, password) => {
    const email = username && password ? toInternalEmail(username) : null

    // Formato inválido → misma respuesta que credenciales incorrectas, sin tocar la red.
    if (!email) return { ok: false, code: 'invalid_credentials' }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { ok: false, code: classifyAuthError(error) }
      return { ok: true }
    } catch {
      return { ok: false, code: 'network' }
    }
  }, [])

  /**
   * Invalida la sesión en TODOS los dispositivos (scope global). Si el
   * servidor no responde, igual elimina la sesión persistida localmente
   * (scope local no usa red). Antes solo se hacía setUser(false) y un F5
   * "resucitaba" la sesión desde localStorage.
   */
  const logout = useCallback(async () => {
    onLogoutCallbackRef.current?.()
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' })
      if (error) throw error
    } catch (err) {
      console.error('[AuthContext] signOut remoto falló:', err?.name ?? 'error')
      try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* sin más recursos */ }
      setUser(false)
    }
  }, [])

  const authed = !!user

  const value = useMemo(
    () => ({ authed, loading, user, login, logout, registerLogoutCallback }),
    [authed, loading, user, login, logout, registerLogoutCallback]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
