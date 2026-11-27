// src/lib/facturarPorMonto.js
// Lógica PURA de «Facturar por monto» (sin React, sin BD, sin DOM).
//
//  · TASK 1 — validación del formulario, mapeo de la respuesta de la RPC
//    `fn_facturar_por_monto` y totales (IVA, diferencia).
//  · TASK 2 — edición manual del listado del lado del cliente: cantidades, precio
//    sin IVA, alta/baja de líneas, marcas internas, validaciones por campo,
//    restablecer y armado del payload del PDF.
//
// DECISIONES
//  · Todo el dinero se compara en CENTAVOS enteros; los precios netos unitarios son
//    `number` con hasta 8 decimales (así `cantidad × precioNeto × 1,21` reproduce el
//    subtotal con IVA que calculó el servidor, sin deriva).
//  · El estado de edición es un reducer puro: testeable sin montar componentes.
//  · Las marcas («agregada», «aumentada», «reducida», «precio editado») son
//    INFORMACIÓN INTERNA: se derivan de la línea y NUNCA llegan al PDF.

import { FACTOR_IVA } from './facturas'
import { esFechaISO } from './fechas'
import { parsearCentesimas } from './pagoSplit'
import { filtrarPromocionesCalculables, redondearPrecio, resolverPromocionProducto } from './promocionProducto'

// ─── Constantes ────────────────────────────────────────────────────────────

/** IVA vigente del sistema (0,21), derivado de FACTOR_IVA para que haya UNA sola fuente. */
export const ALICUOTA_IVA = Math.round((FACTOR_IVA - 1) * 10_000) / 10_000

/** Tope del monto (en centavos): 9.999.999.999,99. Coincide con la validación de la RPC. */
export const MONTO_MAX_CENTAVOS = 999_999_999_999
export const CANTIDAD_MAX = 1_000_000
export const PRECIO_MAX_CENTAVOS = 99_999_999_999

/** Documentos de salida, igual que en Facturas (un PDF por tipo). */
export const DOCUMENTOS = Object.freeze([
  { tipo: 'noEfectivo', label: 'Transferencia + CC', pantalla: 'Transferencia y Cuenta Corriente', pdf: 'Factura — Transferencia y Cuenta Corriente', metodoPago: 'transferencia' },
  { tipo: 'efectivo',   label: 'Efectivo',           pantalla: 'Efectivo',                         pdf: 'Factura — Efectivo',                         metodoPago: 'efectivo' },
])

export const MARCA_LABEL = Object.freeze({
  agregada: 'Agregada',
  aumentada: 'Cantidad aumentada',
  reducida: 'Cantidad reducida',
})

// ─── Formato / aritmética ──────────────────────────────────────────────────

const pesos = (centavos) => centavos / 100

/** Número → texto editable «1234,50» (sin separador de miles: es un campo de entrada). */
export function textoEditable(n) {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',')
}

/** Centavos → «1234,50», para precargar el campo de monto. */
export const centavosATexto = (c) => textoEditable(pesos(c))

// ─── Validación del formulario (TASK 1, escenario 15) ──────────────────────

const MENSAJE_MONTO = Object.freeze({
  vacio: 'Ingresá el monto a facturar.',
  negativo: 'El monto no puede ser negativo.',
  no_numerico: 'Ingresá sólo números (por ejemplo 1500,50).',
  decimales: 'Usá hasta 2 decimales.',
})

/**
 * @param {{cliente: {idCliente:number}|null, desde: string, hasta: string, montoTexto: string}} f
 * @returns {{errores: {cliente?:string, desde?:string, hasta?:string, monto?:string}, montoCentavos: number|null, valido: boolean}}
 */
export function validarFormulario({ cliente, desde, hasta, montoTexto }) {
  /** @type {Record<string,string>} */
  const errores = {}

  if (!cliente || !Number.isInteger(cliente.idCliente) || cliente.idCliente < 1) errores.cliente = 'Seleccioná un cliente.'

  if (!desde) errores.desde = 'Ingresá la fecha inicial.'
  else if (!esFechaISO(desde)) errores.desde = 'La fecha inicial no es válida.'

  if (!hasta) errores.hasta = 'Ingresá la fecha final.'
  else if (!esFechaISO(hasta)) errores.hasta = 'La fecha final no es válida.'

  if (!errores.desde && !errores.hasta && desde > hasta) errores.hasta = 'La fecha final no puede ser anterior a la inicial.'

  let montoCentavos = null
  const r = parsearCentesimas(montoTexto)
  if (!r.ok) errores.monto = MENSAJE_MONTO[r.motivo] ?? MENSAJE_MONTO.no_numerico
  else if (r.valor <= 0) errores.monto = 'El monto debe ser mayor a 0.'
  else if (r.valor > MONTO_MAX_CENTAVOS) errores.monto = 'El monto es demasiado grande.'
  else montoCentavos = r.valor

  return { errores, montoCentavos, valido: Object.keys(errores).length === 0 }
}

// ─── Mapeo de la respuesta de la RPC ───────────────────────────────────────

/** @typedef {{
 *   clave: string, idProducto: number, nombre: string,
 *   cantidad: number, cantidadTexto: string, cantidadBase: number,
 *   precioNeto: number, precioTexto: string|null, precioNetoOriginal: number,
 *   precioReferenciaNeto: number|null, activo: boolean
 * }} LineaEditable */

/** @typedef {{idProducto:number, nombre:string, cantidadBase:number}} LineaQuitada */
/** @typedef {{lineas: LineaEditable[], quitadas: LineaQuitada[]}} DocEditable */
/** @typedef {{noEfectivo: DocEditable, efectivo: DocEditable}} DocsEditables */

const claveDe = (idProducto) => `p-${idProducto}`

/** @returns {LineaEditable} */
function crearLinea({ idProducto, nombre, cantidad, cantidadBase, precioNeto, precioReferenciaNeto, activo }) {
  return {
    clave: claveDe(idProducto),
    idProducto,
    nombre: nombre ?? `#${idProducto}`,
    cantidad,
    cantidadTexto: String(cantidad),
    cantidadBase,
    precioNeto,
    precioTexto: null,
    precioNetoOriginal: precioNeto,
    precioReferenciaNeto: precioReferenciaNeto ?? null,
    activo: activo !== false,
  }
}

const num = (v) => Number(v) || 0

/** @returns {DocEditable} */
function mapearDoc(d) {
  return {
    lineas: (d?.lineas ?? []).map((l) => crearLinea({
      idProducto: l.idProducto, nombre: l.nombre, cantidad: Math.trunc(num(l.cantidad)),
      cantidadBase: Math.trunc(num(l.cantidadBase)), precioNeto: num(l.precioNeto),
      precioReferenciaNeto: l.precioReferenciaNeto == null ? null : num(l.precioReferenciaNeto),
      activo: l.activo,
    })),
    quitadas: (d?.quitadas ?? []).map((q) => ({
      idProducto: q.idProducto, nombre: q.nombre ?? `#${q.idProducto}`, cantidadBase: Math.trunc(num(q.cantidadBase)),
    })),
  }
}

/**
 * Respuesta cruda de la RPC → modelo de pantalla.
 * @param {any} raw
 */
export function mapearRespuesta(raw) {
  const sinDocs = !raw?.documentos
  return {
    sinBase: Boolean(raw?.sinBase),
    historialDisponible: Boolean(raw?.historialDisponible),
    posible: raw?.posible !== false,
    aproximado: Boolean(raw?.aproximado),
    cliente: {
      idCliente: raw?.cliente?.idCliente ?? null,
      nombre: raw?.cliente?.nombre ?? '',
      cuit: raw?.cliente?.cuit ?? null,
    },
    periodo: { desde: raw?.periodo?.desde ?? '', hasta: raw?.periodo?.hasta ?? '' },
    alicuota: Number.isFinite(Number(raw?.alicuota)) && Number(raw?.alicuota) > 0 ? Number(raw.alicuota) : ALICUOTA_IVA,
    montoIngresadoCentavos: Math.round(num(raw?.montoIngresado) * 100),
    baseTotalCentavos: Math.round(num(raw?.baseTotal) * 100),
    /** @type {DocsEditables|null} */
    docs: sinDocs ? null : {
      noEfectivo: mapearDoc(raw.documentos.noEfectivo),
      efectivo: mapearDoc(raw.documentos.efectivo),
    },
  }
}

// ─── Totales ───────────────────────────────────────────────────────────────

/** Subtotal SIN IVA de una línea (pesos). */
export const subtotalNeto = (l) => l.cantidad * l.precioNeto

/**
 * Totales de un listado. El total con IVA es la suma de subtotales netos × (1 + alícuota)
 * redondeada a centavos; el neto es total ÷ (1 + alícuota) (escenario 6) e IVA = total − neto,
 * para que los tres siempre cierren al centavo.
 * @param {LineaEditable[]} lineas
 * @param {number} [alicuota]
 */
export function calcularTotalesDoc(lineas, alicuota = ALICUOTA_IVA) {
  const factor = 1 + alicuota
  let neto = 0
  for (const l of lineas) neto += l.cantidad * l.precioNeto
  const totalCentavos = Math.round(neto * factor * 100)
  const netoCentavos = Math.round(totalCentavos / factor)
  return { totalCentavos, netoCentavos, ivaCentavos: totalCentavos - netoCentavos }
}

/**
 * Totales de ambos documentos contra el monto ingresado.
 * @param {DocsEditables} docs
 * @param {number} montoCentavos
 * @param {number} [alicuota]
 */
export function calcularResumen(docs, montoCentavos, alicuota = ALICUOTA_IVA) {
  const factor = 1 + alicuota
  const porDoc = {
    noEfectivo: calcularTotalesDoc(docs.noEfectivo.lineas, alicuota),
    efectivo: calcularTotalesDoc(docs.efectivo.lineas, alicuota),
  }
  const totalCentavos = porDoc.noEfectivo.totalCentavos + porDoc.efectivo.totalCentavos
  const netoCentavos = Math.round(totalCentavos / factor)
  const diferenciaCentavos = montoCentavos - totalCentavos
  return {
    porDoc,
    totalCentavos,
    netoCentavos,
    ivaCentavos: totalCentavos - netoCentavos,
    montoCentavos,
    diferenciaCentavos,
    diferenciaPct: montoCentavos > 0 ? (diferenciaCentavos / montoCentavos) * 100 : 0,
    exacto: diferenciaCentavos === 0,
  }
}

// ─── Marcas internas ───────────────────────────────────────────────────────

/** @param {LineaEditable} l @returns {'agregada'|'aumentada'|'reducida'|null} */
export function marcaDe(l) {
  if (l.cantidadBase === 0) return 'agregada'
  if (l.cantidad > l.cantidadBase) return 'aumentada'
  if (l.cantidad < l.cantidadBase) return 'reducida'
  return null
}

/** El precio se editó si difiere del original en al menos medio centavo. */
export const precioEditado = (l) => Math.abs(l.precioNeto - l.precioNetoOriginal) >= 0.005

// ─── Validación de campos de edición (TASK 2, escenario 6) ─────────────────

/** @returns {{ok:true, valor:number}|{ok:false, mensaje:string}} */
export function parsearCantidad(texto) {
  const t = String(texto ?? '').trim()
  if (t === '') return { ok: false, mensaje: 'Ingresá una cantidad.' }
  if (t.startsWith('-')) return { ok: false, mensaje: 'No puede ser negativa.' }
  if (!/^\d+$/.test(t)) return { ok: false, mensaje: 'Sólo números enteros.' }
  const valor = Number(t)
  if (valor === 0) return { ok: false, mensaje: 'Debe ser mayor a 0 (para quitarla usá «Eliminar»).' }
  if (!Number.isSafeInteger(valor) || valor > CANTIDAD_MAX) return { ok: false, mensaje: `Máximo ${CANTIDAD_MAX.toLocaleString('es-AR')}.` }
  return { ok: true, valor }
}

/** @returns {{ok:true, valor:number}|{ok:false, mensaje:string}}  valor en PESOS (2 decimales) */
export function parsearPrecio(texto) {
  const r = parsearCentesimas(texto)
  if (!r.ok) {
    const m = {
      vacio: 'Ingresá un precio.', negativo: 'No puede ser negativo.',
      no_numerico: 'Ingresá sólo números (por ejemplo 1500,50).', decimales: 'Usá hasta 2 decimales.',
    }
    return { ok: false, mensaje: m[r.motivo] ?? m.no_numerico }
  }
  if (r.valor <= 0) return { ok: false, mensaje: 'Debe ser mayor a 0.' }
  if (r.valor > PRECIO_MAX_CENTAVOS) return { ok: false, mensaje: 'El precio es demasiado grande.' }
  return { ok: true, valor: pesos(r.valor) }
}

/**
 * Errores por campo de una línea, a partir de lo que hay TIPEADO.
 * @param {LineaEditable} l
 * @returns {{cantidad?: string, precio?: string}}
 */
export function erroresDeLinea(l) {
  /** @type {{cantidad?: string, precio?: string}} */
  const e = {}
  const c = parsearCantidad(l.cantidadTexto)
  if (!c.ok) e.cantidad = c.mensaje
  if (l.precioTexto !== null) {
    const p = parsearPrecio(l.precioTexto)
    if (!p.ok) e.precio = p.mensaje
  }
  return e
}

/**
 * Validación de un listado (escenario 6): errores por línea + «sin líneas».
 * Un listado que ya venía vacío (p. ej. sin base en efectivo) no es un error: no se exporta.
 * @param {DocEditable} doc
 * @param {DocEditable} original
 */
export function validarDoc(doc, original) {
  /** @type {Record<string, {cantidad?: string, precio?: string}>} */
  const porClave = {}
  for (const l of doc.lineas) {
    const e = erroresDeLinea(l)
    if (e.cantidad || e.precio) porClave[l.clave] = e
  }
  const sinLineas = doc.lineas.length === 0 && original.lineas.length > 0
  return { porClave, sinLineas, hayErrores: sinLineas || Object.keys(porClave).length > 0 }
}

// ─── Reducer de edición ────────────────────────────────────────────────────

/** @typedef {{docs: DocsEditables|null, original: DocsEditables|null, editRev: number, exportRev: number}} EstadoEdicion */

/** @type {EstadoEdicion} */
export const ESTADO_EDICION_INICIAL = Object.freeze({ docs: null, original: null, editRev: 0, exportRev: 0 })

const clonar = (docs) => ({
  noEfectivo: { lineas: docs.noEfectivo.lineas.map((l) => ({ ...l })), quitadas: docs.noEfectivo.quitadas.map((q) => ({ ...q })) },
  efectivo: { lineas: docs.efectivo.lineas.map((l) => ({ ...l })), quitadas: docs.efectivo.quitadas.map((q) => ({ ...q })) },
})

/**
 * Producto del catálogo → datos de línea nueva, con el precio de venta REGISTRADO
 * (promociones vigentes incluidas), sin IVA. Nunca un precio inventado.
 * @param {{idProducto:number,nombre:string,idCategoria?:number|null,precioUnitario:number|string}} producto
 * @param {Array<any>} promosCalculables  Resultado de `filtrarPromocionesCalculables`.
 */
export function precioNetoDeCatalogo(producto, promosCalculables) {
  const promo = resolverPromocionProducto(producto, promosCalculables ?? [])
  const bruto = promo?.reducePrecio ? promo.precioFinal : redondearPrecio(Number(producto.precioUnitario) || 0)
  return Math.round((bruto / FACTOR_IVA) * 1e8) / 1e8
}

export { filtrarPromocionesCalculables }

/**
 * @param {EstadoEdicion} estado
 * @param {{tipo: string, [k: string]: any}} a
 * @returns {EstadoEdicion}
 */
export function reducirEdicion(estado, a) {
  switch (a.tipo) {
    case 'cargar': {
      return { docs: clonar(a.docs), original: clonar(a.docs), editRev: 0, exportRev: 0 }
    }
    case 'limpiar':
      return ESTADO_EDICION_INICIAL
    case 'restablecer': {
      if (!estado.original) return estado
      return { ...estado, docs: clonar(estado.original), editRev: estado.editRev + 1, exportRev: estado.exportRev }
    }
    case 'exportado':
      return { ...estado, exportRev: estado.editRev }
    default:
      break
  }
  if (!estado.docs) return estado

  const docs = clonar(estado.docs)
  const doc = docs[a.doc]
  if (!doc) return estado

  switch (a.tipo) {
    case 'cantidad': {
      const l = doc.lineas.find((x) => x.clave === a.clave)
      if (!l) return estado
      const r = parsearCantidad(a.texto)
      l.cantidadTexto = a.texto
      if (r.ok) l.cantidad = r.valor
      break
    }
    case 'precio': {
      const l = doc.lineas.find((x) => x.clave === a.clave)
      if (!l) return estado
      const r = parsearPrecio(a.texto)
      l.precioTexto = a.texto
      if (r.ok) l.precioNeto = r.valor
      break
    }
    case 'eliminar': {
      const i = doc.lineas.findIndex((x) => x.clave === a.clave)
      if (i < 0) return estado
      const [l] = doc.lineas.splice(i, 1)
      // Si la línea venía de Facturas, queda registrada como «quitada» (informativo).
      if (l.cantidadBase > 0 && !doc.quitadas.some((q) => q.idProducto === l.idProducto)) {
        doc.quitadas.push({ idProducto: l.idProducto, nombre: l.nombre, cantidadBase: l.cantidadBase })
      }
      break
    }
    case 'agregar': {
      const { idProducto, nombre, precioNeto } = a.producto
      const existente = doc.lineas.find((x) => x.idProducto === idProducto)
      if (existente) {
        // Sin productos repetidos: se unifican sumando 1 unidad.
        const actual = parsearCantidad(existente.cantidadTexto)
        const nueva = Math.min(CANTIDAD_MAX, (actual.ok ? actual.valor : existente.cantidad) + 1)
        existente.cantidad = nueva
        existente.cantidadTexto = String(nueva)
      } else {
        const quitada = doc.quitadas.find((q) => q.idProducto === idProducto)
        doc.quitadas = doc.quitadas.filter((q) => q.idProducto !== idProducto)
        doc.lineas.push(crearLinea({
          idProducto, nombre, cantidad: 1, cantidadBase: quitada?.cantidadBase ?? 0,
          precioNeto, precioReferenciaNeto: precioNeto, activo: true,
        }))
      }
      break
    }
    default:
      return estado
  }
  return { ...estado, docs, editRev: estado.editRev + 1 }
}

/** Firma comparable de un listado (clave, cantidad y precio en centavos). */
const firma = (doc) => doc.lineas
  .map((l) => `${l.clave}|${l.cantidad}|${Math.round(l.precioNeto * 100)}|${l.cantidadTexto}|${l.precioTexto ?? ''}`)
  .join(';')

/** ¿Hay diferencias reales respecto del resultado automático? (editar y volver atrás = sin cambios) */
export function hayCambios(estado) {
  if (!estado.docs || !estado.original) return false
  return firma(estado.docs.noEfectivo) !== firma(estado.original.noEfectivo)
    || firma(estado.docs.efectivo) !== firma(estado.original.efectivo)
}

/** Ediciones que todavía no se exportaron: motivo de confirmación al regenerar (escenario 8). */
export const hayEdicionesSinExportar = (estado) => hayCambios(estado) && estado.editRev !== estado.exportRev

// ─── PDF (TASK 1 esc. 16 / TASK 2 esc. 9) ──────────────────────────────────

/**
 * Arma el `GrupoCliente[]` que consume `construirPDF` (mismo formato que Facturas).
 * Sólo viajan nombre, cantidad, precio y subtotal: las marcas internas no existen acá.
 *
 * @param {{ cliente: {idCliente:number, nombre:string, cuit:string|null}, doc: DocEditable,
 *           hasta: string, etiqueta: string, metodoPago: string, alicuota?: number }} p
 */
export function construirGruposPdf({ cliente, doc, hasta, etiqueta, metodoPago, alicuota = ALICUOTA_IVA }) {
  if (doc.lineas.length === 0) return []
  const { totalCentavos } = calcularTotalesDoc(doc.lineas, alicuota)
  const total = pesos(totalCentavos)
  return [{
    idCliente: cliente.idCliente,
    nombre: cliente.nombre,
    cuit: cliente.cuit ?? null,
    totalCliente: total,
    presupuestos: [{
      idPresupuesto: 0,
      etiqueta,
      metodoPago,
      fechaFacturacion: hasta,
      monto: total,
      items: doc.lineas.map((l) => ({
        idProducto: l.idProducto,
        nombreProducto: l.nombre,
        cantidad: l.cantidad,
        precioNeto: l.precioNeto,
        subtotalNeto: Math.round(subtotalNeto(l) * 100) / 100,
      })),
    }],
  }]
}

/** «$ 12,34 (0,05 %)» con signo explícito — ver `describirDiferencia` en la UI. */
export function describirDiferencia(difCentavos, pct, fmtMoneda, fmtPorcentaje) {
  if (difCentavos === 0) return 'Sin diferencia'
  const signo = difCentavos > 0 ? 'Faltan' : 'Sobran'
  return `${signo} ${fmtMoneda(Math.abs(pesos(difCentavos)))} (${fmtPorcentaje(Math.abs(pct))})`
}
