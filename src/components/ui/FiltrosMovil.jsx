// src/components/ui/FiltrosMovil.jsx
// Patrón ÚNICO de filtros para listados en mobile/tablet (≤ 1024 px).
//
//   ┌──────────────────────────────┬────────────┐
//   │ 🔍 Buscador (siempre visible) │ ⚙ Filtros ② │   ← una sola fila
//   └──────────────────────────────┴────────────┘
//   Panel (FullScreenSheet) «Filtros» ✕
//     ETIQUETA EN MAYÚSCULAS
//     [ control ]            ← select · fecha · chips · casilla · texto
//     ...
//     [   Limpiar   ] [   Aplicar   ]
//
// POR QUÉ UN COMPONENTE DIRIGIDO POR CONFIGURACIÓN (patrón Template Method + Strategy)
//   Cada pantalla solo declara QUÉ campos tiene (`campos`) y sus valores por defecto.
//   El layout, la tipografía de las etiquetas, el orden de los botones y la semántica
//   del borrador viven acá, así que dos pantallas NO pueden diferir en estilo ni en
//   interacción (Escenario 3) y arreglar un bug aquí lo arregla en todas.
//
// SEMÁNTICA DEL BORRADOR (Escenarios 5, 6 y 7)
//   • Se edita una COPIA (`borrador`). El listado sólo cambia con «Aplicar».
//   • «Limpiar» devuelve el BORRADOR a los valores por defecto; no cierra ni aplica.
//   • Cerrar (✕ / Esc) descarta el borrador: el valor aplicado no se toca.
//   • Al reabrir, el borrador vuelve a partir del último valor aplicado.
//
// Componente CONTROLADO: el valor aplicado vive en la pantalla, por eso rotar el
// equipo (que cambia de layout) nunca pierde los filtros.
//
// El buscador de texto NO es parte del borrador: vive fuera del panel, se aplica a
// medida que se escribe (igual que en escritorio) y es provisto por la pantalla.

import { useId, useState } from 'react'
import { AlertCircle, Search, SlidersHorizontal } from 'lucide-react'
import { Button, Card, Input, Select } from './index'
import DateField from './DateField'
import FullScreenSheet from './FullScreenSheet'
import { ALTO_CONTROL, CLASE_ETIQUETA } from './controles'

/**
 * @typedef {{ value: string, label: string }} OpcionFiltro
 *
 * @typedef {Object} CampoFiltro
 * @property {'select'|'fecha'|'chips'|'checkbox'|'texto'} tipo
 * @property {string} clave          Clave dentro del objeto `value`/`defaults`.
 * @property {string} [etiqueta]     Se muestra en MAYÚSCULAS (CSS).
 * @property {OpcionFiltro[] | ((borrador: object) => OpcionFiltro[])} [opciones]  select / chips.
 * @property {string} [texto]        checkbox: texto de la casilla.
 * @property {(borrador: object) => string | undefined} [min]   fecha.
 * @property {(borrador: object) => string | undefined} [max]   fecha.
 * @property {boolean} [limpiable]   fecha: botón «Borrar» (por defecto sí).
 * @property {(borrador: object) => boolean} [visible]  Campo condicional.
 * @property {string} [placeholder]  texto.
 * @property {string} [inputMode]    texto.
 * @property {number} [maxLength]    texto.
 * @property {(raw: string) => string} [normalizar]  texto: sanea lo tipeado (p. ej. sólo dígitos).
 */

/**
 * Cantidad de campos del panel cuyo valor aplicado difiere del valor por defecto.
 * @param {Record<string, unknown>} value
 * @param {Record<string, unknown>} defaults
 */
export function contarFiltrosActivos(value, defaults) {
  return Object.keys(defaults).filter((k) => value?.[k] !== defaults[k]).length
}

/**
 * Validación común de rangos «Desde / Hasta» (fechas ISO: comparan como texto).
 * Devuelve el mensaje de error o '' si el rango es coherente / está incompleto.
 */
export const mensajeRangoInvalido = (desde, hasta) =>
  desde && hasta && desde > hasta ? 'La fecha "Desde" no puede ser posterior a "Hasta".' : ''

// ─── Buscador (siempre visible, fuera del panel) ──────────────────────────────

/**
 * Buscador de texto del listado. Misma altura, tipografía (16 px: evita el zoom de
 * iOS), borde y radio que el resto de los controles de filtro.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(texto: string) => void} props.onChange   Recibe el TEXTO (no el evento).
 * @param {string} props.placeholder
 * @param {string} [props.etiqueta]   Nombre accesible (por defecto, el placeholder).
 * @param {string} [props.inputMode]
 * @param {number} [props.maxLength]
 */
export function BuscadorListado({ value, onChange, placeholder, etiqueta, inputMode = 'search', maxLength, id }) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className="relative flex-1 min-w-0">
      <Search size={15} aria-hidden="true"
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none" />
      <label htmlFor={inputId} className="sr-only">{etiqueta ?? placeholder}</label>
      <input
        id={inputId} type="search" inputMode={inputMode} enterKeyHint="search" autoComplete="off"
        maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-surface-700 border border-surface-600 rounded-xl pl-9 pr-3 text-white font-body
                    text-base ${ALTO_CONTROL} placeholder-surface-500 focus:outline-none
                    focus:border-brand-500 transition-all`}
      />
    </div>
  )
}

// ─── Campos del panel ─────────────────────────────────────────────────────────

const CONTROL = `${ALTO_CONTROL} !py-0` // mismo alto en select / texto / fecha / chips / casilla

function Alerta({ children, className = '' }) {
  return (
    <div role="alert" className={`flex items-start gap-2 text-red-400 text-base bg-red-500/10
                                  border border-red-500/20 rounded-xl px-4 py-2.5 font-body ${className}`}>
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  )
}

function CampoPanel({ campo, borrador, onCambio, idBase }) {
  const id = `${idBase}-${campo.clave}`
  const valor = borrador[campo.clave]
  const opciones = typeof campo.opciones === 'function' ? campo.opciones(borrador) : campo.opciones

  switch (campo.tipo) {
    case 'select':
      return (
        <Select label={campo.etiqueta} id={id} value={valor} className={CONTROL}
          onChange={(e) => onCambio(campo.clave, e.target.value)}>
          {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      )

    case 'fecha':
      return (
        <DateField etiquetaArriba id={id} label={campo.etiqueta} value={valor}
          min={campo.min?.(borrador)} max={campo.max?.(borrador)}
          clearable={campo.limpiable !== false}
          onChange={(v) => onCambio(campo.clave, v)} />
      )

    case 'texto':
      return (
        <Input label={campo.etiqueta} id={id} type="text" autoComplete="off"
          inputMode={campo.inputMode} maxLength={campo.maxLength} placeholder={campo.placeholder}
          value={valor} className={CONTROL}
          onChange={(e) => onCambio(campo.clave, campo.normalizar ? campo.normalizar(e.target.value) : e.target.value)} />
      )

    case 'chips':
      return (
        <div role="group" aria-labelledby={`${id}-lbl`} className="space-y-1">
          <span id={`${id}-lbl`} className={CLASE_ETIQUETA}>{campo.etiqueta}</span>
          <div className="grid grid-cols-2 gap-2">
            {opciones.map((o, i) => {
              const activo = valor === o.value
              const ultimoImpar = opciones.length % 2 === 1 && i === opciones.length - 1
              return (
                <button key={o.value} type="button" aria-pressed={activo}
                  onClick={() => onCambio(campo.clave, o.value)}
                  className={`inline-flex items-center justify-center px-3 ${ALTO_CONTROL} rounded-xl text-sm font-body
                              border transition-all focus-visible:outline-none focus-visible:ring-2
                              focus-visible:ring-brand-500/60 ${ultimoImpar ? 'col-span-2' : ''}
                              ${activo
                                ? 'bg-brand-500/15 border-brand-500/50 text-white'
                                : 'bg-surface-700 border-surface-600 text-surface-300 hover:border-surface-500'}`}>
                  {o.label}
                </button>
              )
            })}
          </div>
        </div>
      )

    case 'checkbox':
      return (
        <div className="space-y-1">
          {campo.etiqueta && <span className={CLASE_ETIQUETA}>{campo.etiqueta}</span>}
          <label className={`flex items-center gap-3 cursor-pointer select-none bg-surface-700 border border-surface-600
                             rounded-xl px-3 ${ALTO_CONTROL} transition-all hover:border-surface-500
                             focus-within:border-brand-500`}>
            <input type="checkbox" checked={Boolean(valor)} onChange={(e) => onCambio(campo.clave, e.target.checked)}
              className="w-5 h-5 rounded accent-brand-500 cursor-pointer shrink-0" />
            <span className="text-surface-100 text-base font-body">{campo.texto}</span>
          </label>
        </div>
      )

    default:
      return null
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {React.ReactNode} [props.busqueda]  Buscador de texto (ver <BuscadorListado>). Queda fuera del panel.
 * @param {React.ReactNode} [props.izquierda] Contenido de la fila cuando la pantalla NO tiene buscador
 *                                            (p. ej. el período vigente en Estadísticas). Se ignora si hay `busqueda`.
 * @param {React.ReactNode} [props.debajo]    Línea informativa bajo la fila (p. ej. «Período: …»).
 * @param {'centro'|'fin'} [props.alineacion] Alineación vertical de la fila. `'fin'` alinea el botón «Filtros»
 *                                            con la base del buscador cuando éste lleva un rótulo visible encima.
 * @param {Record<string, any>} props.value     Valores APLICADOS de los campos del panel.
 * @param {Record<string, any>} props.defaults  Valores por defecto (mismas claves que `value`).
 * @param {CampoFiltro[]} props.campos          Campos del panel, en orden.
 * @param {(borrador: Record<string, any>) => boolean | void | Promise<boolean | void>} props.onApply
 *        Recibe el borrador. Devolver `false` (o una promesa que resuelva `false`) mantiene el
 *        panel abierto; cualquier otra cosa lo cierra.
 * @param {(clave: string, valor: any, siguiente: Record<string, any>, previo: Record<string, any>) => Record<string, any>} [props.alCambiar]
 *        Reglas entre campos dependientes. Recibe el borrador ya actualizado y devuelve el definitivo.
 * @param {(borrador: Record<string, any>) => string | null | undefined} [props.validar]
 *        Mensaje de error del borrador ('' / null si es válido). Un error deshabilita «Aplicar».
 * @param {string} [props.error]  Error externo (p. ej. falló la consulta): se muestra en el panel y bajo la fila.
 * @param {(value: Record<string, any>) => number} [props.contar]  Sustituye al conteo por defecto del badge.
 */
export default function FiltrosMovil({
  busqueda, izquierda, debajo, value, defaults, campos, onApply, alCambiar, validar, error, contar,
  alineacion = 'centro',
}) {
  const idBase = useId()
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState(value)

  const activos = contar ? contar(value) : contarFiltrosActivos(value, defaults)
  const errorValidacion = validar?.(borrador) || ''

  const abrir = () => { setBorrador({ ...value }); setAbierto(true) }
  const cerrar = () => setAbierto(false)                       // descarta el borrador (Escenario 7)
  const limpiar = () => setBorrador((b) => ({ ...b, ...defaults })) // sólo el borrador (Escenario 6)

  function cambiar(clave, valor) {
    setBorrador((previo) => {
      const siguiente = { ...previo, [clave]: valor }
      return alCambiar ? alCambiar(clave, valor, siguiente, previo) : siguiente
    })
  }

  function aplicar() {
    if (validar?.(borrador)) return undefined
    const terminar = (r) => { if (r !== false) setAbierto(false) }
    const resultado = onApply(borrador)
    // Si `onApply` es asíncrono se devuelve la promesa: <Button> muestra el estado
    // «cargando» y bloquea el doble clic hasta que resuelva.
    if (resultado && typeof resultado.then === 'function') return resultado.then(terminar)
    terminar(resultado)
    return undefined
  }

  const visibles = campos.filter((c) => !c.visible || c.visible(borrador))

  return (
    <>
      <Card className="p-3 sm:p-4 space-y-2">
        <div className={`flex gap-2 ${alineacion === 'fin' ? 'items-end' : 'items-center'}`}>
          {busqueda ?? <div className="flex-1 min-w-0">{izquierda}</div>}
          <Button variant="secondary" icon={SlidersHorizontal} onClick={abrir} aria-haspopup="dialog"
            className="h-11 !py-0 flex-shrink-0 justify-center">
            Filtros
            {activos > 0 && (
              <span aria-label={`${activos} filtro${activos !== 1 ? 's' : ''} activo${activos !== 1 ? 's' : ''}`}
                className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand-500 text-white text-xs font-mono
                           inline-flex items-center justify-center">
                {activos}
              </span>
            )}
          </Button>
        </div>
        {debajo}
        {error && !abierto && <Alerta>{error}</Alerta>}
      </Card>

      <FullScreenSheet
        open={abierto}
        onClose={cerrar}
        title="Filtros"
        footer={(
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-11 !py-0 justify-center" onClick={limpiar}>Limpiar</Button>
            <Button className="h-11 !py-0 justify-center" onClick={aplicar} disabled={Boolean(errorValidacion)}>Aplicar</Button>
          </div>
        )}
      >
        <div className="space-y-4 max-w-md mx-auto">
          {visibles.map((c) => (
            <CampoPanel key={c.clave} campo={c} borrador={borrador} onCambio={cambiar} idBase={idBase} />
          ))}
          {errorValidacion && <Alerta>{errorValidacion}</Alerta>}
          {error && <Alerta>{error}</Alerta>}
        </div>
      </FullScreenSheet>
    </>
  )
}
