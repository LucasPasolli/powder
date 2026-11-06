// src/lib/pagoSplit.js
// Lógica PURA del Split Payment (sin React, sin BD, sin DOM).
//
// Todo el cálculo se hace en ENTEROS para que "la suma de ambos montos sea
// exactamente el total y la de porcentajes 100 %" (Escenario 7) sea una
// propiedad del algoritmo y no de la suerte del punto flotante:
//   · dinero      → centavos            (1500,50  → 150050)
//   · porcentaje  → centésimas de punto (40,25 %  → 4025; 100 % = 10000)
//
// El método editado por el usuario manda; el otro se obtiene por DIFERENCIA
// (total − primero, 100 − primero), nunca calculándolo por separado.

/** @typedef {'efectivo'|'transferencia'} MetodoSplit */
/** @typedef {'monto'|'porcentaje'} CampoSplit */
/**
 * @typedef {object} OrigenSplit  Última edición del usuario (la que prevalece).
 * @property {MetodoSplit} metodo
 * @property {CampoSplit}  campo
 * @property {string}      texto  Tal cual lo tipeó.
 */
/**
 * @typedef {object} PorcionSplit
 * @property {number} monto       Pesos, 2 decimales.
 * @property {number} porcentaje  0–100, 2 decimales.
 */
/** @typedef {Record<MetodoSplit, PorcionSplit>} PayloadSplit */

export const METODOS_SPLIT = Object.freeze(['efectivo', 'transferencia'])
export const ETIQUETA_METODO = Object.freeze({ efectivo: 'Efectivo', transferencia: 'Transferencia' })
export const CIEN_PCT = 10000

/** Sólo los presupuestos de contado pueden dividirse (Escenarios 1 y 2). */
export const esMetodoElegibleSplit = (metodo) => METODOS_SPLIT.includes(metodo)

const otro = (m) => (m === 'efectivo' ? 'transferencia' : 'efectivo')

// ─── Conversión ────────────────────────────────────────────────────────────

/** @param {number} pesos @returns {number} centavos (entero) o NaN */
export function aCentavos(pesos) {
  const n = Number(pesos)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

/** Entero ×100 → texto es-AR sin separador de miles ("1500,50"). */
export function formatearCentesimas(c) {
  const signo = c < 0 ? '-' : ''
  const abs = Math.abs(c)
  const ent = Math.floor(abs / 100)
  const dec = String(abs % 100).padStart(2, '0')
  return `${signo}${ent},${dec}`
}

const RE_MILES = /^\d{1,3}(\.\d{3})+$/

/**
 * Parsea lo que tipea el usuario a un entero ×100, tolerando "1500,5",
 * "1500.50", "1.500,50" y "$ 1.500". Sin usar punto flotante.
 * @param {string} texto
 * @returns {{ok: true, valor: number} | {ok: false, motivo: 'vacio'|'negativo'|'no_numerico'|'decimales'}}
 */
export function parsearCentesimas(texto) {
  const t = String(texto ?? '').replace(/\s/g, '').replace(/^\$/, '')
  if (t === '') return { ok: false, motivo: 'vacio' }
  if (t.startsWith('-')) return { ok: false, motivo: 'negativo' }
  if (!/^[0-9.,]+$/.test(t)) return { ok: false, motivo: 'no_numerico' }

  const puntos = (t.match(/\./g) ?? []).length
  const comas  = (t.match(/,/g) ?? []).length
  let ent = t
  let dec = ''

  if (comas > 1) return { ok: false, motivo: 'no_numerico' }

  if (comas === 1) {
    // La coma es el decimal; los puntos, si hay, deben ser miles ("1.500,50").
    const [a, b] = t.split(',')
    if (puntos > 0 && !RE_MILES.test(a)) return { ok: false, motivo: 'no_numerico' }
    ent = a.replace(/\./g, '')
    dec = b
  } else if (puntos === 1) {
    // "1.500" = mil quinientos (grupo de 3 tras el punto); "1500.5" / "0.500" = decimal.
    const [a, b] = t.split('.')
    if (b.length === 3 && /^[1-9]\d{0,2}$/.test(a)) { ent = a + b; dec = '' }
    else { ent = a; dec = b }
  } else if (puntos > 1) {
    if (!RE_MILES.test(t)) return { ok: false, motivo: 'no_numerico' }
    ent = t.replace(/\./g, '')
  }

  if (!/^\d*$/.test(ent) || !/^\d*$/.test(dec)) return { ok: false, motivo: 'no_numerico' }
  if (ent === '' && dec === '') return { ok: false, motivo: 'no_numerico' }
  if (dec.length > 2) return { ok: false, motivo: 'decimales' }

  const valor = Number(ent || '0') * 100 + Number(dec.padEnd(2, '0') || '0')
  if (!Number.isSafeInteger(valor)) return { ok: false, motivo: 'no_numerico' }
  return { ok: true, valor }
}

// ─── Resolución ────────────────────────────────────────────────────────────

const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const fmtPorcentaje = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 40 → "40,00 %" */
export const fmtPct = (n) => `${fmtPorcentaje.format(n ?? 0)} %`

const vacios = () => ({
  efectivo:      { monto: '', porcentaje: '' },
  transferencia: { monto: '', porcentaje: '' },
})

/**
 * @typedef {object} EstadoSplit
 * @property {Record<MetodoSplit, {monto: string, porcentaje: string}>} campos
 *   Texto a mostrar en cada input (el campo editado conserva lo tipeado).
 * @property {Partial<Record<MetodoSplit, Partial<Record<CampoSplit, string>>>>} errores
 * @property {boolean} valido
 * @property {PayloadSplit|null} payload  Sólo si `valido`.
 * @property {number} totalCentavos
 */

/**
 * Dado el total y la última edición del usuario, calcula los cuatro campos.
 * @param {number} totalPesos  Total del presupuesto (referencia).
 * @param {OrigenSplit|null} origen
 * @returns {EstadoSplit}
 */
export function resolverSplit(totalPesos, origen) {
  const total = aCentavos(totalPesos)
  const base = { campos: vacios(), errores: {}, valido: false, payload: null, totalCentavos: total }

  if (!Number.isSafeInteger(total) || total <= 0) {
    return { ...base, errores: { efectivo: { monto: 'El presupuesto no tiene un total válido.' } } }
  }
  if (!origen) return base // Recién activado: sin errores, pero no confirmable.

  const { metodo, campo, texto } = origen
  const falla = (mensaje) => ({
    ...base,
    campos: { ...vacios(), [metodo]: { ...vacios()[metodo], [campo]: texto } },
    errores: { [metodo]: { [campo]: mensaje } },
  })

  const p = parsearCentesimas(texto)
  if (!p.ok) {
    const msg = {
      vacio:       campo === 'monto' ? 'Ingresá un monto.' : 'Ingresá un porcentaje.',
      negativo:    'No puede ser negativo.',
      no_numerico: 'Ingresá sólo números (ej. 1500,50).',
      decimales:   'Máximo 2 decimales.',
    }[p.motivo]
    return falla(msg)
  }

  let m1, p1
  if (campo === 'monto') {
    m1 = p.valor
    if (m1 <= 0)    return falla('El monto debe ser mayor a 0.')
    if (m1 > total) return falla(`El monto no puede superar el total (${fmtARS.format(total / 100)}).`)
    p1 = Math.round((m1 * CIEN_PCT) / total)
  } else {
    p1 = p.valor
    if (p1 <= 0)        return falla('El porcentaje debe ser mayor a 0.')
    if (p1 >= CIEN_PCT) return falla('El porcentaje debe ser menor a 100.')
    m1 = Math.round((total * p1) / CIEN_PCT)
  }

  // Segundo método = DIFERENCIA (Escenario 7).
  const m2 = total - m1
  const p2 = CIEN_PCT - p1

  if (m2 === 0) {
    return falla('Con el 100 % en un solo método no hay división: desactivá Split Payment.')
  }
  if (m1 <= 0 || p1 <= 0 || p1 >= CIEN_PCT || p2 <= 0) {
    return falla('El valor es demasiado chico (o grande) para este total.')
  }

  const o = otro(metodo)
  const porcion = (m, pc) => ({ monto: m / 100, porcentaje: pc / 100 })
  return {
    campos: {
      [metodo]: {
        monto:      campo === 'monto'      ? texto : formatearCentesimas(m1),
        porcentaje: campo === 'porcentaje' ? texto : formatearCentesimas(p1),
      },
      [o]: { monto: formatearCentesimas(m2), porcentaje: formatearCentesimas(p2) },
    },
    errores: {},
    valido: true,
    payload: { [metodo]: porcion(m1, p1), [o]: porcion(m2, p2) },
    totalCentavos: total,
  }
}

// ─── Reparto proporcional (Facturas) ───────────────────────────────────────

/**
 * Reparte `objetivoC` centavos entre `pesos` (≥ 0) de forma proporcional con
 * el método del mayor resto: la suma devuelta es EXACTAMENTE `objetivoC`.
 * @param {number[]} pesos
 * @param {number} objetivoC
 * @returns {number[]} centavos
 */
export function repartirProporcional(pesos, objetivoC) {
  const n = pesos.length
  if (n === 0) return []
  const suma = pesos.reduce((a, b) => a + Math.max(0, b), 0)
  if (suma <= 0) {
    const base = Math.floor(objetivoC / n)
    const res = Array(n).fill(base)
    res[n - 1] += objetivoC - base * n
    return res
  }
  const exactos = pesos.map((w) => (objetivoC * Math.max(0, w)) / suma)
  const piso = exactos.map(Math.floor)
  let resto = objetivoC - piso.reduce((a, b) => a + b, 0)
  const orden = exactos
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; resto > 0 && k < orden.length; k++, resto--) piso[orden[k].i] += 1
  return piso
}

// ─── Expansión de un presupuesto con split en líneas por método ───────────

/**
 * Convierte UNA línea de venta pagada con split en DOS líneas (una por
 * método), cada una con SU porción. Si los datos no cuadran con el total
 * devuelve la línea original sin tocar: nunca duplica ni inventa importes.
 *
 * @template {{monto:number, metodoPago:string, idPresupuesto?:*}} L
 * @param {L} linea
 * @param {PayloadSplit|null|undefined} split
 * @returns {(L & {split?: {metodo: MetodoSplit, porcentaje: number, montoTotal: number}})[]}
 */
export function expandirLineaSplit(linea, split) {
  if (!split || !esMetodoElegibleSplit(linea.metodoPago)) return [linea]
  const partes = METODOS_SPLIT.filter((m) => split[m])
  if (partes.length !== 2) return [linea]

  const totalC = aCentavos(linea.monto)
  const sumaC  = partes.reduce((a, m) => a + aCentavos(split[m].monto), 0)
  const sumaP  = partes.reduce((a, m) => a + Math.round(split[m].porcentaje * 100), 0)
  if (sumaC !== totalC || sumaP !== CIEN_PCT) {
    console.error('[pagoSplit] split inconsistente; se lista sin dividir', {
      idPresupuesto: linea.idPresupuesto, totalC, sumaC, sumaP,
    })
    return [linea]
  }

  return partes.map((m) => ({
    ...linea,
    metodoPago: m,
    monto: split[m].monto,
    split: { metodo: m, porcentaje: split[m].porcentaje, montoTotal: linea.monto },
  }))
}
