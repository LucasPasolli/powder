// src/services/saldosService.js
// Todas las operaciones de Saldo pasan por aquí.
//
// CORRECCIÓN #8: soporte de Pago Parcial.
//   `monto`           → deuda ORIGINAL del saldo, inmutable.
//   `monto_pendiente` → remanente real, se reduce con cada imputación
//                       (ver pagosService.js / fn_aplicar_pago_cliente).
//   `estado`          → 'pendiente' | 'parcial' | 'pagado'.

import { supabase } from '../lib/supabase'
import { actualizarEstadoPresupuesto } from './presupuestosService'
import { logger } from '../lib/logger'
import { hoyISO } from '../lib/fechas'
import { CAMPO_FECHA_PAGO, validarRangoFechaPago } from '../lib/saldosFiltros'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function manejarError(operacion, error) {
  console.error(`[saldosService] ${operacion}:`, error.message)
  throw new Error(error.message)
}

function mapSaldo(row) {
  if (!row) return null
  return {
    idSaldo:          row.id_saldo,
    idPresupuesto:    row.id_presupuesto,
    idCliente:        row.id_cliente,
    fechaInicio:      row.fecha_inicio,
    // CORRECCIÓN #1: expuesto como fechaVto (consistente con el nombre del campo)
    fechaVto:         row.fecha_vto,
    monto:            Number(row.monto),
    // CORRECCIÓN #8: monto realmente adeudado hoy. Si la fila todavía no tiene
    // la columna migrada (entornos viejos), cae de vuelta a `monto` para que
    // el resto de la UI no explote mientras se aplica la migración.
    montoPendiente:   row.monto_pendiente != null ? Number(row.monto_pendiente) : Number(row.monto),
    estado:           row.estado,
    fechaPago:        row.fecha_pago,
    // CORRECCIÓN #2: alineado con los nombres que usa Saldos.jsx en la tabla
    // (clienteNombre / clienteApellido) para la lista,
    // más campos extra del cliente para la vista detalle
    clienteNombre:    row.cliente?.nombre    ?? null,
    clienteApellido:  row.cliente?.apellido  ?? null,
    apodo:            row.cliente?.apodo     ?? null,
    clienteTelefono:  row.cliente?.telefono  ?? null,
    clienteMail:      row.cliente?.mail      ?? null,
    // si viene con JOIN de presupuesto
    metodoPago:       row.presupuesto?.metodo_pago ?? null,
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Devuelve saldos con datos del cliente y presupuesto asociado.
 *
 * Parámetros de filtro/orden:
 *   estado     – 'pendiente' | 'parcial' | 'pagado' | null (todos)
 *   idCliente  – filtra por cliente exacto
 *   fechaDesde / fechaHasta – rango por fecha_inicio
 *   fechaPagoDesde / fechaPagoHasta – rango por fecha_pago, AMBOS EXTREMOS INCLUIDOS
 *              y cualquiera puede omitirse (rango abierto). Se resuelve en la base
 *              (WHERE fecha_pago >= / <=), así que los saldos sin fecha de pago
 *              (NULL) quedan excluidos automáticamente. Un rango invertido o una
 *              fecha mal formada lanza ANTES de consultar.
 *   vencidos   – true → solo con deuda activa y fechaVto < hoy
 *   ordenPor   – 'vencimiento' (default) | 'fechaPago'. Con 'fechaPago' el ORDER BY lo
 *              hace la base: NULLS LAST en ambas direcciones (los saldos sin fecha de
 *              pago van siempre al final) y desempate por id_saldo DESC (paginación estable).
 *   orden      – 'asc' | 'desc'. Con ordenPor 'vencimiento': sobre fecha_vto (con deuda)
 *              o id_saldo (pagados). Con ordenPor 'fechaPago': sobre fecha_pago.
 *   limite     – máximo de filas devueltas
 *   search     – texto libre: busca en nombre, apellido, nombre completo,
 *                idSaldo exacto e idPresupuesto exacto.
 *
 * CORRECCIÓN #5: búsqueda por texto delegada al servidor mediante el parámetro
 * `search`. Reemplaza el filtrado JS que hacía Saldos.jsx con LIKE en JS.
 * CORRECCIÓN #6: orden diferenciado — con deuda por fecha_vto,
 * pagados por id_saldo DESC.
 */
export async function obtenerSaldos({
  estado     = null,
  idCliente  = null,
  fechaDesde = null,
  fechaHasta = null,
  fechaPagoDesde = null,
  fechaPagoHasta = null,
  vencidos   = false,
  ordenPor   = 'vencimiento',
  orden      = 'asc',
  limite     = 500,
  search     = '',
} = {}) {
  // Defensa en profundidad: la UI ya valida el rango, pero el service no confía en su llamador.
  // El mensaje es genérico y seguro de mostrar (no filtra detalles de la base).
  const pagoDesde = fechaPagoDesde || null
  const pagoHasta = fechaPagoHasta || null
  const errorRango = validarRangoFechaPago(pagoDesde, pagoHasta)
  if (errorRango) throw new Error(errorRango)

  const porFechaPago = ordenPor === CAMPO_FECHA_PAGO

  let q = supabase
    .from('saldo')
    .select(`
      *,
      cliente ( nombre, apellido, apodo, telefono, mail ),
      presupuesto ( metodo_pago )
    `)
    .limit(limite)

  // Fecha de pago: columna `date` → se compara como texto ISO, sin conversión de huso horario.
  // `gte`/`lte` incluyen ambos extremos y descartan los NULL (Escenarios 4, 5 y 8).
  if (pagoDesde) q = q.gte('fecha_pago', pagoDesde)
  if (pagoHasta) q = q.lte('fecha_pago', pagoHasta)

  // Orden por fecha de pago EN EL SERVIDOR (Escenario 9): NULLS LAST en asc y en desc.
  if (porFechaPago) {
    q = q
      .order('fecha_pago', { ascending: orden !== 'desc', nullsFirst: false })
      .order('id_saldo', { ascending: false })
  }

  if (estado)     q = q.eq('estado', estado)
  if (idCliente)  q = q.eq('id_cliente', idCliente)
  if (fechaDesde) q = q.gte('fecha_inicio', fechaDesde)
  if (fechaHasta) q = q.lte('fecha_inicio', fechaHasta)

  if (vencidos) {
    const hoy = hoyISO()
    q = q.lt('fecha_vto', hoy).in('estado', ['pendiente', 'parcial'])
  }

  const { data, error } = await q
  if (error) manejarError('obtenerSaldos', error)

  let resultado = data.map(mapSaldo)

  // Búsqueda por texto (cliente-side solo si hay search, sobre datos ya filtrados)
  if (search.trim()) {
    const s = search.trim().toLowerCase()
    const esNumero = /^\d+$/.test(s)
    resultado = resultado.filter(saldo => {
      const nombre   = (saldo.clienteNombre   ?? '').toLowerCase()
      const apellido = (saldo.clienteApellido ?? '').toLowerCase()
      const completo = `${nombre} ${apellido}`
      return (
        nombre.includes(s)    ||
        apellido.includes(s)  ||
        completo.includes(s)  ||
        (esNumero && (
          saldo.idSaldo       === Number(s) ||
          saldo.idPresupuesto === Number(s)
        ))
      )
    })
  }

  // Orden por fecha de pago: ya viene ordenado de la base (NULLS LAST). NO se re-ordena acá:
  // el filtro de texto de arriba conserva el orden relativo, y un sort en JS podría romper
  // el criterio «sin fecha al final» o el desempate por id.
  if (porFechaPago) return resultado

  // CORRECCIÓN #6: orden diferenciado por estado
  const esPagado = estado === 'pagado'
  resultado.sort((a, b) => {
    if (esPagado) {
      // pagados: más reciente primero por idSaldo DESC
      return b.idSaldo - a.idSaldo
    }
    // pendientes, parciales o todos: por fechaVto
    const fa = a.fechaVto ?? ''
    const fb = b.fechaVto ?? ''
    return orden === 'asc'
      ? fa.localeCompare(fb)
      : fb.localeCompare(fa)
  })

  return resultado
}

// ─── Listado paginado EN EL SERVIDOR ─────────────────────────────────────────
// Lo usa la pantalla Saldos. A diferencia de obtenerSaldos (que trae hasta `limite` filas y
// filtra/ordena/pagina en el navegador), acá la base resuelve TODO: filtros, búsqueda, orden y
// la página pedida, y devuelve además el total exacto. No hay tope de filas.

const SELECT_SALDO_CON_RELACIONES = `
  *,
  cliente ( nombre, apellido, apodo, telefono, mail ),
  presupuesto ( metodo_pago )
`
const TAM_PAGINA_DEFAULT = 25
const TAM_PAGINA_MAX = 200
/** Tope de clientes que se resuelven por búsqueda de texto (evita URLs gigantes). */
const MAX_CLIENTES_BUSQUEDA = 500
const MAX_TOKENS_BUSQUEDA = 5
const MAX_LARGO_BUSQUEDA = 80
/** Código de PostgREST: se pidió una página más allá del último registro. */
const PGRST_RANGO_FUERA_DE_LIMITE = 'PGRST103'

/**
 * Limpia un término antes de armar un filtro `ilike` dentro de `.or(...)`.
 * Se eliminan los caracteres con significado en la sintaxis de PostgREST (coma, paréntesis,
 * comillas, barra invertida, `:`) y los comodines (`*`, `%`, `_`), para que el texto del usuario
 * nunca pueda alterar la estructura del filtro (inyección de filtros).
 */
function limpiarTerminoBusqueda(termino) {
  return termino.replace(/[,()"'\\%_*:]/g, '').trim()
}

/**
 * Traduce el texto libre del usuario a una condición `.or(...)` sobre `saldo`.
 * El nombre/apellido viven en `cliente`, así que primero se resuelven los id_cliente que
 * coinciden (cada palabra debe aparecer en nombre O apellido → «ana paz» encuentra a Ana Paz)
 * y después se filtra `saldo` por esos clientes, o por id_saldo / id_presupuesto exactos.
 *
 * @param {string} search
 * @returns {Promise<{ or: string|null, sinResultados: boolean }>}
 *   `or: null` = sin búsqueda. `sinResultados: true` = ya se sabe que nada coincide (no se consulta saldo).
 */
async function resolverBusqueda(search) {
  const texto = String(search ?? '').trim().slice(0, MAX_LARGO_BUSQUEDA)
  if (!texto) return { or: null, sinResultados: false }

  const terminos = texto
    .toLowerCase()
    .split(/\s+/)
    .map(limpiarTerminoBusqueda)
    .filter(Boolean)
    .slice(0, MAX_TOKENS_BUSQUEDA)

  const condiciones = []

  if (terminos.length > 0) {
    let qc = supabase.from('cliente').select('id_cliente').limit(MAX_CLIENTES_BUSQUEDA)
    // `.or()` encadenado se combina con AND: todas las palabras deben coincidir.
    for (const t of terminos) qc = qc.or(`nombre.ilike.*${t}*,apellido.ilike.*${t}*`)
    const { data, error } = await qc
    if (error) manejarError('obtenerSaldosPagina.buscarClientes', error)
    const ids = (data ?? []).map((c) => c.id_cliente)
    if (ids.length >= MAX_CLIENTES_BUSQUEDA) {
      logger.warn?.('obtenerSaldosPagina: la búsqueda alcanzó el tope de clientes; refiná el texto', {
        tope: MAX_CLIENTES_BUSQUEDA,
      })
    }
    if (ids.length > 0) condiciones.push(`id_cliente.in.(${ids.join(',')})`)
  }

  // Ids exactos (int4: hasta 9 dígitos, no desborda ni se interpola texto libre).
  if (/^\d{1,9}$/.test(texto)) {
    const n = Number(texto)
    condiciones.push(`id_saldo.eq.${n}`, `id_presupuesto.eq.${n}`)
  }

  return condiciones.length
    ? { or: condiciones.join(','), sinResultados: false }
    : { or: null, sinResultados: true }
}

const ESTADOS_CON_DEUDA = Object.freeze(['pendiente', 'parcial'])

/**
 * Filtros por columnas de `saldo` (compartidos por la consulta de datos y la de conteo).
 * `estado` (uno) tiene prioridad; `estados` (lista) se usa para el tramo «con deuda» de Todos.
 */
function aplicarFiltrosSaldo(q, { estado, estados, fechaPagoDesde, fechaPagoHasta, busquedaOr }) {
  if (estado) q = q.eq('estado', estado)
  else if (estados?.length) q = q.in('estado', estados)
  // Fecha de pago: columna `date` → texto ISO, sin huso. gte/lte incluyen ambos extremos
  // y descartan los NULL (Escenarios 4, 5 y 8).
  if (fechaPagoDesde) q = q.gte('fecha_pago', fechaPagoDesde)
  if (fechaPagoHasta) q = q.lte('fecha_pago', fechaPagoHasta)
  if (busquedaOr) q = q.or(busquedaOr)
  return q
}

/**
 * ORDER BY determinista (siempre termina en id_saldo → las páginas no se solapan ni saltean filas).
 *  · fechaPago: NULLS LAST en ambas direcciones (Escenario 9).
 *  · «pagado» (vencimiento): id_saldo DESC (más reciente primero), igual que antes.
 *  · «Todos» + urgencia no pasa por acá: lo resuelve obtenerPaginaTodosPorUrgencia (dos tramos).
 *  · resto: fecha_vto; en ascendente los sin vencimiento van primero y en descendente al final,
 *    replicando el criterio histórico del listado.
 */
function aplicarOrdenSaldo(q, { estado, ordenPor, orden }) {
  const asc = orden !== 'desc'
  if (ordenPor === CAMPO_FECHA_PAGO) {
    return q
      .order('fecha_pago', { ascending: asc, nullsFirst: false })
      .order('id_saldo', { ascending: false })
  }
  if (estado === 'pagado') return q.order('id_saldo', { ascending: false })
  return q
    .order('fecha_vto', { ascending: asc, nullsFirst: asc })
    .order('id_saldo', { ascending: false })
}

/**
 * «Todos» ordenado por urgencia: la deuda activa (pendiente + parcial) va SIEMPRE primero, por
 * vencimiento en la dirección pedida; los cobrados van al final, del pago más reciente al más
 * antiguo. Sin esto, los cobrados (con vencimientos viejos) aparecían como «los más urgentes».
 *
 * La base no puede ordenar por «tiene deuda» sin una columna extra, así que el listado se arma con
 * DOS TRAMOS contiguos y se pagina sobre su concatenación:
 *   [ tramo A: con deuda (nA filas) ][ tramo B: cobrados (nB filas) ]
 * Se cuentan ambos (HEAD, sin traer filas) y, según la ventana [desde, hasta] pedida, se consulta
 * solo lo necesario de cada tramo: una página casi nunca toca más de un tramo.
 *
 * @returns {Promise<{ data: object[], count: number }>}
 */
async function obtenerPaginaTodosPorUrgencia({ filtros, orden, desde, tamanio }) {
  const hasta = desde + tamanio - 1
  const filtrosBase = { ...filtros, estado: null }
  const filtrosDeuda = { ...filtrosBase, estados: ESTADOS_CON_DEUDA }
  const filtrosCobrados = { ...filtrosBase, estados: ['pagado'] }

  const contar = (f) => aplicarFiltrosSaldo(
    supabase.from('saldo').select('id_saldo', { count: 'exact', head: true }), f,
  )
  const [conteoA, conteoB] = await Promise.all([contar(filtrosDeuda), contar(filtrosCobrados)])
  if (conteoA.error) manejarError('obtenerSaldosPagina.conteoDeuda', conteoA.error)
  if (conteoB.error) manejarError('obtenerSaldosPagina.conteoCobrados', conteoB.error)
  const nA = conteoA.count ?? 0
  const nB = conteoB.count ?? 0

  const pedirTramo = async (f, ordenTramo, i, j) => {
    let q = supabase.from('saldo').select(SELECT_SALDO_CON_RELACIONES)
    q = aplicarFiltrosSaldo(q, f)
    q = aplicarOrdenSaldo(q, ordenTramo)
    const { data, error } = await q.range(i, j)
    if (error) manejarError('obtenerSaldosPagina.tramo', error)
    return data ?? []
  }

  const consultas = []
  // Tramo A: posiciones [0, nA-1] de la lista completa.
  if (desde < nA) {
    consultas.push(pedirTramo(
      filtrosDeuda, { estado: null, ordenPor: 'vencimiento', orden }, desde, Math.min(hasta, nA - 1),
    ))
  }
  // Tramo B: posiciones [nA, nA+nB-1]; se traduce la ventana a índices propios del tramo.
  const inicioB = Math.max(desde - nA, 0)
  if (hasta >= nA && inicioB < nB) {
    consultas.push(pedirTramo(
      filtrosCobrados, { estado: null, ordenPor: CAMPO_FECHA_PAGO, orden: 'desc' }, inicioB, hasta - nA,
    ))
  }

  const tramos = await Promise.all(consultas)
  return { data: tramos.flat().map(mapSaldo), count: nA + nB }
}

/**
 * Una página del listado de Saldos, resuelta por completo en la base.
 *
 * @param {object}  [p]
 * @param {string|null} [p.estado]          'pendiente' | 'parcial' | 'pagado' | null (todos)
 * @param {string}  [p.search]              Texto libre: nombre, apellido, nombre completo, id_saldo o id_presupuesto exactos.
 * @param {string|null} [p.fechaPagoDesde]  AAAA-MM-DD (inclusive). Opcional.
 * @param {string|null} [p.fechaPagoHasta]  AAAA-MM-DD (inclusive). Opcional.
 * @param {'vencimiento'|'fechaPago'} [p.ordenPor]
 * @param {'asc'|'desc'} [p.orden]
 * @param {number}  [p.page]                1-based.
 * @param {number}  [p.pageSize]            1..200.
 * @returns {Promise<{ data: object[], count: number }>} `count` = total exacto con los filtros aplicados.
 * @throws {Error} Rango de fechas inválido (antes de consultar) o error de base (mensaje seguro).
 */
export async function obtenerSaldosPagina({
  estado = null,
  search = '',
  fechaPagoDesde = null,
  fechaPagoHasta = null,
  ordenPor = 'vencimiento',
  orden = 'asc',
  page = 1,
  pageSize = TAM_PAGINA_DEFAULT,
} = {}) {
  const pagoDesde = fechaPagoDesde || null
  const pagoHasta = fechaPagoHasta || null
  const errorRango = validarRangoFechaPago(pagoDesde, pagoHasta)
  if (errorRango) throw new Error(errorRango)

  const tamanio = Math.min(Math.max(Math.floor(Number(pageSize)) || TAM_PAGINA_DEFAULT, 1), TAM_PAGINA_MAX)
  const pagina = Math.max(Math.floor(Number(page)) || 1, 1)
  const desde = (pagina - 1) * tamanio

  const busqueda = await resolverBusqueda(search)
  if (busqueda.sinResultados) return { data: [], count: 0 }

  const filtros = {
    estado,
    fechaPagoDesde: pagoDesde,
    fechaPagoHasta: pagoHasta,
    busquedaOr: busqueda.or,
  }

  // «Todos» + urgencia: deuda activa primero y cobrados al final (dos tramos, ver la función).
  if (!estado && ordenPor !== CAMPO_FECHA_PAGO) {
    return obtenerPaginaTodosPorUrgencia({ filtros, orden, desde, tamanio })
  }

  let q = supabase.from('saldo').select(SELECT_SALDO_CON_RELACIONES, { count: 'exact' })
  q = aplicarFiltrosSaldo(q, filtros)
  q = aplicarOrdenSaldo(q, { estado, ordenPor, orden })
  q = q.range(desde, desde + tamanio - 1)

  const { data, error, count } = await q

  if (error) {
    // Página fuera de rango (p. ej. se pagó el último saldo de la última página y se recarga):
    // no es un fallo. Se informa el total real para que el hook corrija la página.
    if (error.code === PGRST_RANGO_FUERA_DE_LIMITE) {
      const qc = aplicarFiltrosSaldo(
        supabase.from('saldo').select('id_saldo', { count: 'exact', head: true }),
        filtros,
      )
      const { count: total, error: errorConteo } = await qc
      if (errorConteo) manejarError('obtenerSaldosPagina.conteo', errorConteo)
      return { data: [], count: total ?? 0 }
    }
    manejarError('obtenerSaldosPagina', error)
  }

  return { data: (data ?? []).map(mapSaldo), count: count ?? (data ?? []).length }
}

/**
 * Devuelve un saldo por su ID.
 */
export async function obtenerSaldoPorId(idSaldo) {
  const { data, error } = await supabase
    .from('saldo')
    .select(`
      *,
      cliente ( nombre, apellido, apodo, telefono, mail ),
      presupuesto ( metodo_pago )
    `)
    .eq('id_saldo', idSaldo)
    .single()

  if (error) manejarError('obtenerSaldoPorId', error)
  return mapSaldo(data)
}

/**
 * Devuelve el saldo asociado a un presupuesto, si existe.
 */
export async function obtenerSaldoPorPresupuesto(idPresupuesto) {
  const { data, error } = await supabase
    .from('saldo')
    .select('*')
    .eq('id_presupuesto', idPresupuesto)
    .maybeSingle()

  if (error) manejarError('obtenerSaldoPorPresupuesto', error)
  return data ? mapSaldo(data) : null
}

/**
 * Devuelve todos los saldos con deuda activa (pendiente o parcial) de un
 * cliente específico, ordenados cronológicamente por vencimiento — este es
 * el mismo orden que usa el motor de imputación en el servidor, por eso
 * pagosService.js reutiliza esta función para la previsualización.
 */
export async function obtenerSaldosPendientesDeCliente(idCliente) {
  const { data, error } = await supabase
    .from('saldo')
    .select('*')
    .eq('id_cliente', idCliente)
    .in('estado', ['pendiente', 'parcial'])
    .order('fecha_vto', { ascending: true })

  if (error) manejarError('obtenerSaldosPendientesDeCliente', error)
  return data.map(mapSaldo)
}

/**
 * Devuelve el total de saldos pendientes (suma de montos remanentes).
 */
export async function obtenerTotalSaldosPendientes() {
  const { data, error } = await supabase
    .from('saldo')
    .select('monto_pendiente, estado')
    .in('estado', ['pendiente', 'parcial'])

  if (error) manejarError('obtenerTotalSaldosPendientes', error)
  return data.reduce((acc, row) => acc + Number(row.monto_pendiente), 0)
}

const KPIS_VACIOS = Object.freeze({
  totalPendiente: 0,
  cantPendientes: 0,
  vencidos:       0,
  cantVencidos:   0,
  totalCobrado:   0,
  cantParciales:  0,
  totalEnParcial: 0,
})

/** PostgREST limita cada respuesta (1000 filas por defecto): se lee por lotes de ese tamaño. */
const TAM_LOTE_KPIS = 1000
/** Tope de seguridad (50.000 saldos): evita un bucle sin fin ante un fallo inesperado. */
const MAX_LOTES_KPIS = 50

/**
 * Trae TODAS las filas que cumplen los filtros, por lotes con orden estable (id_saldo), para que
 * los KPIs no se trunquen silenciosamente al llegar al tope de filas por respuesta.
 */
async function leerFilasParaKpis(filtros) {
  const filas = []
  for (let lote = 0; lote < MAX_LOTES_KPIS; lote++) {
    const desde = lote * TAM_LOTE_KPIS
    let q = supabase.from('saldo').select('monto, monto_pendiente, estado, fecha_vto')
    q = aplicarFiltrosSaldo(q, filtros)
    const { data, error } = await q
      .order('id_saldo', { ascending: true })
      .range(desde, desde + TAM_LOTE_KPIS - 1)
    if (error) {
      // Un total múltiplo exacto del lote deja el lote siguiente fuera de rango: no es un fallo.
      if (error.code === PGRST_RANGO_FUERA_DE_LIMITE) break
      manejarError('obtenerKPIsSaldos', error)
    }
    filas.push(...(data ?? []))
    if ((data ?? []).length < TAM_LOTE_KPIS) break
  }
  return filas
}

/**
 * KPIs de la pantalla de Saldos, calculados sobre el MISMO conjunto que muestra el listado: acepta
 * los mismos filtros que `obtenerSaldosPagina` (estado, búsqueda y rango de fecha de pago), así
 * cifras y tabla nunca discrepan. Sin filtros equivale al total global.
 *
 * CORRECCIÓN #8 (pagos parciales): `totalCobrado` suma lo efectivamente cobrado en CADA saldo
 * (monto - monto_pendiente), por lo que un saldo con pago parcial aporta aunque siga con deuda.
 *
 * @param {object} [p]
 * @param {string|null} [p.estado]          'pendiente' | 'parcial' | 'pagado' | null (todos)
 * @param {string}      [p.search]          Mismo texto libre que el listado.
 * @param {string|null} [p.fechaPagoDesde]  AAAA-MM-DD (inclusive). Opcional.
 * @param {string|null} [p.fechaPagoHasta]  AAAA-MM-DD (inclusive). Opcional.
 * @throws {Error} Rango de fechas inválido (antes de consultar) o error de base (mensaje seguro).
 */
export async function obtenerKPIsSaldos({
  estado = null,
  search = '',
  fechaPagoDesde = null,
  fechaPagoHasta = null,
} = {}) {
  const pagoDesde = fechaPagoDesde || null
  const pagoHasta = fechaPagoHasta || null
  const errorRango = validarRangoFechaPago(pagoDesde, pagoHasta)
  if (errorRango) throw new Error(errorRango)

  const busqueda = await resolverBusqueda(search)
  if (busqueda.sinResultados) return { ...KPIS_VACIOS }

  const data = await leerFilasParaKpis({
    estado,
    fechaPagoDesde: pagoDesde,
    fechaPagoHasta: pagoHasta,
    busquedaOr: busqueda.or,
  })

  // Mismo criterio que mapSaldo: sin columna migrada, el pendiente cae al monto original.
  const pendienteDe = (s) => (s.monto_pendiente != null ? Number(s.monto_pendiente) : Number(s.monto))

  const hoy       = hoyISO()
  const conDeuda  = data.filter(s => s.estado === 'pendiente' || s.estado === 'parcial')
  const vencidos  = conDeuda.filter(s => s.fecha_vto != null && s.fecha_vto < hoy)
  const parciales = data.filter(s => s.estado === 'parcial')

  return {
    totalPendiente: conDeuda.reduce((a, s) => a + pendienteDe(s), 0),
    cantPendientes: conDeuda.length,
    vencidos:       vencidos.reduce((a, s) => a + pendienteDe(s), 0),
    cantVencidos:   vencidos.length,
    totalCobrado:   data.reduce((a, s) => a + (Number(s.monto) - pendienteDe(s)), 0),
    cantParciales:  parciales.length,
    totalEnParcial: parciales.reduce((a, s) => a + pendienteDe(s), 0),
  }
}

// ─── Mutaciones ───────────────────────────────────────────────────────────────

/**
 * Crea un nuevo saldo (cuenta corriente) asociado a un presupuesto.
 * CORRECCIÓN #8: inicializa monto_pendiente = monto (deuda completa al crear).
 */
export async function crearSaldo(saldo) {
  const { data, error } = await supabase
    .from('saldo')
    .insert({
      id_presupuesto:  saldo.idPresupuesto,
      id_cliente:      saldo.idCliente,
      fecha_inicio:    saldo.fechaInicio,
      fecha_vto:       saldo.fechaVto   ?? null,
      monto:           saldo.monto,
      monto_pendiente: saldo.monto,
      estado:          saldo.estado     ?? 'pendiente',
      fecha_pago:      saldo.fechaPago  ?? null,
    })
    .select()
    .single()

  if (error) manejarError('crearSaldo', error)
  return mapSaldo(data)
}

/**
 * Marca un saldo como pagado en su totalidad (cancela cualquier remanente),
 * con la fecha de pago indicada. Útil para saldar de una sola vez un saldo
 * pendiente o cancelar el remanente de uno que ya tenía un pago parcial.
 *
 * Para imputar un pago que puede no cubrir el total (y potencialmente
 * repartirse entre varios saldos del cliente), usar
 * `pagosService.registrarPagoParcial` en su lugar — esa es la vía atómica.
 *
 * CORRECCIÓN #4: también actualiza el estado del Presupuesto asociado a 'pagado'.
 */
/**
 * Marca un saldo como pagado en su totalidad (cancela cualquier remanente),
 * con la fecha de pago indicada. Útil para saldar de una sola vez un saldo
 * pendiente o cancelar el remanente de uno que ya tenía un pago parcial.
 *
 * CORRECCIÓN (cierre de remanente): antes esto era un UPDATE directo sobre
 * `saldo`, sin dejar rastro en `pago` / `pago_aplicacion`. Si el saldo ya
 * venía de un pago parcial (estado 'parcial'), eso rompía dos cosas río
 * abajo que SÍ dependen de ese ledger:
 *   1. El "Historial de pagos aplicados" del detalle del Saldo no mostraba
 *      cuándo se había cobrado ese último tramo — parecía que nunca se
 *      hubiera registrado.
 *   2. El PDF de Facturas (que agrupa cobros vía `pago_aplicacion`) no veía
 *      el cierre: el presupuesto volvía a listarse como venta completa por
 *      el monto ORIGINAL en el período de cierre, duplicando lo que ya se
 *      había facturado en períodos anteriores como pagos parciales.
 *
 * Ahora, si el saldo estaba en 'parcial', se inserta un `pago` +
 * `pago_aplicacion` representando el cobro del remanente, exactamente con
 * la misma forma que deja `fn_aplicar_pago_cliente` — así ambos consumidores
 * (detalle de Saldo y reporte de Facturas) lo ven de forma consistente.
 *
 * Un saldo que se paga de una sola vez desde 'pendiente' (nunca pasó por
 * 'parcial') sigue exactamente igual que antes: sin fila en
 * `pago_aplicacion`, tal como espera la RPC `obtener_presupuestos_facturables`
 * para tratarlo como una venta normal (sin esto se duplicaría al revés).
 *
 * ⚠️ Nota de atomicidad: a diferencia de `fn_aplicar_pago_cliente` (que corre
 * en una transacción de Postgres con FOR UPDATE), esto son 3 llamadas
 * separadas desde el cliente. Para este flujo — cerrar UN saldo puntual que
 * ya se está mirando en el detalle — el riesgo de carrera es bajo, pero si
 * en el futuro se vuelve un flujo de alto tráfico concurrente, conviene
 * moverlo a una RPC dedicada para que quede atómico.
 *
 * Para imputar un pago que puede no cubrir el total (y potencialmente
 * repartirse entre varios saldos del cliente), usar
 * `pagosService.registrarPagoParcial` en su lugar — esa es la vía atómica.
 *
 * @param {number} idSaldo
 * @param {number} idPresupuesto
 * @param {string} fechaPago
 * @param {string} [metodoPago='otro'] Método usado para cobrar el remanente.
 *   Solo se usa (y solo se persiste en el ledger) cuando el saldo venía de
 *   estado 'parcial'; se ignora para el cierre directo de un 'pendiente'.
 */
export async function marcarSaldoPagado(idSaldo, idPresupuesto, fechaPago, metodoPago = 'otro') {
  const { data: actual, error: errFetch } = await supabase
    .from('saldo')
    .select('estado, monto_pendiente, id_cliente')
    .eq('id_saldo', idSaldo)
    .single()

  if (errFetch) manejarError('marcarSaldoPagado:fetch', errFetch)

  const remanente = Number(actual.monto_pendiente)

  // Solo dejamos rastro en el ledger si había un pago parcial en curso.
  if (actual.estado === 'parcial' && remanente > 0) {
    const { data: userData } = await supabase.auth.getUser()

    const { data: pago, error: errPago } = await supabase
      .from('pago')
      .insert({
        id_cliente:  actual.id_cliente,
        monto:       remanente,
        fecha:       fechaPago,
        metodo_pago: metodoPago,
        descripcion: `Cancelación de remanente — Saldo #${idSaldo}`,
        creado_por:  userData?.user?.id ?? null,
      })
      .select()
      .single()

    if (errPago) manejarError('marcarSaldoPagado:pago', errPago)

    const { error: errAplicacion } = await supabase
      .from('pago_aplicacion')
      .insert({
        id_pago:          pago.id_pago,
        id_saldo:         idSaldo,
        monto_aplicado:   remanente,
        saldo_anterior:   remanente,
        saldo_resultante: 0,
      })

    if (errAplicacion) manejarError('marcarSaldoPagado:aplicacion', errAplicacion)
  }

  const { error } = await supabase
    .from('saldo')
    .update({
      estado:          'pagado',
      monto_pendiente: 0,
      fecha_pago:      fechaPago,
    })
    .eq('id_saldo', idSaldo)

  if (error) manejarError('marcarSaldoPagado', error)

  // Propagar el estado al presupuesto asociado. Para Cuenta Corriente la
  // fecha de cobro "de la verdad" es `saldo.fecha_pago` (la que usa la RPC
  // de Facturas), pero igual espejamos `fechaPago` en el presupuesto para
  // que el detalle en Historial.jsx muestre un dato consistente sin tener
  // que ir a buscar el saldo — es puramente informativo, ninguna consulta
  // de facturación/estadísticas depende de este valor para CC.
  await actualizarEstadoPresupuesto(idPresupuesto, 'pagado', { fechaPago })
}

/**
 * Actualiza el monto y/o la fecha de vencimiento de un saldo.
 * CORRECCIÓN #8: si cambia `monto`, el remanente (`monto_pendiente`) se
 * recalcula preservando lo que ya se cobró, en vez de resetearse — evita que
 * editar el monto de un saldo con pago parcial "borre" el cobro ya recibido.
 */
export async function actualizarSaldo(idSaldo, { monto, fechaVto }) {
  const campos = {}
  if (fechaVto !== undefined) campos.fecha_vto = fechaVto ?? null

  if (monto !== undefined) {
    const { data: actual, error: errFetch } = await supabase
      .from('saldo')
      .select('monto, monto_pendiente')
      .eq('id_saldo', idSaldo)
      .single()
    if (errFetch) manejarError('actualizarSaldo:fetch', errFetch)

    const yaCobrado     = Number(actual.monto) - Number(actual.monto_pendiente)
    const nuevoPendiente = Math.max(0, Number(monto) - yaCobrado)

    campos.monto           = monto
    campos.monto_pendiente = nuevoPendiente
    campos.estado          = nuevoPendiente <= 0
      ? 'pagado'
      : (nuevoPendiente < Number(monto) ? 'parcial' : 'pendiente')
  }

  const { error } = await supabase
    .from('saldo')
    .update(campos)
    .eq('id_saldo', idSaldo)

  if (error) manejarError('actualizarSaldo', error)
}

/**
 * @typedef {object} ResultadoReversionPago
 * @property {number}  idSaldo
 * @property {number}  idPresupuesto
 * @property {string}  estadoSaldoAnterior
 * @property {boolean} presupuestoRevertido        `true` si el presupuesto estaba
 *   'pagado' y volvió a 'aprobado' (con `fecha_pago` limpia).
 * @property {number}  aplicacionesEliminadas      Cobros imputados que se borraron.
 * @property {number}  montoAplicacionesEliminadas
 */

/**
 * Revierte el pago de un saldo de forma ATÓMICA (RPC `fn_revertir_pago_saldo`,
 * ver sql/2026_revertir_pago_saldo.sql):
 *
 *   · el saldo vuelve a 'pendiente' por su monto ORIGINAL completo, sin fecha
 *     de pago,
 *   · se eliminan los cobros imputados (`pago_aplicacion` + cabeceras `pago`
 *     huérfanas): el saldo debe el 100% y el ledger tiene que decir lo mismo,
 *     si no Estadísticas/Facturas contarían dos veces,
 *   · si el presupuesto estaba 'pagado' vuelve a 'aprobado' y su `fecha_pago`
 *     se limpia → se reactiva la posibilidad de volver a registrar el cobro.
 *
 * Antes era un UPDATE directo sobre `saldo`: el presupuesto quedaba 'pagado'
 * y los cobros parciales seguían sumando en los KPIs.
 *
 * ⚠️ Es un revert "de golpe": no hay reversión parcial de un cobro puntual.
 * Los llamadores deben pedir confirmación explícita (ver ABMC.jsx).
 *
 * @param {number} idSaldo
 * @returns {Promise<ResultadoReversionPago>}
 * @throws {Error} con mensaje apto para mostrar al usuario.
 */
export async function revertirPagoSaldo(idSaldo) {
  const id = Number(idSaldo)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Identificador de saldo inválido.')
  }

  const { data, error } = await supabase.rpc('fn_revertir_pago_saldo', { p_id_saldo: id })

  if (error) {
    console.error('[saldosService] revertirPagoSaldo:', error.message)
    throw new Error('No se pudo revertir el pago. Reintentá; si el problema persiste, contactá al administrador.')
  }
  if (!data?.encontrado) {
    throw new Error('El saldo ya no existe (pudo haber sido eliminado desde otra sesión). Actualizá la lista.')
  }

  const resultado = {
    idSaldo:                     data.idSaldo,
    idPresupuesto:               data.idPresupuesto,
    estadoSaldoAnterior:         data.estadoSaldoAnterior,
    presupuestoRevertido:        Boolean(data.presupuestoRevertido),
    estadoPresupuestoAnterior:   data.estadoPresupuestoAnterior ?? null,
    estadoPresupuestoActual:     data.estadoPresupuestoActual ?? null,
    aplicacionesEliminadas:      Number(data.aplicacionesEliminadas ?? 0),
    montoAplicacionesEliminadas: Number(data.montoAplicacionesEliminadas ?? 0),
    pagosHuerfanosEliminados:    Number(data.pagosHuerfanosEliminados ?? 0),
  }

  logger.warn('saldo.pago_revertido', resultado)

  return resultado
}

/**
 * @typedef {object} ResultadoEliminacionSaldo
 * @property {number}  idSaldo
 * @property {number}  idPresupuesto
 * @property {string}  estadoSaldoEliminado
 * @property {boolean} presupuestoRevertido        `true` si el presupuesto estaba
 *   'pagado' y volvió a 'aprobado' (con `fecha_pago` limpia).
 * @property {string|null} estadoPresupuestoAnterior
 * @property {string|null} estadoPresupuestoActual
 * @property {number}  aplicacionesEliminadas      Cobros imputados que se borraron.
 * @property {number}  montoAplicacionesEliminadas
 * @property {number}  pagosHuerfanosEliminados
 */

/**
 * Elimina un saldo de forma ATÓMICA y consistente (RPC
 * `fn_eliminar_saldo_con_reversion`, ver sql/2026_eliminar_saldo_con_reversion.sql):
 *
 *   · borra los cobros imputados al saldo (dejan de contarse en Estadísticas
 *     y en el PDF de Facturación),
 *   · borra el saldo,
 *   · si el presupuesto estaba 'pagado' lo devuelve a 'aprobado' y limpia su
 *     fecha de pago → se reactiva el botón de cobro en Historial.
 *
 * Antes esto era un DELETE directo sobre `saldo`: dejaba el presupuesto en
 * 'pagado' para siempre (sin saldo que respaldara ese estado) y los cobros
 * parciales huérfanos seguían sumando en los KPIs.
 *
 * Los errores de base se loguean pero NO se propagan crudos a la UI
 * (podrían revelar nombres de tablas/constraints).
 *
 * @param {number} idSaldo
 * @returns {Promise<ResultadoEliminacionSaldo>}
 * @throws {Error} con mensaje apto para mostrar al usuario.
 */
export async function eliminarSaldo(idSaldo) {
  const id = Number(idSaldo)
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Identificador de saldo inválido.')
  }

  const { data, error } = await supabase.rpc('fn_eliminar_saldo_con_reversion', {
    p_id_saldo: id,
  })

  if (error) {
    console.error('[saldosService] eliminarSaldo:', error.message)
    throw new Error('No se pudo eliminar el saldo. Reintentá; si el problema persiste, contactá al administrador.')
  }
  if (!data?.encontrado) {
    throw new Error('El saldo ya no existe (pudo haber sido eliminado desde otra sesión). Actualizá la lista.')
  }

  const resultado = {
    idSaldo:                     data.idSaldo,
    idPresupuesto:               data.idPresupuesto,
    estadoSaldoEliminado:        data.estadoSaldoEliminado,
    presupuestoRevertido:        Boolean(data.presupuestoRevertido),
    estadoPresupuestoAnterior:   data.estadoPresupuestoAnterior ?? null,
    estadoPresupuestoActual:     data.estadoPresupuestoActual ?? null,
    aplicacionesEliminadas:      Number(data.aplicacionesEliminadas ?? 0),
    montoAplicacionesEliminadas: Number(data.montoAplicacionesEliminadas ?? 0),
    pagosHuerfanosEliminados:    Number(data.pagosHuerfanosEliminados ?? 0),
  }

  // Trazabilidad de una operación financiera sensible.
  logger.warn('saldo.eliminado', resultado)

  return resultado
}

const DIAS_CC = { cc15: 15, cc30: 30 }

/**
 * Vencimiento por defecto de un presupuesto de CC: fecha de emisión + plazo
 * (15 o 30 días). Aritmética en UTC sobre 'YYYY-MM-DD': sin corrimientos por huso.
 * Pura y exportada para que la UI pueda precargar el mismo valor que usa el servicio.
 *
 * @param {string} fechaEmision 'YYYY-MM-DD'
 * @param {string} metodoPago   'cc15' | 'cc30'
 * @returns {string} 'YYYY-MM-DD'
 */
export function calcularVencimientoCC(fechaEmision, metodoPago) {
  const dias = DIAS_CC[metodoPago]
  if (!dias) throw new Error('Solo los presupuestos de cuenta corriente tienen vencimiento.')
  const vto = new Date(`${fechaEmision}T00:00:00Z`)
  vto.setUTCDate(vto.getUTCDate() + dias)
  return vto.toISOString().slice(0, 10)
}

// 'YYYY-MM-DD' con calendario real (rechaza 2026-02-31, que Date "corrige" solo).
function esFechaISOValida(f) {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false
  const d = new Date(`${f}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f
}

/**
 * Regenera el saldo pendiente de un presupuesto de Cuenta Corriente que se
 * quedó sin saldo (p. ej. tras eliminarlo desde ABMC). Es idempotente: si ya
 * existe uno lo devuelve tal cual, y ante un doble click (violación de la
 * UNIQUE sobre id_presupuesto) también.
 *
 * Fechas del saldo regenerado:
 *   · fecha_inicio = fecha de emisión del presupuesto.
 *   · fecha_vto    = `opts.fechaVto` si se indica; si no, emisión + plazo
 *     (ver `calcularVencimientoCC`). Puede quedar en el pasado (el plazo
 *     corre desde la emisión): la UI lo advierte y deja elegir otra fecha.
 *   · fecha_pago   = NULL (la define quien vuelva a cobrar).
 *
 * Reutilizada por el flujo de "Aprobar" en Historial (sin `fechaVto`).
 *
 * @param {{idPresupuesto:number, idCliente:number, metodoPago:string, fecha:string, monto:number}} presupuesto
 * @param {{ fechaVto?: string|null }} [opts]
 */
export async function regenerarSaldoDePresupuesto(presupuesto, { fechaVto = null } = {}) {
  if (!DIAS_CC[presupuesto?.metodoPago]) {
    throw new Error('Solo los presupuestos de cuenta corriente tienen saldo.')
  }

  // Validar ANTES de tocar la base.
  let vencimiento = calcularVencimientoCC(presupuesto.fecha, presupuesto.metodoPago)
  if (fechaVto != null && fechaVto !== '') {
    if (!esFechaISOValida(fechaVto)) {
      throw new Error('La fecha de vencimiento no es válida.')
    }
    if (fechaVto < presupuesto.fecha) {
      throw new Error('El vencimiento no puede ser anterior a la fecha de emisión del presupuesto.')
    }
    vencimiento = fechaVto
  }

  const existente = await obtenerSaldoPorPresupuesto(presupuesto.idPresupuesto)
  if (existente) return existente

  try {
    return await crearSaldo({
      idPresupuesto: presupuesto.idPresupuesto,
      idCliente:     presupuesto.idCliente,
      fechaInicio:   presupuesto.fecha,
      fechaVto:      vencimiento,
      monto:         presupuesto.monto,
      estado:        'pendiente',
    })
  } catch (err) {
    const yaCreado = await obtenerSaldoPorPresupuesto(presupuesto.idPresupuesto)
    if (yaCreado) return yaCreado
    throw err
  }
}

/**
 * Elimina el saldo asociado a un presupuesto específico.
 */
export async function eliminarSaldoPorPresupuesto(idPresupuesto) {
  const { error } = await supabase
    .from('saldo')
    .delete()
    .eq('id_presupuesto', idPresupuesto)

  if (error) manejarError('eliminarSaldoPorPresupuesto', error)
}
