// src/lib/safeRedirect.js
// Prevención de open redirect (OWASP A01 / CWE-601).
// Solo se aceptan rutas INTERNAS que estén en la lista permitida.
// MANTENER SINCRONIZADO con las <Route> de App.jsx.

export const DEFAULT_REDIRECT = '/'

const ALLOWED_EXACT = new Set([
  '/',
  '/presupuestador',
  '/historial',
  '/inventario',
  '/pedidos',
  '/saldos',
  '/promociones',
])
const ALLOWED_PREFIXES = ['/admin'] // /admin y /admin/**

const MAX_LENGTH = 200
const PROBE_ORIGIN = 'http://redirect-probe.invalid'

/**
 * Devuelve una ruta interna segura (solo pathname, sin query ni hash)
 * o DEFAULT_REDIRECT si el valor no es aceptable.
 * @param {unknown} raw
 * @returns {string}
 */
export function resolveSafeRedirect(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) {
    return DEFAULT_REDIRECT
  }
  // Debe ser ruta absoluta interna; "//host" es protocol-relative → externo.
  if (!raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_REDIRECT
  // Backslashes (algunos navegadores los tratan como "/") y caracteres de control.
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001F\u007F]/.test(raw)) return DEFAULT_REDIRECT

  let url
  try {
    url = new URL(raw, PROBE_ORIGIN)
  } catch {
    return DEFAULT_REDIRECT
  }
  if (url.origin !== PROBE_ORIGIN) return DEFAULT_REDIRECT

  const path = url.pathname.replace(/\/+$/, '') || '/'
  const allowed =
    ALLOWED_EXACT.has(path) ||
    ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))

  return allowed ? path : DEFAULT_REDIRECT
}

/** Construye /login?redirect=... solo si el destino es válido y distinto de "/". */
export function buildLoginUrl(pathname) {
  const safe = resolveSafeRedirect(pathname)
  return safe === DEFAULT_REDIRECT ? '/login' : `/login?redirect=${encodeURIComponent(safe)}`
}
