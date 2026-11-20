// src/lib/encargos.js
/**
 * Reglas PURAS (sin React ni red) de los encargos de cliente.
 * Fuente única para servicio, hooks y componentes (DRY) y testeable sin mocks.
 *
 *   Pendiente ──► En proceso ──► Completado
 *       │             │
 *       └─────────────┴──────► Cancelado
 *
 * La base de datos hace cumplir las mismas reglas (CHECKs, trigger de transiciones,
 * RPC): esto sólo decide qué muestra y qué permite la UI. Ver
 * sql/20261117_01_encargos_cliente.sql.
 *
 * @module lib/encargos
 */
import { normalizarTexto } from './busquedaProductos'
import { MEDIDAS_VALIDAS } from './medidasProducto'

// ─── Estados ─────────────────────────────────────────────────────────────────

export const ESTADO_ENCARGO = Object.freeze({
  PENDIENTE: 'pendiente',
  EN_PROCESO: 'en_proceso',
  COMPLETADO: 'completado',
  CANCELADO: 'cancelado',
})

/** Etiquetas visibles (único punto de verdad del texto de cada estado). */
export const ETIQUETA_ESTADO_ENCARGO = Object.freeze({
  [ESTADO_ENCARGO.PENDIENTE]: 'Pendiente',
  [ESTADO_ENCARGO.EN_PROCESO]: 'En proceso',
  [ESTADO_ENCARGO.COMPLETADO]: 'Completado',
  [ESTADO_ENCARGO.CANCELADO]: 'Cancelado',
})

/** Orden de los filtros por estado en el listado. */
export const ESTADOS_ENCARGO = Object.freeze(Object.values(ESTADO_ENCARGO))

// ─── Límites (espejan los de la base: ck_detalle_encargo_cantidad y RPC) ──────

export const LIMITE_ITEMS_ENCARGO = 100
export const LIMITE_CANTIDAD_ENCARGO = 999_999
export const LIMITE_ENCARGOS_POR_PEDIDO = 50

// ─── Reglas de estado ────────────────────────────────────────────────────────

const estadoDe = (encargo) => encargo?.estado ?? null

/** Task 2 · E1 y E6: sólo los «Pendiente» se pueden añadir a un pedido (los cancelados NO). */
export const estaDisponibleParaPedido = (encargo) => estadoDe(encargo) === ESTADO_ENCARGO.PENDIENTE

/** Task 2 · E5 y E7: se puede cancelar mientras no esté completado ni cancelado. */
export const puedeCancelarEncargo = (encargo) =>
  estadoDe(encargo) === ESTADO_ENCARGO.PENDIENTE || estadoDe(encargo) === ESTADO_ENCARGO.EN_PROCESO

/** Task 2 · E7: cancelar uno «En proceso» exige advertir antes (hay un pedido activo). */
export const requiereAdvertenciaAlCancelar = (encargo) => estadoDe(encargo) === ESTADO_ENCARGO.EN_PROCESO

// ─── Líneas ──────────────────────────────────────────────────────────────────

const hayValor = (v) => v !== null && v !== undefined && String(v).trim() !== ''

/** Medida normalizada: `null` si vacía. */
export const normalizarMedida = (medida) => (hayValor(medida) ? String(medida).trim() : null)

/** Identidad de una línea: mismo producto + misma medida (igual que el índice único de la base). */
export const claveLinea = ({ idProducto, medida }) => `${Number(idProducto)}:${normalizarMedida(medida) ?? ''}`

/**
 * Cantidad entera válida (1…LIMITE) o `null`. Acepta número o texto de dígitos;
 * rechaza vacío, 0, negativos, decimales, notación científica y valores gigantes.
 * @param {unknown} valor
 * @returns {number|null}
 */
export function parsearCantidad(valor) {
  const texto = typeof valor === 'number' ? String(valor) : String(valor ?? '').trim()
  if (!/^\d{1,7}$/.test(texto)) return null
  const n = Number(texto)
  return n >= 1 && n <= LIMITE_CANTIDAD_ENCARGO ? n : null
}

// ─── Validación del formulario (Task 1 · E4) ─────────────────────────────────

/**
 * @typedef {Object} LineaForm
 * @property {string}  uid             Identidad estable de la fila en la UI (key de React).
 * @property {number}  idProducto
 * @property {string}  nombreProducto
 * @property {boolean} tieneMedidas
 * @property {string|null} medida
 * @property {string|number} cantidad  Texto del input.
 *
 * @typedef {Object} ErrorLinea
 * @property {string} [medida]
 * @property {string} [cantidad]
 * @property {string} [repetida]
 *
 * @typedef {Object} ResultadoValidacion
 * @property {boolean} valido
 * @property {string}  [cliente]                    Mensaje del campo cliente.
 * @property {string}  [productos]                  Mensaje del bloque de productos.
 * @property {Record<string, ErrorLinea>} lineas    Por `uid` de línea (no por índice: sobrevive a reordenar/quitar).
 * @property {string[]} faltantes                   Lista legible para el resumen.
 * @property {string}  resumen                      Texto del resumen ('' si es válido).
 */

/**
 * Valida el borrador de un encargo. Pura. Devuelve TODOS los problemas de una vez
 * (el usuario no corrige de a uno): campos faltantes, cantidades inválidas, medidas
 * obligatorias y líneas repetidas.
 * @param {{ cliente: {idCliente:number}|null, lineas: LineaForm[] }} borrador
 * @returns {ResultadoValidacion}
 */
export function validarEncargo({ cliente, lineas }) {
  /** @type {ResultadoValidacion} */
  const r = { valido: true, lineas: {}, faltantes: [], resumen: '' }

  if (!cliente?.idCliente) {
    r.cliente = 'Seleccioná el cliente del encargo.'
    r.faltantes.push('cliente')
  }

  if (!lineas?.length) {
    r.productos = 'Agregá al menos un producto.'
    r.faltantes.push('al menos un producto')
  } else if (lineas.length > LIMITE_ITEMS_ENCARGO) {
    r.productos = `Un encargo admite hasta ${LIMITE_ITEMS_ENCARGO} productos.`
    r.faltantes.push(`máximo ${LIMITE_ITEMS_ENCARGO} productos`)
  }

  const vistas = new Map() // claveLinea → número de la primera aparición (1-based)
  ;(lineas ?? []).forEach((l, i) => {
    const n = i + 1
    /** @type {ErrorLinea} */
    const err = {}

    if (parsearCantidad(l.cantidad) === null) {
      err.cantidad = `Ingresá una cantidad entera entre 1 y ${LIMITE_CANTIDAD_ENCARGO.toLocaleString('es-AR')}.`
      r.faltantes.push(`cantidad del producto ${n}`)
    }

    if (l.tieneMedidas) {
      const medida = normalizarMedida(l.medida)
      if (medida === null) {
        err.medida = 'Elegí la medida.'
        r.faltantes.push(`medida del producto ${n}`)
      } else if (!MEDIDAS_VALIDAS.includes(medida)) {
        err.medida = 'La medida elegida no es válida.'
        r.faltantes.push(`medida del producto ${n}`)
      }
    }

    // Repetidos: mismo producto + misma medida. Una línea sin medida elegida ya está marcada
    // por su propio error; no se la marca además como repetida.
    if (!err.medida) {
      const clave = claveLinea({ idProducto: l.idProducto, medida: l.tieneMedidas ? l.medida : null })
      if (vistas.has(clave)) {
        err.repetida = `Repetido: es igual al producto ${vistas.get(clave)}. Unilos en una sola línea.`
        r.faltantes.push(`producto ${n} repetido`)
      } else {
        vistas.set(clave, n)
      }
    }

    if (err.medida || err.cantidad || err.repetida) r.lineas[l.uid] = err
  })

  r.valido = r.faltantes.length === 0
  if (!r.valido) r.resumen = `Revisá el encargo antes de guardarlo. Falta o es inválido: ${r.faltantes.join(', ')}.`
  return r
}

/**
 * Líneas del formulario → `p_detalles` del RPC. Pura. Asume un borrador ya validado.
 * Una línea sin «medidas» nunca envía medida (no se arrastran valores de otro producto).
 * @param {LineaForm[]} lineas
 */
export function construirDetallesEncargo(lineas) {
  return lineas.map((l) => ({
    id_producto: Number(l.idProducto),
    medida: l.tieneMedidas ? normalizarMedida(l.medida) : null,
    cantidad: parsearCantidad(l.cantidad),
  }))
}

// ─── Task 2 · E2: de encargo a líneas del pedido ─────────────────────────────

/**
 * @typedef {Object} LineaPedidoForm  (shape del formulario de NuevoPedido)
 * @property {string|number} idProducto
 * @property {string} nombreProducto
 * @property {string|number} cantidad
 * @property {string|number} precioUnitario
 * @property {string|null} medida
 * @property {boolean} tieneMedidas
 */

const esLineaVacia = (it) => !it?.idProducto && !hayValor(it?.nombreProducto)
const cantidadNum = (v) => parseInt(String(v ?? ''), 10) || 0
const mismaLinea = (it, d) => String(it.idProducto) === String(d.idProducto) &&
  (normalizarMedida(it.medida) ?? '') === (normalizarMedida(d.medida) ?? '')

/**
 * Incorpora las líneas de un encargo a las del pedido. Pura (no muta).
 *  · Descarta la fila en blanco que trae el formulario nuevo.
 *  · Si ya hay una línea del mismo producto y medida, SUMA la cantidad (no duplica filas).
 *  · El precio se autocompleta con el precio de proveedor vigente (igual que al elegir
 *    el producto a mano); si no hay, queda vacío para que lo ingrese el usuario.
 * @param {LineaPedidoForm[]} items
 * @param {{ detalles: Array<{idProducto:number, nombreProducto:string, medida:string|null,
 *           cantidad:number, tieneMedidas?:boolean, precioProveedor?:number}> }} encargo
 * @returns {LineaPedidoForm[]}
 */
export function agregarEncargoAItems(items, encargo) {
  const detalles = encargo?.detalles ?? []
  if (detalles.length === 0) return items

  const resultado = items.filter((it) => !esLineaVacia(it)).map((it) => ({ ...it }))
  for (const d of detalles) {
    const existente = resultado.find((it) => mismaLinea(it, d))
    if (existente) {
      existente.cantidad = cantidadNum(existente.cantidad) + d.cantidad
      continue
    }
    resultado.push({
      idProducto: d.idProducto,
      nombreProducto: d.nombreProducto,
      cantidad: d.cantidad,
      precioUnitario: (d.precioProveedor ?? 0) > 0 ? d.precioProveedor : '',
      medida: normalizarMedida(d.medida),
      tieneMedidas: Boolean(d.tieneMedidas),
    })
  }
  return resultado
}

/**
 * Operación inversa de `agregarEncargoAItems` (al quitar un encargo antes de guardar):
 * resta sus cantidades y elimina las líneas que quedan en 0. Pura (no muta).
 * Si el usuario ya había cambiado una cantidad a mano, nunca queda negativa.
 * @param {LineaPedidoForm[]} items
 * @param {{ detalles: Array<{idProducto:number, medida:string|null, cantidad:number}> }} encargo
 * @returns {LineaPedidoForm[]}  Puede quedar vacío: el llamador decide si repone una fila en blanco.
 */
export function quitarEncargoDeItems(items, encargo) {
  const resultado = items.map((it) => ({ ...it }))
  for (const d of encargo?.detalles ?? []) {
    const idx = resultado.findIndex((it) => mismaLinea(it, d))
    if (idx === -1) continue
    const restante = cantidadNum(resultado[idx].cantidad) - d.cantidad
    if (restante > 0) resultado[idx].cantidad = restante
    else resultado.splice(idx, 1)
  }
  return resultado
}

// ─── Presentación ────────────────────────────────────────────────────────────

/** «Pérez, Ana» · si falta algún dato, lo que haya. */
export function nombreCompletoCliente(cliente) {
  if (!cliente) return 'Cliente desconocido'
  const ap = (cliente.apellido ?? '').trim()
  const no = (cliente.nombre ?? '').trim()
  if (ap && no) return `${ap}, ${no}`
  return ap || no || 'Cliente desconocido'
}

/** «2 × Lente A · 0.50» */
export function descripcionLinea(d) {
  const medida = normalizarMedida(d.medida)
  return `${d.cantidad} × ${d.nombreProducto}${medida ? ` · ${medida === 'standard' ? 'Standard' : medida}` : ''}`
}

/**
 * Filtro de texto en memoria (sin tildes, varias palabras en cualquier orden) sobre
 * cliente, apodo, comercio, ID del encargo y productos pedidos. Nunca arma consultas
 * con el texto del usuario (no hay superficie de inyección).
 * @param {Array<object>} encargos
 * @param {string} texto
 */
export function filtrarEncargos(encargos, texto) {
  const tokens = normalizarTexto(texto).split(' ').filter(Boolean)
  if (tokens.length === 0) return encargos
  return encargos.filter((e) => {
    const pajar = normalizarTexto([
      `#${e.idEncargo}`, e.idEncargo,
      e.cliente?.nombre, e.cliente?.apellido, e.cliente?.apodo, e.cliente?.nombreComercio,
      ...(e.detalles ?? []).map((d) => d.nombreProducto),
    ].filter((x) => x !== undefined && x !== null).join(' '))
    return tokens.every((t) => pajar.includes(t))
  })
}

/** Primeras `max` líneas + cuántas quedan ocultas (para tarjetas y tablas compactas). */
export function resumirLineas(detalles, max = 3) {
  const lista = detalles ?? []
  return { visibles: lista.slice(0, max), ocultas: Math.max(0, lista.length - max) }
}
