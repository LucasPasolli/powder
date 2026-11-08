// src/lib/DbContext.jsx
// Verifica que Supabase sea alcanzable antes de renderizar la app.
// Seguridad: corre ANTES del login; el detalle técnico del error solo se
// muestra en desarrollo (en producción queda únicamente un código en consola).

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const DbContext = createContext(null)

export function DbProvider({ children }) {
  const [dbReady, setDbReady] = useState(false)
  const [dbError, setDbError] = useState(null)

  useEffect(() => {
    supabase
      .from('cliente')
      .select('id_cliente', { count: 'exact', head: true })
      .then(({ error }) => {
        if (error) {
          console.error('[DbContext] Error de conexión con Supabase:', error.code ?? 'sin_codigo')
          setDbError(error.message)
        } else {
          setDbReady(true)
        }
      })
  }, [])

  if (dbError) {
    return (
      <div role="alert" style={{ padding: 32, color: 'red' }}>
        <h2>No se pudo conectar con el servidor</h2>
        <p style={{ marginTop: 8 }}>Intentá recargar la página en unos minutos.</p>
        {import.meta.env.DEV && (
          <>
            <pre>{dbError}</pre>
            <p style={{ marginTop: 16, color: '#555', fontSize: 14 }}>
              Verificá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local
            </p>
          </>
        )}
      </div>
    )
  }

  if (!dbReady) {
    return <div style={{ padding: 32 }} role="status">Conectando…</div>
  }

  return <DbContext.Provider value={{ dbReady }}>{children}</DbContext.Provider>
}

export function useDb() {
  return useContext(DbContext)
}
