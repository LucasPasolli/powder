// src/lib/loginThrottle.js
// Freno de fuerza bruta EN CLIENTE (capa de UX / defensa en profundidad).
//
// ⚠️ NO es un control de seguridad autoritativo: quien llame a la API de
// Supabase directamente lo evita. El control real es el rate limit de
// Supabase Auth (ver AUDITORIA_LOGIN.md). Aquí solo se persiste el estado
// para que F5 / otra pestaña no reinicien el bloqueo.
//
// Solo guarda timestamps. NUNCA usuario, contraseña ni tokens.

export const LOGIN_GUARD_KEY     = 'login_guard_v1'
export const MAX_FAILED_ATTEMPTS = 10
export const ATTEMPT_WINDOW_MS   = 5 * 60 * 1000
export const LOCKOUT_MS          = 5 * 60 * 1000

function safeLocalStorage() {
  try { return globalThis.localStorage ?? null } catch { return null }
}

/**
 * @param {{ storage?: Pick<Storage,'getItem'|'setItem'|'removeItem'>|null, now?: () => number }} [deps]
 */
export function createLoginGuard({ storage = safeLocalStorage(), now = Date.now } = {}) {
  let memory = { failures: [], lockedUntil: 0 }

  function normalize(raw, t) {
    const failures = Array.isArray(raw?.failures)
      ? raw.failures.filter((n) => Number.isFinite(n) && n <= t && t - n < ATTEMPT_WINDOW_MS)
      : []
    let lockedUntil = Number.isFinite(raw?.lockedUntil) ? raw.lockedUntil : 0
    if (lockedUntil <= t) lockedUntil = 0
    else if (lockedUntil - t > LOCKOUT_MS) lockedUntil = t + LOCKOUT_MS // valor manipulado
    return { failures: failures.slice(-MAX_FAILED_ATTEMPTS), lockedUntil }
  }

  function load() {
    const t = now()
    try {
      if (storage) {
        const raw = storage.getItem(LOGIN_GUARD_KEY)
        // Storage disponible: es la fuente de verdad (vacío = sin bloqueo).
        return normalize(raw ? JSON.parse(raw) : null, t)
      }
    } catch { /* JSON corrupto o storage bloqueado → memoria */ }
    return normalize(memory, t) // solo si no hay storage utilizable
  }

  function save(state) {
    memory = state
    try { storage?.setItem(LOGIN_GUARD_KEY, JSON.stringify(state)) } catch { /* storage lleno/bloqueado */ }
  }

  return {
    /** @returns {number} epoch ms hasta el que dura el bloqueo, o 0 si no hay. */
    getLockedUntil: () => load().lockedUntil,

    /** Registra un intento fallido. @returns {number} lockedUntil (0 si no bloqueó). */
    recordFailure() {
      const t = now()
      const s = load()
      if (s.lockedUntil) return s.lockedUntil
      s.failures.push(t)
      if (s.failures.length >= MAX_FAILED_ATTEMPTS) {
        s.failures = []
        s.lockedUntil = t + LOCKOUT_MS
      }
      save(s)
      return s.lockedUntil
    },

    /** Bloqueo inmediato (p. ej. el servidor respondió 429). */
    lock() {
      const lockedUntil = now() + LOCKOUT_MS
      save({ failures: [], lockedUntil })
      return lockedUntil
    },

    recordSuccess() {
      save({ failures: [], lockedUntil: 0 })
    },
  }
}

export const loginGuard = createLoginGuard()
