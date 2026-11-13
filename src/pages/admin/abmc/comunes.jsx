// src/pages/admin/abmc/comunes.jsx
// Piezas compartidas por las pantallas de gestión (ex ABMC). Extraídas SIN cambios de lógica.
import { useState, useEffect } from 'react'
import { Button, Modal } from '../../../components/ui'
import { ALTO_CONTROL } from '../../../components/ui/controles'
import FiltrosMovil, { BuscadorListado, mensajeRangoInvalido } from '../../../components/ui/FiltrosMovil'
import { AlertTriangle, Info } from 'lucide-react'

// ─── Filtros mobile/tablet (patrón único) ─────────────────────────────────────

/** Opciones de un select de filtro: «Todos/Todas» (valor '') + la lista (strings u objetos {value,label}). */
export const opcionesTodas = (lista, etiquetaTodas = 'Todos') => [
  { value: '', label: etiquetaTodas },
  ...lista.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
]

/**
 * Barra de filtros móvil de las pantallas de gestión: buscador + botón «Filtros» y panel con
 * Desde / Hasta + los selects indicados. Debajo van las acciones de la pantalla (Nuevo…).
 * Todos los valores por defecto son '' («Todos», fechas vacías).
 *
 * @param {object} props
 * @param {string} props.search
 * @param {(texto: string) => void} props.onSearch
 * @param {string} props.placeholder
 * @param {Record<string, string>} props.valores  Valores APLICADOS: { desde, hasta, ...claves de selects }.
 * @param {(borrador: Record<string, string>) => void} props.onApply
 * @param {{clave: string, etiqueta: string, opciones: {value: string, label: string}[]}[]} [props.selects]
 * @param {React.ReactNode} [props.acciones]
 */
export function FiltrosGestionMovil({ search, onSearch, placeholder, valores, onApply, selects = [], acciones }) {
  const campos = [
    { tipo: 'fecha', clave: 'desde', etiqueta: 'Desde', max: (b) => b.hasta || undefined },
    { tipo: 'fecha', clave: 'hasta', etiqueta: 'Hasta', min: (b) => b.desde || undefined },
    ...selects.map((s) => ({ tipo: 'select', ...s })),
  ]
  const defaults = Object.fromEntries(Object.keys(valores).map((k) => [k, '']))
  return (
    <div className="space-y-2">
      <FiltrosMovil
        busqueda={<BuscadorListado value={search} onChange={onSearch} placeholder={placeholder} />}
        value={valores}
        defaults={defaults}
        campos={campos}
        validar={(b) => mensajeRangoInvalido(b.desde, b.hasta)}
        onApply={onApply}
      />
      {acciones && <div className="flex flex-col gap-2">{acciones}</div>}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const PAGE_SIZE = 20

export const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 })
    : '—'

// Fechas de la BD (AAAA-MM-DD, tipo date) → DD-MM-AAAA para mostrar en pantalla.
// Se reordena el texto SIN pasar por `new Date()`: evita que la zona horaria
// corra la fecha un día. Los filtros y comparaciones siguen usando el valor ISO original.
export const formatearFecha = (iso) => {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso)
}

export const cap = (s) => s ? s.trim().charAt(0).toUpperCase() + s.trim().slice(1) : ''

// Normaliza texto para búsquedas: minúsculas + sin tildes/diacríticos.
// NFD descompone caracteres acentuados en base + marca diacrítica combinante
// (p.ej. "é" → "e" + ´), y como la "ñ" se descompone en "n" + combining tilde
// (U+0303), este mismo mecanismo también resuelve "ñ" ≈ "n" en la búsqueda
// (ver Escenario 4 de la US). Solo afecta la comparación: los datos originales
// (con sus tildes/ñ) se muestran sin modificar en la tabla de resultados.
export const normalizarTexto = (s) =>
  (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

// ─── Pagination component ─────────────────────────────────────────────────────

export function Pagination({ page, total, pageSize, onChange, onNavigate }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  // goTo: cambia de página Y reposiciona el scroll en el MISMO evento de
  // clic (nunca vía useEffect), para que el reposicionamiento sea siempre
  // consecuencia directa de la acción del usuario.
  const goTo = (p) => {
    onChange(p)
    onNavigate?.()
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-6 py-3 border-t border-surface-700">
      <p className="text-surface-400 text-xs font-body tabular-nums text-center sm:text-left">
        {from}–{to} de {total}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1 sm:flex-none min-h-[44px] min-[1025px]:min-h-0 justify-center" onClick={() => goTo(Math.max(1, page - 1))} disabled={page === 1}>← Anterior</Button>
        <Button size="sm" variant="secondary" className="flex-1 sm:flex-none min-h-[44px] min-[1025px]:min-h-0 justify-center" onClick={() => goTo(Math.min(totalPages, page + 1))} disabled={page === totalPages}>Siguiente →</Button>
      </div>
    </div>
  )
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

export function ConfirmModal({
  open, onClose, onConfirm, details, message,
  loading = false, confirmLabel = 'Eliminar', error = '', warning = '',
  // Personalización (por defecto: diálogo de eliminación, sin cambios para los usos existentes).
  // confirmVariant = null usa la variante por defecto de Button.
  title = 'Confirmar eliminación', loadingLabel = 'Eliminando…',
  confirmVariant = 'danger', Icon = AlertTriangle, iconClassName = 'text-red-400',
  // Confirmación explícita: si `requireAck` es true, el botón de confirmar
  // queda deshabilitado hasta tildar la casilla (acciones que revierten
  // estados financieros).
  requireAck = false,
  ackLabel = 'Entiendo las consecuencias y quiero continuar',
}) {
  const [ack, setAck] = useState(false)
  useEffect(() => { if (!open) setAck(false) }, [open])
  const bloqueado = loading || (requireAck && !ack)

  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title={title} width="max-w-sm" busy={loading}>
      <div className="flex flex-col items-center gap-4 text-center">
        <Icon size={36} className={iconClassName} aria-hidden="true" />
        {details && details.length > 0 && (
          <div className="w-full bg-surface-700 rounded-xl p-3 text-left space-y-1">
            {details.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 text-xs">
                <span className="text-surface-400">{label}</span>
                <span className="text-surface-200 font-mono truncate max-w-[160px]">{value}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-surface-200 font-body text-sm">{message || '¿Eliminar este registro?'}</p>
        {/* Advertencia explícita para acciones destructivas con efectos
            colaterales (p. ej. reintegro de stock / impacto en cuenta
            corriente). Deliberadamente separada del mensaje principal para
            que no pase desapercibida entre el resto del texto. */}
        {warning && (
          <div role="alert" className="w-full flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-left">
            <AlertTriangle size={14} className="text-yellow-400 mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-yellow-200 text-xs font-body leading-relaxed">{warning}</p>
          </div>
        )}
        {requireAck && (
          <label className="w-full flex items-start gap-2 text-left cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ack}
              onChange={e => setAck(e.target.checked)}
              disabled={loading}
              className="mt-0.5 h-4 w-4 shrink-0 accent-red-500 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <span className="text-surface-200 text-xs font-body leading-relaxed">{ackLabel}</span>
          </label>
        )}
        {error && <p role="alert" className="text-red-400 text-xs font-body">{error}</p>}
        <div className="flex gap-3 w-full">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button variant={confirmVariant ?? undefined} className="flex-1" onClick={onConfirm} disabled={bloqueado}>
            {loading ? loadingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── InfoBanner ───────────────────────────────────────────────────────────────

export function InfoBanner({ message, onClose }) {
  return (
    <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
      <Info size={16} className="text-yellow-400 mt-0.5 shrink-0" />
      <p className="text-yellow-200 text-xs font-body leading-relaxed flex-1">{message}</p>
      {onClose && (
        <button onClick={onClose} className="text-yellow-400/70 hover:text-yellow-200 text-xs shrink-0" aria-label="Cerrar aviso">✕</button>
      )}
    </div>
  )
}

// ─── Shared dropdown style ────────────────────────────────────────────────────

// Misma altura (ALTO_CONTROL), tipografía (16 px mobile / 14 px desde sm), borde, radio
// y colores que el buscador y DateField: los tres filtros se ven como una familia.
export const dropdownClass = `w-full ${ALTO_CONTROL} bg-surface-700 border border-surface-600 rounded-xl pl-3 pr-6 text-base sm:text-sm text-white focus:outline-none focus:border-brand-500`

// Buscador de las pantallas de gestión: misma altura (≥ 44 px en layout táctil), tipografía,
// borde y radio que dropdownClass y DateField. Fuente única para las 6 pantallas.
export const buscadorClass = `w-full ${ALTO_CONTROL} bg-surface-700 border border-surface-600 rounded-xl px-3 text-base sm:text-sm text-white placeholder-surface-500 focus:outline-none focus:border-brand-500`
