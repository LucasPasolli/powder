// src/lib/pedidoComparacion.js
//
// Comparación línea a línea: pedido ORIGINAL vs FACTURADO (T2).
// Funciones puras → testeables sin base de datos ni React.
//
// Reglas (criterios de aceptación):
//   % por línea   = (facturado − original) ÷ original × 100, 2 decimales.
//                   Línea agregada (original = 0) → `pctNuevo = true`, sin porcentaje.
//   % global      = Σ|facturado − original| (unidades) ÷ Σ original × 100.
//   Tipos         = sin_cambios | cantidad_modificada | quitada (−100 %) | agregada.
//
// Una línea se identifica por (producto, medida). Si un mismo par aparece más de
// una vez en un lado, sus cantidades se suman y el precio es el promedio ponderado.

/**
 * Redondeo a 2 decimales «half away from zero», idéntico al round() de PostgreSQL
 * con numeric (el que usa el servidor). Evita el clásico 1.005 → 1.00 de binario.
 * @param {number} n
 */
export function redondear2(n) {
  if (!Number.isFinite(n)) return 0
  const signo = n < 0 ? -1 : 1
  const abs = Math.abs(n)
  const [mantisa, exp = '0'] = String(abs).split('e')
  const desplazado = Math.round(Number(`${mantisa}e${Number(exp) + 2}`))
  return signo * Number(`${desplazado}e-2`) || 0 // `|| 0` evita -0
}

export const TIPO_LINEA = Object.freeze({
  SIN_CAMBIOS: 'sin_cambios',
  CANTIDAD_MODIFICADA: 'cantidad_modificada',
  QUITADA: 'quitada',
  AGREGADA: 'agregada',
})

export const ETIQUETA_TIPO = Object.freeze({
  [TIPO_LINEA.SIN_CAMBIOS]: 'Sin cambios',
  [TIPO_LINEA.CANTIDAD_MODIFICADA]: 'Cantidad modificada',
  [TIPO_LINEA.QUITADA]: 'Quitada por el proveedor',
  [TIPO_LINEA.AGREGADA]: 'Agregada',
})

export const MENSAJE_SIN_ORIGINAL = 'Sin versión original registrada'
export const MENSAJE_SIN_MODIFICACIONES = 'El pedido se facturó sin modificaciones'

const clave = (l) => `${l.idProducto ?? 'x'}|${l.medida ?? ''}`

/** Suma cantidades por (producto, medida); precio = promedio ponderado por cantidad. */
export function agruparLineas(lineas) {
  const mapa = new Map()
  for (const l of lineas ?? []) {
    const k = clave(l)
    const cant = Number(l.cantidad) || 0
    const lista = Number(l.precioUnitario) || 0
    const desc = l.precioConDescuento == null ? null : Number(l.precioConDescuento)
    const previo = mapa.get(k)
    if (!previo) {
      mapa.set(k, {
        clave: k, idProducto: l.idProducto ?? null, nombreProducto: l.nombreProducto ?? null, medida: l.medida ?? null,
        cantidad: cant, importeLista: cant * lista, importeDesc: cant * (desc ?? lista), hayDescuento: desc != null,
      })
    } else {
      previo.cantidad += cant
      previo.importeLista += cant * lista
      previo.importeDesc += cant * (desc ?? lista)
      previo.hayDescuento = previo.hayDescuento || desc != null
    }
  }
  return mapa
}

const precioPromedio = (g) => (g && g.cantidad > 0 ? redondear2(g.importeLista / g.cantidad) : null)
const precioDescPromedio = (g) => (g && g.hayDescuento && g.cantidad > 0 ? redondear2(g.importeDesc / g.cantidad) : null)

/**
 * @typedef {Object} LineaComparada
 * @property {string} clave
 * @property {number|null} idProducto
 * @property {string|null} nombreProducto
 * @property {string|null} medida
 * @property {number} cantidadOriginal
 * @property {number} cantidadFacturada
 * @property {number} difUnidades
 * @property {number|null} difPct       null cuando la línea es nueva
 * @property {boolean} pctNuevo         línea agregada: se muestra «Nueva»
 * @property {'sin_cambios'|'cantidad_modificada'|'quitada'|'agregada'} tipo
 * @property {'reducida'|'aumentada'|null} direccion  sólo en cantidad_modificada
 * @property {number|null} precioOriginal
 * @property {number|null} precioFacturado
 * @property {number|null} precioConDescuento
 * @property {boolean} precioCambio     el precio de lista difiere entre original y facturado
 * @property {boolean} tieneDiferencias
 */

/**
 * @param {object} p
 * @param {Array} p.original     líneas del original ({idProducto, medida, cantidad, precioUnitario, ...})
 * @param {Array} p.facturado    líneas vigentes (facturadas)
 * @param {number|null} [p.montoOriginal]   total del original (cabecera). null = sin versión original.
 * @param {number} [p.montoFacturado]
 */
export function compararPedido({ original, facturado, montoOriginal = null, montoFacturado = null }) {
  if (montoOriginal == null || !original || original.length === 0) {
    return { sinOriginal: true, mensaje: MENSAJE_SIN_ORIGINAL, lineas: [], resumen: null }
  }

  const gO = agruparLineas(original)
  const gF = agruparLineas(facturado)
  const claves = [...gO.keys(), ...[...gF.keys()].filter((k) => !gO.has(k))] // originales primero, luego agregadas

  /** @type {LineaComparada[]} */
  const lineas = claves.map((k) => {
    const o = gO.get(k)
    const f = gF.get(k)
    const base = o ?? f
    const cantO = o?.cantidad ?? 0
    const cantF = f?.cantidad ?? 0
    const dif = cantF - cantO

    let tipo = TIPO_LINEA.SIN_CAMBIOS
    if (cantO === 0) tipo = TIPO_LINEA.AGREGADA
    else if (cantF === 0) tipo = TIPO_LINEA.QUITADA
    else if (dif !== 0) tipo = TIPO_LINEA.CANTIDAD_MODIFICADA

    const pctNuevo = cantO === 0
    const precioO = precioPromedio(o)
    const precioF = precioPromedio(f)
    const precioCambio = Boolean(o && f && precioO !== precioF)

    return {
      clave: k, idProducto: base.idProducto, nombreProducto: base.nombreProducto, medida: base.medida,
      cantidadOriginal: cantO, cantidadFacturada: cantF, difUnidades: dif,
      difPct: pctNuevo ? null : redondear2((dif / cantO) * 100),
      pctNuevo, tipo,
      direccion: tipo === TIPO_LINEA.CANTIDAD_MODIFICADA ? (dif < 0 ? 'reducida' : 'aumentada') : null,
      precioOriginal: precioO, precioFacturado: precioF, precioConDescuento: precioDescPromedio(f),
      precioCambio,
      tieneDiferencias: tipo !== TIPO_LINEA.SIN_CAMBIOS || precioCambio,
    }
  })

  const unidadesOriginal = lineas.reduce((a, l) => a + l.cantidadOriginal, 0)
  const unidadesFacturado = lineas.reduce((a, l) => a + l.cantidadFacturada, 0)
  const sumaAbs = lineas.reduce((a, l) => a + Math.abs(l.difUnidades), 0)

  const sumaSub = (ls) => (ls ?? []).reduce((a, l) => a + (Number(l.subtotal) || 0), 0)
  const totalOriginal = redondear2(Number(montoOriginal))
  const totalFacturado = redondear2(montoFacturado != null ? Number(montoFacturado) : sumaSub(facturado))

  const conteo = lineas.reduce((a, l) => ({ ...a, [l.tipo]: (a[l.tipo] ?? 0) + 1 }), {})
  const sinCambiosCantidad = lineas.every((l) => l.tipo === TIPO_LINEA.SIN_CAMBIOS)
  const cambiosPrecio = lineas.filter((l) => l.precioCambio).length
  const hayDescuento = lineas.some((l) => l.precioConDescuento != null)

  return {
    sinOriginal: false,
    mensaje: null,
    lineas,
    resumen: {
      pctGlobal: unidadesOriginal > 0 ? redondear2((sumaAbs / unidadesOriginal) * 100) : 0,
      unidadesOriginal, unidadesFacturado,
      totalOriginal, totalFacturado, difImporte: redondear2(totalFacturado - totalOriginal),
      conteo, cambiosPrecio, hayDescuento, sinCambiosCantidad,
      // «Sin modificaciones» sólo si NADA cambió: ni cantidades, ni precios, ni importe.
      sinDiferencias: sinCambiosCantidad && cambiosPrecio === 0 && totalOriginal === totalFacturado,
    },
  }
}

/** Sólo las líneas con diferencias (filtro de la vista). */
export const filtrarConDiferencias = (lineas) => (lineas ?? []).filter((l) => l.tieneDiferencias)

/** «−12,50 %» / «+8 %» / «Nueva» — formato es-AR para la UI. */
export function formatearPct(linea) {
  if (linea.pctNuevo || linea.difPct == null) return 'Nueva'
  const txt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(linea.difPct)
  return `${linea.difPct > 0 ? '+' : ''}${txt} %`
}
