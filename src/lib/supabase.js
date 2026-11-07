// src/lib/supabase.js
// NUNCA importar @supabase/supabase-js directamente desde un componente.
// Todos los accesos a la BD deben pasar por src/services/.
// Cliente Supabase centralizado.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[supabase.js] Faltan variables de entorno.\n' +
    'Asegurate de definir VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local'
  )
}

// La URL de Supabase debe viajar siempre por HTTPS. Un http:// aquí
// (típico de copiar/pegar una URL de un entorno local por error)
// expondría el JWT y la key en texto plano en la red.
if (!supabaseUrl.startsWith('https://')) {
  throw new Error(
    `[supabase.js] VITE_SUPABASE_URL debe usar https://. Valor recibido: "${supabaseUrl}"`
  )
}

const PUBLISHABLE_PREFIX = 'sb_publishable_'
const SECRET_PREFIX = 'sb_secret_'

/**
 * Devuelve el claim "role" de un JWT legacy, o null si no es decodificable.
 * No valida la firma: solo lee el payload. La validación real la hace Supabase.
 */
function readJwtRole(jwt) {
  try {
    const part = jwt.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(atob(padded)).role ?? null
  } catch {
    return null
  }
}

/**
 * Guardrail crítico: impide arrancar el frontend con una key privilegiada.
 *
 * Formatos soportados:
 *  - sb_publishable_…  → key pública del sistema nuevo. OK.
 *  - sb_secret_…       → key privilegiada. BLOQUEA (bypasea RLS).
 *  - JWT legacy        → el claim "role" debe ser "anon"; "service_role" BLOQUEA.
 *
 * Las excepciones se lanzan FUERA de cualquier try/catch para que nunca
 * queden silenciadas.
 */
function assertIsClientSafeKey(key) {
  if (key.startsWith(SECRET_PREFIX)) {
    throw new Error(
      '[supabase.js] VITE_SUPABASE_ANON_KEY contiene una secret key (sb_secret_…). ' +
      'Esa key NUNCA debe usarse en el frontend: bypasea RLS por completo.'
    )
  }

  if (key.startsWith(PUBLISHABLE_PREFIX)) return

  const role = readJwtRole(key)
  if (role === null) {
    console.warn('[supabase.js] Formato de key no reconocido; Supabase la validará en el servidor.')
    return
  }
  if (role !== 'anon') {
    throw new Error(
      `[supabase.js] VITE_SUPABASE_ANON_KEY tiene role="${role}", se esperaba "anon". ` +
      'Es muy probable que hayas pegado la service_role key por error. ' +
      'Esa key NUNCA debe usarse en el frontend: bypasea RLS por completo.'
    )
  }
}

assertIsClientSafeKey(supabaseKey)

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,      // La sesión se guarda en localStorage (sobrevive F5)
    autoRefreshToken: true,    // Supabase renueva el JWT automáticamente antes de que expire
    detectSessionInUrl: false, // No necesitamos magic links ni OAuth callbacks
  },
})
