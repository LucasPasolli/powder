// src/services/promocionesService.js
// Todas las operaciones de Promocion pasan por aquí.
// La lógica de cálculo de precios con promoción también vive aquí,
// reemplazando completamente a src/lib/promociones.js.

import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { CODIGOS, ErrorOperacion, mapearErrorSeguro } from './idempotencia'
import { normalizarIds } from '../lib/promocionesConfig'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Registra el detalle técnico en el log (estructurado y saneado) y lanza un
 * ErrorOperacion con un mensaje APTO PARA EL USUARIO. Nunca se propaga
 * `error.message` crudo de Postgres a la UI (OWASP A05 / CWE-209).
 */
function manejarError(operacion, error) {
  logger.error(`promociones.${operacion}`, { error })
  throw new ErrorOperacion(mapearErrorSeguro(error))
}

/**
 * SELECT común. Los productos asociados viven en la tabla puente
 * `promocion_producto` (N por promoción); se traen embebidos con su nombre.
 */
const SELECT_PROMOCION = `
  *,
  categoria ( nombre ),
  promocion_producto ( id_producto, producto ( nombre ) )
`

const porNombre = (a, b) =>
  (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es', { sensitivity: 'base' }) ||
  a.idProducto - b.idProducto

function mapPromocion(row) {
  if (!row) return null

  const vinculos  = Array.isArray(row.promocion_producto) ? row.promocion_producto : []
  const productos = vinculos
    .map((v) => ({ idProducto: v.id_producto, nombre: v.producto?.nombre ?? null }))
    .sort(porNombre)

  return {
    idPromocion:  row.id_promocion,
    nombre:       row.nombre,
    descripcion:  row.descripcion,
    tipo:         row.tipo,
    alcance:      row.alcance,
    idCategoria:  row.id_categoria,
    fechaInicio:  row.fecha_inicio,
    fechaFin:     row.fecha_fin,
    valor:        row.valor != null ? Number(row.valor) : null,
    activo:       row.activo,
    // Productos asociados (alcance = 'producto'). `idsProductos` es lo que consume
    // calcularPromocionParaItem; `productos` es lo que muestra la UI.
    productos,
    idsProductos: productos.map((p) => p.idProducto),
    // si viene con JOIN
    nombreCategoria: row.categoria?.nombre ?? null,
  }
}

/**
 * Traduce una promoción del dominio a los argumentos tipados de las RPC
 * `crear_promocion` / `actualizar_promocion`. Pura → testeable sin red.
 * Los ids solo viajan si el alcance es 'producto' (el backend lo exige).
 */
export function construirArgsRpc(promo, quitarDeOtras = []) {
  return {
    p_nombre:        promo.nombre,
    p_tipo:          promo.tipo,
    p_alcance:       promo.alcance,
    p_fecha_inicio:  promo.fechaInicio,
    p_fecha_fin:     promo.fechaFin,
    p_descripcion:   promo.descripcion ?? null,
    p_id_categoria:  promo.alcance === 'categoria' ? (promo.idCategoria ?? null) : null,
    p_valor:         promo.valor ?? null,
    p_activo:        promo.activo ?? true,
    p_ids_productos: promo.alcance === 'producto' ? normalizarIds(promo.idsProductos) : [],
    // Conflictos resueltos por el usuario: vínculos producto↔promoción a quitar de otras
    // promociones, dentro de la misma transacción.
    p_quitar: promo.alcance === 'producto'
      ? quitarDeOtras.map(({ idPromocion, idProducto }) => ({ id_promocion: idPromocion, id_producto: idProducto }))
      : [],
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Devuelve todas las promociones con sus productos (N) y categoría asociados.
 * Equivale a:
 *   SELECT pr.*, c.nombre, array_agg(pp.id_producto)
 *   FROM promocion pr
 *   LEFT JOIN categoria c ON pr.id_categoria = c.id_categoria
 *   LEFT JOIN promocion_producto pp ON pp.id_promocion = pr.id_promocion
 *   ORDER BY pr.fecha_inicio DESC
 */
export async function obtenerPromociones({
  soloActivas = false,
  orden       = 'desc',
} = {}) {
  let q = supabase
    .from('promocion')
    .select(SELECT_PROMOCION)
    .order('fecha_inicio', { ascending: orden === 'asc' })

  if (soloActivas) q = q.eq('activo', true)

  const { data, error } = await q
  if (error) manejarError('obtenerPromociones', error)
  return data.map(mapPromocion)
}

/**
 * Devuelve las promociones vigentes a la fecha indicada.
 * "Vigente" = activo = true AND fechaInicio <= fecha AND fechaFin >= fecha.
 * Equivale a la query principal de src/lib/promociones.js (calcularPromocion).
 * Usado en: Presupuestador.jsx al agregar un ítem al carrito.
 */
export async function obtenerPromocionesVigentes(fecha = null) {
  const hoy = fecha ?? new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('promocion')
    .select(SELECT_PROMOCION)
    .eq('activo', true)
    .lte('fecha_inicio', hoy)
    .gte('fecha_fin', hoy)

  if (error) manejarError('obtenerPromocionesVigentes', error)
  return data.map(mapPromocion)
}

/**
 * Devuelve una promoción por su ID.
 * Equivale a: SELECT * FROM Promocion WHERE idPromocion = ?
 */
export async function obtenerPromocionPorId(idPromocion) {
  const { data, error } = await supabase
    .from('promocion')
    .select(SELECT_PROMOCION)
    .eq('id_promocion', idPromocion)
    .single()

  if (error) manejarError('obtenerPromocionPorId', error)
  return mapPromocion(data)
}

// ─── Mutaciones ───────────────────────────────────────────────────────────────

/**
 * Crea una promoción junto con sus productos asociados en UNA transacción
 * (RPC `crear_promocion`): o se guarda todo o no se guarda nada.
 * @param {object} promo  { nombre, descripcion, tipo, alcance, idsProductos[], idCategoria,
 *                          fechaInicio, fechaFin, valor, activo }
 * @param {{ quitarDeOtras?: Array<{idPromocion:number, idProducto:number}> }} [opciones]
 *        Productos a quitar de OTRAS promociones (resolución de conflictos). Si una queda
 *        sin productos se desactiva. Todo en la misma transacción.
 * @returns {Promise<{ idPromocion: number }>}
 */
export async function crearPromocion(promo, { quitarDeOtras = [] } = {}) {
  const { data, error } = await supabase.rpc('crear_promocion', construirArgsRpc(promo, quitarDeOtras))
  if (error) manejarError('crearPromocion', error)
  return { idPromocion: data }
}

/**
 * Actualiza una promoción y sincroniza sus productos (agrega/quita según la nueva
 * selección) en UNA transacción (RPC `actualizar_promocion`).
 */
export async function actualizarPromocion(idPromocion, promo, { quitarDeOtras = [] } = {}) {
  const { error } = await supabase.rpc('actualizar_promocion', {
    p_id_promocion: idPromocion,
    ...construirArgsRpc(promo, quitarDeOtras),
  })
  if (error) manejarError('actualizarPromocion', error)
}

/**
 * Activa o desactiva una promoción sin borrarla.
 * Equivale a: UPDATE Promocion SET activo = ? WHERE idPromocion = ?
 * Usado en: Promociones.jsx (toggle activo/inactivo).
 */
export async function togglePromocion(idPromocion, activo) {
  const { error } = await supabase
    .from('promocion')
    .update({ activo })
    .eq('id_promocion', idPromocion)

  if (error) manejarError('togglePromocion', error)
}

/**
 * Elimina una promoción. Los vínculos en `promocion_producto` caen por
 * ON DELETE CASCADE. Los presupuestos ya generados NO se alteran:
 * `detalle_presupuesto.id_promocion` no tiene FK y `precio_con_promo` /
 * `subtotal` son un snapshot al momento de la venta.
 *
 * PostgREST responde 204 aunque RLS impida borrar (0 filas). Por eso se pide
 * `.select()` y se valida que realmente se haya eliminado una fila; si no, se
 * informa como error en vez de mostrar un falso "éxito".
 */
export async function eliminarPromocion(idPromocion) {
  const { data, error } = await supabase
    .from('promocion')
    .delete()
    .eq('id_promocion', idPromocion)
    .select('id_promocion')

  if (error) manejarError('eliminarPromocion', error)
  if (!data?.length) {
    manejarError('eliminarPromocion', { code: CODIGOS.RECURSO_NO_ENCONTRADO, message: 'sin filas afectadas' })
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LÓGICA DE CÁLCULO DE PRECIOS CON PROMOCIÓN
// Reemplaza completamente a src/lib/promociones.js
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dada una lista de promociones vigentes y un ítem del carrito,
 * devuelve la promoción aplicable y el precio final calculado.
 *
 * Orden de prioridad (de mayor a menor especificidad):
 *   1. Promoción de producto         (alcance = 'producto'; el producto debe estar
 *                                     entre sus `idsProductos`)
 *   2. Promoción de categoría        (alcance = 'categoria')
 *   3. Promoción global              (alcance = 'global')
 *
 * Esta función es PURA (sin side effects) — recibe datos y devuelve resultado.
 * Equivale a calcularPromocion() de src/lib/promociones.js.
 *
 * @param {Object}   item       - Ítem del carrito { idProducto, idCategoria, precioUnitario, cantidad }
 * @param {Array}    promos     - Lista de promociones vigentes (resultado de obtenerPromocionesVigentes)
 * @returns {{ promoAplicada, precioFinal, ahorro }}
 */
export function calcularPromocionParaItem(item, promos) {
  if (!promos?.length) {
    return { promoAplicada: null, precioFinal: item.precioUnitario, ahorro: 0 }
  }

  // 1. Buscar por especificidad descendente
  const promoProducto  = promos.find(p =>
    p.alcance === 'producto'  && p.idsProductos?.includes(item.idProducto)
  )
  const promoCategoria = promos.find(p =>
    p.alcance === 'categoria' && p.idCategoria === item.idCategoria
  )
  const promoGlobal    = promos.find(p =>
    p.alcance === 'global'
  )

  const promo = promoProducto ?? promoCategoria ?? promoGlobal

  if (!promo) {
    return { promoAplicada: null, precioFinal: item.precioUnitario, ahorro: 0 }
  }

  let precioFinal = item.precioUnitario
  let ahorro      = 0

  switch (promo.tipo) {

    case 'porcentaje_producto': {
      // Descuento porcentual sobre el precio unitario
      const descuento = item.precioUnitario * (promo.valor / 100)
      precioFinal = Math.max(0, item.precioUnitario - descuento)
      ahorro      = descuento
      break
    }

    case 'precio_fijo': {
      // Precio fijo absoluto, independiente del precio unitario
      precioFinal = Math.max(0, promo.valor)
      ahorro      = Math.max(0, item.precioUnitario - precioFinal)
      break
    }

    case '2x1': {
      // En una compra de N unidades, solo se cobran la mitad (redondeando hacia arriba)
      // El ahorro se refleja en el precio unitario efectivo
      const unidadesPagas = Math.ceil(item.cantidad / 2)
      const totalConPromo = item.precioUnitario * unidadesPagas
      precioFinal = item.cantidad > 0
        ? totalConPromo / item.cantidad
        : item.precioUnitario
      ahorro = item.precioUnitario - precioFinal
      break
    }

    default:
      break
  }

  return {
    promoAplicada: promo,
    precioFinal:   Math.round(precioFinal * 100) / 100, // redondear a 2 decimales
    ahorro:        Math.round(ahorro      * 100) / 100,
  }
}

/**
 * Aplica promociones a todos los ítems de un carrito de una sola vez.
 * Carga las promociones vigentes una sola vez y las reutiliza para cada ítem.
 * Evita el antipatrón de llamar a la BD una vez por cada producto del carrito.
 *
 * @param {Array}  items  - Ítems del carrito
 * @param {string} fecha  - Fecha de referencia 'YYYY-MM-DD' (default: hoy)
 * @returns {Array}       - Ítems con { ...item, promoAplicada, precioFinal, ahorro }
 */
export async function aplicarPromocionesACarrito(items, fecha = null) {
  if (!items?.length) return []

  // Una sola llamada a la BD para todas las promociones vigentes
  const promos = await obtenerPromocionesVigentes(fecha)

  return items.map(item => {
    const { promoAplicada, precioFinal, ahorro } = calcularPromocionParaItem(item, promos)
    return {
      ...item,
      promoAplicada,
      precioConPromo: promoAplicada ? precioFinal : null,
      idPromocion:    promoAplicada?.idPromocion ?? null,
      ahorro,
    }
  })
}