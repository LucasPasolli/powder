// src/components/auth/SpecialAuthGate.jsx
//
// Componente de guard para páginas que requieren segunda capa de autorización.
//
// Uso en App.jsx:
//   <SpecialAuthGate pageKey="estadisticas" label="Estadísticas">
//     <Estadisticas />
//   </SpecialAuthGate>
//
// Comportamiento:
//   1. Al montar: llama checkAccess() contra el servidor
//   2. Si tiene acceso válido: renderiza children
//   3. Si no tiene acceso: muestra modal de contraseña
//   4. Si la contraseña es correcta: renderiza children
//   5. Si es incorrecta: muestra error, permite reintentar
//   6. El botón "Volver" navega a la página anterior sin conceder acceso
//
// Pantalla fija (sin scroll) mientras NO hay acceso concedido:
//   • El gate se queda DENTRO del AppShell (sidebar, rail y topbar visibles). `useFillViewport`
//     le da como alto "desde su posición hasta el borde inferior del viewport, menos el padding
//     del contenedor": el documento mide exactamente el viewport y queda centrado en el área de
//     contenido (antes `min-h-screen` + topbar + padding del <main> superaba 100vh y generaba
//     scrollbar).
//   • `useScrollLock` bloquea el viewport (<html>; no toca <body>, que usan el drawer y los
//     diálogos) contra rueda, trackpad, teclado y gestos. Se libera en GRANTED o al desmontar,
//     por lo que el resto de módulos no se ve afectado.
//   • En alturas reducidas (móvil apaisado, teclado virtual) el contenido se compacta para
//     seguir 100 % visible y utilizable sin scroll.

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Eye, EyeOff, ShieldAlert, Loader2 } from 'lucide-react'
import { useSpecialAuth } from '../../lib/SpecialAuthContext'
import { useScrollLock, useFillViewport } from '../../lib/useScrollLock'

// ---------------------------------------------------------------------------
// Estados internos del gate
// ---------------------------------------------------------------------------
const STATE = {
  CHECKING:  'checking',   // verificando token existente contra servidor
  LOCKED:    'locked',     // sin acceso, mostrando formulario
  VERIFYING: 'verifying',  // enviando contraseña al servidor
  GRANTED:   'granted',    // acceso concedido, renderizar children
  ERROR:     'error',      // error de red u otro no relacionado a contraseña
}

// Alto reducido (móvil apaisado / teclado virtual abierto).
const CORTO = '[@media(max-height:600px)]'

// Área de contenido sin desborde. El alto exacto lo fija useFillViewport; `h-[100dvh]` es
// sólo el valor inicial hasta la primera medición (evita saltos de layout).
const SHELL =
  'w-full h-[100dvh] overflow-hidden overscroll-none flex items-center justify-center ' +
  'px-0 py-0'

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   pageKey:  'estadisticas' | 'abmc',
 *   label:    string,
 *   children: React.ReactNode,
 * }} props
 */
export default function SpecialAuthGate({ pageKey, label, children }) {
  const { checkAccess, verifyAccess, revokeAccess } = useSpecialAuth()
  const navigate = useNavigate()

  const [gateState,    setGateState]    = useState(STATE.CHECKING)
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [attempts,     setAttempts]     = useState(0)

  const inputRef = useRef(null)
  const shellRef = useRef(null)

  // Sin scroll y ajustado al alto disponible mientras no haya acceso; se restablece al conceder
  // (Escenario 5) y al desmontar (Escenario 6). El orden importa: primero el bloqueo.
  const sinAcceso = gateState !== STATE.GRANTED
  useScrollLock(sinAcceso, shellRef)
  useFillViewport(shellRef, sinAcceso)

  // -------------------------------------------------------------------------
  // Verificación inicial al montar el componente
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    async function check() {
      const hasValidAccess = await checkAccess(pageKey)
      if (cancelled) return
      setGateState(hasValidAccess ? STATE.GRANTED : STATE.LOCKED)
    }

    check()
    return () => {
      cancelled = true
      revokeAccess(pageKey)
    }
  }, [pageKey, checkAccess, revokeAccess])

  // -------------------------------------------------------------------------
  // Focus en el input cuando el gate está en estado LOCKED
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (gateState === STATE.LOCKED && inputRef.current) {
      // Pequeño delay para que la animación de entrada termine
      const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 150)
      return () => clearTimeout(t)
    }
  }, [gateState])

  // -------------------------------------------------------------------------
  // Submit de contraseña
  // -------------------------------------------------------------------------
  async function handleSubmit(e) {
    e.preventDefault()

    if (!password.trim()) {
      setErrorMessage('Ingresá la contraseña.')
      return
    }

    setGateState(STATE.VERIFYING)
    setErrorMessage('')

    const result = await verifyAccess(pageKey, password)

    if (result.ok) {
      setPassword('')
      setGateState(STATE.GRANTED)
    } else {
      setAttempts(prev => prev + 1)
      setErrorMessage(result.message)
      setPassword('')
      setGateState(STATE.LOCKED)
      // Re-focus para que el usuario pueda reintentar sin hacer click
      setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50)
    }
  }

  // -------------------------------------------------------------------------
  // Renders
  // -------------------------------------------------------------------------

  // Cargando verificación inicial
  if (gateState === STATE.CHECKING) {
    return (
      <div ref={shellRef} className={SHELL}>
        <div className="flex flex-col items-center gap-3 text-surface-400" role="status" aria-live="polite">
          <Loader2 size={24} className="animate-spin text-brand-500" aria-hidden="true" />
          <span className="text-sm font-body">Verificando acceso...</span>
        </div>
      </div>
    )
  }

  // Acceso concedido — renderizar la página protegida (el scroll ya se liberó vía hook)
  if (gateState === STATE.GRANTED) {
    return children
  }

  // ---------------------------------------------------------------------------
  // Modal de contraseña (estados: LOCKED, VERIFYING, ERROR)
  // ---------------------------------------------------------------------------
  const isVerifying = gateState === STATE.VERIFYING

  return (
    <div ref={shellRef} className={SHELL}>
      <div className="w-full max-w-sm max-h-full">

        {/* Tarjeta */}
        <div className={`bg-surface-800 border border-surface-700 rounded-2xl p-8 ${CORTO}:p-5 shadow-2xl`}>

          {/* Ícono y título */}
          <div className={`flex flex-col items-center gap-4 mb-8 ${CORTO}:gap-2 ${CORTO}:mb-4`}>
            <div className={`w-14 h-14 ${CORTO}:w-10 ${CORTO}:h-10 rounded-2xl bg-brand-500/10 border border-brand-500/20
                            flex items-center justify-center`}>
              <Lock size={24} className="text-brand-400" aria-hidden="true" />
            </div>
            <div className="text-center">
              <h1 className="text-white font-display text-xl font-semibold">
                Acceso restringido
              </h1>
              <p className="text-surface-400 text-sm font-body mt-1">
                {label} requiere autorización adicional
              </p>
            </div>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className={`space-y-4 ${CORTO}:space-y-2`} noValidate>

            {/* Input de contraseña */}
            <div className="space-y-1.5">
              <label
                htmlFor="special-password"
                className="block text-sm font-body font-medium text-surface-300"
              >
                Contraseña de acceso
              </label>
              <div className="relative">
                <input
                  ref={inputRef}
                  id="special-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value)
                    if (errorMessage) setErrorMessage('')
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !isVerifying) handleSubmit(e)
                  }}
                  disabled={isVerifying}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="••••••••"
                  className={`
                    w-full bg-surface-900 border rounded-xl px-4 py-2.5 pr-11
                    text-white font-body text-base sm:text-sm
                    placeholder:text-surface-600
                    focus:outline-none focus:ring-2 focus:ring-brand-500/50
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors
                    ${errorMessage
                      ? 'border-red-500/60 focus:border-red-500/60'
                      : 'border-surface-600 focus:border-brand-500/60'
                    }
                  `}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  disabled={isVerifying}
                  className="absolute right-3 top-1/2 -translate-y-1/2
                             text-surface-500 hover:text-surface-300
                             disabled:opacity-50 transition-colors"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword
                    ? <EyeOff size={16} aria-hidden="true" />
                    : <Eye size={16} aria-hidden="true" />
                  }
                </button>
              </div>

              {/* Mensaje de error */}
              {errorMessage && (
                <div role="alert" className="flex items-center gap-2 text-red-400 text-xs font-body pt-0.5">
                  <ShieldAlert size={13} className="flex-shrink-0" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Advertencia después de múltiples intentos fallidos */}
              {attempts >= 3 && !errorMessage && (
                <p className="text-amber-500/80 text-xs font-body pt-0.5">
                  Múltiples intentos fallidos. Verificá que tengas la contraseña correcta.
                </p>
              )}
            </div>

            {/* Botones */}
            <div className={`flex gap-3 pt-2 ${CORTO}:pt-1`}>
              <button
                type="button"
                onClick={() => navigate(-1)}
                disabled={isVerifying}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-body font-medium
                           text-surface-400 bg-surface-700 border border-surface-600
                           hover:bg-surface-600 hover:text-surface-200
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-150"
              >
                Volver
              </button>

              <button
                type="submit"
                disabled={isVerifying || !password.trim()}
                className="flex-2 flex-grow flex items-center justify-center gap-2
                           px-4 py-2.5 rounded-xl text-sm font-body font-medium
                           bg-brand-500 text-white
                           hover:bg-brand-400
                           disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-150"
              >
                {isVerifying ? (
                  <>
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    <span>Verificando...</span>
                  </>
                ) : (
                  'Ingresar'
                )}
              </button>
            </div>

          </form>

        </div>

        {/* Nota de seguridad (se oculta en alturas muy reducidas para no forzar desborde) */}
        <p className={`text-center text-surface-600 text-xs font-body mt-4 ${CORTO}:hidden`}>
          Esta sección requiere autorización independiente del inicio de sesión.
        </p>

      </div>
    </div>
  )
}
