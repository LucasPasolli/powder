// src/lib/promocionesConfig.js
// Fuente ÚNICA de las opciones/etiquetas del módulo de Promociones y de las reglas
// puras de selección de productos. Sin dependencias de React ni de Supabase, así
// se testea sin mocks y se reutiliza en formulario, listado y vista previa (DRY).

/**
 * «Tipo de promoción» tal como lo ve el administrador (internamente: columna `alcance`).
 * EL ORDEN DE ESTE ARRAY ES EL ORDEN DEL SELECTOR (Task 2 · Esc. 1).
 * Solo 3 opciones: no hay lugar para residuos tipo «2×1» (Task 2 · Esc. 2).
 */
export const ALCANCE_OPCIONES = Object.freeze([
  Object.freeze({ value: 'producto',  label: 'Producto específico' }),
  Object.freeze({ value: 'categoria', label: 'Categoría' }),
  Object.freeze({ value: 'global',    label: 'A todo el carrito' }),
])

export const ALCANCE_LABELS = Object.freeze(
  Object.fromEntries(ALCANCE_OPCIONES.map(({ value, label }) => [value, label])),
)

/** Valor preseleccionado al CREAR una promoción: «Producto específico». */
export const ALCANCE_POR_DEFECTO = 'producto'

/**
 * Alcance que se asume al EDITAR una fila histórica sin `alcance` definido. Es 'global'
 * (no el valor por defecto de creación) porque así se comportaba esa promoción: pasarla
 * a 'producto' la dejaría con una selección vacía y bloquearía el guardado.
 */
export const ALCANCE_HISTORICO = 'global'

/** Modalidad de descuento editable desde el formulario. */
export const MODALIDAD_OPCIONES = Object.freeze([
  Object.freeze({ value: 'porcentaje_producto', label: '% Descuento' }),
  Object.freeze({ value: 'precio_fijo',         label: 'Precio fijo' }),
])

/**
 * Etiquetas para MOSTRAR. Incluye '2x1' únicamente porque pueden existir filas
 * históricas con ese tipo: se visualizan bien, pero no se ofrece al crear/editar.
 */
export const TIPO_LABELS = Object.freeze({
  porcentaje_producto: '% Descuento',
  precio_fijo:         'Precio fijo',
  '2x1':               '2×1',
})

export const MSG_SELECCION_VACIA = 'Seleccioná al menos un producto'

/**
 * Normaliza una lista de ids: enteros positivos, sin repetidos, orden estable.
 * @param {Array<number|string|null|undefined>} ids
 * @returns {number[]}
 */
export function normalizarIds(ids) {
  const vistos = new Set()
  for (const raw of ids ?? []) {
    const n = Number(raw)
    if (Number.isInteger(n) && n > 0) vistos.add(n)
  }
  return [...vistos]
}

/**
 * Valida la selección de productos según el tipo de promoción (Task 1 · Esc. 4).
 * @param {string} alcance
 * @param {Array<{idProducto:number}>} productosSel
 * @returns {string|null} mensaje de error o null si es válida.
 */
export function validarSeleccionProductos(alcance, productosSel) {
  if (alcance !== 'producto') return null
  return normalizarIds((productosSel ?? []).map((p) => p.idProducto)).length === 0
    ? MSG_SELECCION_VACIA
    : null
}

/** yyyy-mm-dd → dd/mm/yyyy ('—' si no hay fecha). */
export function fmtFechaISO(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** «1 producto» / «3 productos». */
export const textoCantidadProductos = (n) => `${n} producto${n === 1 ? '' : 's'}`

// ─── Conflictos entre promociones de producto ────────────────────────────────
// Un producto no debería tener dos promociones de producto activas a la vez en las
// mismas fechas: `calcularPromocionParaItem` aplica solo UNA (la primera que encuentra)
// y el administrador no controla cuál. Estas funciones detectan esos solapamientos y
// traducen la decisión del usuario (¿cuál queda vigente para cada producto?) en
// cambios concretos. Las promociones de categoría y «A todo el carrito» NO cuentan
// como conflicto: tienen menor prioridad y la de producto ya les gana siempre.

/** Valor de decisión para «la promoción que estoy guardando gana en este producto». */
export const DECISION_NUEVA = 'nueva'

/** Los rangos [aIni, aFin] y [bIni, bFin] (ISO yyyy-mm-dd, inclusivos) se solapan. */
const seSuperponen = (aIni, aFin, bIni, bFin) => aIni <= bFin && bIni <= aFin

/**
 * Busca productos de la selección que ya tengan otra promoción de producto ACTIVA cuya
 * vigencia se solape con la de la promoción que se está guardando.
 *
 * @param {object} p
 * @param {Array<{idProducto:number, nombre:string|null}>} p.productosSel  Selección actual.
 * @param {string}  p.fechaInicio  ISO yyyy-mm-dd de la promoción que se guarda.
 * @param {string}  p.fechaFin
 * @param {boolean} [p.activo=true]  Una promoción inactiva no genera conflictos.
 * @param {Array<object>} p.promociones  Promociones existentes (ya mapeadas por el service).
 * @param {number|null} [p.excluirIdPromocion]  La que se está editando (no choca consigo misma).
 * @param {string}  p.hoy  ISO de hoy: las ya vencidas no cuentan.
 * @returns {Array<{idProducto:number, nombre:string|null, promos:Array<object>}>}
 */
export function detectarConflictos({
  productosSel, fechaInicio, fechaFin, activo = true,
  promociones, excluirIdPromocion = null, hoy,
}) {
  if (!activo || !fechaInicio || !fechaFin || fechaFin < fechaInicio || fechaFin < hoy) return []

  const candidatas = (promociones ?? []).filter((q) =>
    q.alcance === 'producto'
    && q.activo === true
    && q.idPromocion !== excluirIdPromocion
    && q.fechaFin >= hoy
    && seSuperponen(fechaInicio, fechaFin, q.fechaInicio, q.fechaFin),
  )

  const resultado = []
  for (const sel of productosSel ?? []) {
    const promos = candidatas
      .filter((q) => q.idsProductos?.includes(sel.idProducto))
      .sort((a, b) => a.idPromocion - b.idPromocion)
      .map(({ idPromocion, nombre, tipo, valor, fechaInicio: ini, fechaFin: fin, idsProductos }) =>
        ({ idPromocion, nombre, tipo, valor, fechaInicio: ini, fechaFin: fin, idsProductos }))
    if (promos.length) resultado.push({ idProducto: sel.idProducto, nombre: sel.nombre, promos })
  }
  return resultado
}

/**
 * Convierte las decisiones del usuario en cambios concretos.
 * `decisiones[idProducto]` = DECISION_NUEVA | id (string/number) de la promoción existente que gana.
 *
 * @returns {{
 *   pendientes: number,                                  productos aún sin decidir
 *   idsFinales: number[],                                productos con los que queda la promoción que se guarda
 *   quitar: Array<{idPromocion:number, idProducto:number}>, vínculos a eliminar de las perdedoras
 *   promosQueQuedanVacias: Array<{idPromocion:number, nombre:string}>, se desactivarán
 * }}
 */
export function construirResolucion({ idsSeleccionados, conflictos, decisiones }) {
  const quitar = new Map()
  const perdidos = new Set()
  let pendientes = 0

  const marcar = (idPromocion, idProducto) => quitar.set(`${idPromocion}:${idProducto}`, { idPromocion, idProducto })

  for (const c of conflictos ?? []) {
    const d = decisiones?.[c.idProducto]
    if (d == null) { pendientes += 1; continue }

    if (d === DECISION_NUEVA) {
      c.promos.forEach((q) => marcar(q.idPromocion, c.idProducto))
      continue
    }
    const ganadora = Number(d)
    if (!c.promos.some((q) => q.idPromocion === ganadora)) { pendientes += 1; continue } // decisión inválida
    perdidos.add(c.idProducto)
    c.promos.filter((q) => q.idPromocion !== ganadora).forEach((q) => marcar(q.idPromocion, c.idProducto))
  }

  const lista = [...quitar.values()]

  // ¿Alguna promoción existente quedaría sin productos? (el backend la desactiva)
  const infoPromos = new Map()
  for (const c of conflictos ?? []) c.promos.forEach((q) => infoPromos.set(q.idPromocion, q))
  const promosQueQuedanVacias = []
  for (const [idPromocion, q] of infoPromos) {
    const quitados = new Set(lista.filter((x) => x.idPromocion === idPromocion).map((x) => x.idProducto))
    if (quitados.size > 0 && (q.idsProductos ?? []).every((id) => quitados.has(id))) {
      promosQueQuedanVacias.push({ idPromocion, nombre: q.nombre })
    }
  }

  return {
    pendientes,
    idsFinales: normalizarIds(idsSeleccionados).filter((id) => !perdidos.has(id)),
    quitar: lista,
    promosQueQuedanVacias,
  }
}
