// src/components/facturas/FormularioFacturarPorMonto.jsx
// Formulario de «Facturar por monto»: cliente (buscador), período, monto con IVA y «Generar».
//
// Responsive (mobile-first, mismos umbrales que el resto del proyecto):
//   · mobile (≤ 767 px)     → una columna; Generar a todo el ancho.
//   · tablet (768–1024 px)  → cliente a ancho completo; período y monto en 2 columnas.
//   · desktop (≥ 1025 px)   → una fila: cliente · desde · hasta · monto · Generar.
// Accesibilidad: etiquetas visibles, un mensaje de error por campo (role="alert"),
// foco al primer campo inválido, Enter envía el formulario, controles de 44 px.
import { useEffect, useId, useRef } from 'react'
import { AlertCircle, Sparkles } from 'lucide-react'
import { Button, Card, Input } from '../ui'
import DateField from '../ui/DateField'
import SelectorCliente from '../encargos/SelectorCliente'
import { TOQUE } from './estilos'

const ORDEN_CAMPOS = ['cliente', 'desde', 'hasta', 'monto']

/**
 * @param {object} props
 * @param {{cliente: object|null, desde: string, hasta: string, montoTexto: string}} props.form
 * @param {(campo: 'cliente'|'desde'|'hasta'|'montoTexto', valor: any) => void} props.onCampo
 * @param {Record<string,string>} props.errores
 * @param {boolean} props.cargando
 * @param {() => void} props.onGenerar
 */
export default function FormularioFacturarPorMonto({ form, onCampo, errores, cargando, onGenerar }) {
  const idBase = useId()
  const raiz = useRef(/** @type {HTMLFormElement|null} */ (null))
  const idMonto = `${idBase}-monto`

  // Tras un intento fallido, el foco va al primer campo con error (WCAG 3.3.1 / 3.3.3).
  const ultimoIntento = useRef('')
  useEffect(() => {
    const clave = ORDEN_CAMPOS.filter((c) => errores[c]).join(',')
    if (!clave || clave === ultimoIntento.current) { ultimoIntento.current = clave; return }
    ultimoIntento.current = clave
    const primero = ORDEN_CAMPOS.find((c) => errores[c])
    const el = raiz.current?.querySelector(`[data-campo="${primero}"] input, [data-campo="${primero}"] [role="combobox"]`)
    el?.focus?.()
  }, [errores])

  const alEnviar = (e) => { e.preventDefault(); onGenerar() }

  return (
    <Card className="p-4 sm:p-6">
      <form ref={raiz} noValidate onSubmit={alEnviar} aria-label="Datos para facturar por monto"
        className="grid grid-cols-1 sm:grid-cols-2 min-[1025px]:grid-cols-12 gap-3 sm:gap-4 items-start">

        <div data-campo="cliente" className="min-w-0 sm:col-span-2 min-[1025px]:col-span-4">
          <SelectorCliente value={form.cliente} onChange={(c) => onCampo('cliente', c)}
            error={errores.cliente} disabled={cargando} />
        </div>

        <div data-campo="desde" className="min-w-0 min-[1025px]:col-span-2">
          <DateField label="Desde" etiquetaArriba value={form.desde} clearable={false} disabled={cargando}
            onChange={(v) => onCampo('desde', v)} aria-invalid={errores.desde ? true : undefined}
            aria-describedby={errores.desde ? `${idBase}-desde-e` : undefined} />
          <MensajeCampo id={`${idBase}-desde-e`}>{errores.desde}</MensajeCampo>
        </div>

        <div data-campo="hasta" className="min-w-0 min-[1025px]:col-span-2">
          <DateField label="Hasta" etiquetaArriba value={form.hasta} clearable={false} disabled={cargando}
            onChange={(v) => onCampo('hasta', v)} aria-invalid={errores.hasta ? true : undefined}
            aria-describedby={errores.hasta ? `${idBase}-hasta-e` : undefined} />
          <MensajeCampo id={`${idBase}-hasta-e`}>{errores.hasta}</MensajeCampo>
        </div>

        <div data-campo="monto" className="min-w-0 sm:col-span-2 min-[1025px]:col-span-2">
          {/* inputMode="decimal": teclado numérico con coma/punto en mobile. */}
          <Input id={idMonto} label="Monto con IVA ($)" type="text" inputMode="decimal" enterKeyHint="go"
            autoComplete="off" placeholder="0,00" maxLength={16} value={form.montoTexto} disabled={cargando}
            onChange={(e) => onCampo('montoTexto', e.target.value)} error={errores.monto} />
        </div>

        <div className="sm:col-span-2 min-[1025px]:col-span-2 min-[1025px]:self-end">
          <Button type="submit" icon={Sparkles} loading={cargando} className={`${TOQUE} w-full`}
            loadingText="Generando el listado, aguardá un momento">
            {cargando ? 'Generando…' : 'Generar'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function MensajeCampo({ id, children }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="mt-1 flex items-start gap-1.5 text-red-400 text-sm min-[1025px]:text-xs font-body">
      <AlertCircle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  )
}
