// src/services/notasService.js
/**
 * Acceso a datos de las notas al pie (tabla `nota_registro`).
 * Regla del proyecto: los componentes NUNCA hablan con Supabase directamente.
 *
 * Seguridad:
 *  · Ningún mensaje de la base (constraints, nombres de tablas) llega a la UI:
 *    todo error se traduce a un `ErrorNota` con texto seguro y un `codigo`.
 *  · El texto se valida de nuevo acá (defensa en profundidad) y la base lo
 *    vuelve a validar con CHECK + trigger + RLS.
 *
 * Idempotencia (Escenario 9): el CLIENTE genera el `id_nota` (UUID) por
 * intención de guardado. Reenviar el mismo INSERT (doble clic, reintento tras
 * perder la respuesta) choca con la PK y se resuelve devolviendo la nota ya
 * creada, sin duplicar. Ver `useNotas`.
 *
 * @module services/notasService
 */
import { supabase } from '../lib/supabase'
import { logger } from '../lib/logger'
import { TIPOS_REGISTRO, validarNota, mensajeErrorNota } from '../lib/notas'

const COLUMNAS = 'id_nota, texto, created_at, updated_at'
const LIMITE_LISTADO = 200

const MENSAJES = Object.freeze({
  INVALIDA:            null, // se arma con mensajeErrorNota
  PARAMETRO_INVALIDO:  'No se pudo identificar el registro de la nota.',
  SIN_PERMISO:         'No tenés permisos para modificar notas.',
  REGISTRO_INEXISTENTE:'El registro ya no existe, por lo que no se puede guardar la nota.',
  NO_ENCONTRADA:       'La nota ya no existe o fue eliminada por otro usuario.',
  CLAVE_REUTILIZADA:   'Ya existe una nota distinta con este intento de guardado. Intentá nuevamente.',
  RED:                 'No hay conexión con el servidor.',
  DESCONOCIDO:         'No se pudo completar la operación.',
})

/** Códigos para los que reintentar el MISMO envío puede funcionar. */
const REINTENTABLES = new Set(['RED', 'DESCONOCIDO', 'TIMEOUT'])

export class ErrorNota extends Error {
  /**
   * @param {keyof typeof MENSAJES | 'TIMEOUT'} codigo
   * @param {string} [mensaje] Sobrescribe el mensaje por defecto.
   */
  constructor(codigo, mensaje) {
    super(mensaje ?? MENSAJES[codigo] ?? MENSAJES.DESCONOCIDO)
    this.name = 'ErrorNota'
    this.codigo = codigo
    this.reintentable = REINTENTABLES.has(codigo)
  }
}

/** @param {{ code?: string, message?: string } | null} error @returns {ErrorNota} */
function traducirError(error) {
  const code = error?.code
  if (code === '42501')  return new ErrorNota('SIN_PERMISO')          // RLS / privilegios
  if (code === '23503')  return new ErrorNota('REGISTRO_INEXISTENTE') // FK: el registro se borró
  if (code === '23514')  return new ErrorNota('INVALIDA', 'El texto de la nota no es válido.')
  if (code === 'PGRST301' || code === 'PGRST303') return new ErrorNota('SIN_PERMISO') // JWT vencido/ inválido
  const sinRed = (typeof navigator !== 'undefined' && navigator.onLine === false)
    || /failed to fetch|networkerror|network request failed|load failed/i.test(String(error?.message ?? ''))
  return new ErrorNota(sinRed ? 'RED' : 'DESCONOCIDO')
}

/** @param {unknown} id @returns {number} */
function exigirIdEntero(id) {
  const n = Number(id)
  if (!Number.isInteger(n) || n <= 0) throw new ErrorNota('PARAMETRO_INVALIDO')
  return n
}

/** @param {string} tipo */
function exigirTipo(tipo) {
  const def = TIPOS_REGISTRO[tipo]
  if (!def) throw new ErrorNota('PARAMETRO_INVALIDO')
  return def
}

/**
 * @typedef {Object} Nota
 * @property {string}  idNota
 * @property {string}  texto
 * @property {string}  creadaEn   ISO — fecha ORIGINAL (nunca cambia al editar).
 * @property {string|null} editadaEn ISO de la última edición, o null.
 * @property {boolean} editada
 */

/** @returns {Nota|null} */
export function mapNota(row) {
  if (!row) return null
  return {
    idNota:   row.id_nota,
    texto:    row.texto,
    creadaEn: row.created_at,
    editadaEn: row.updated_at ?? null,
    editada:  row.updated_at != null,
  }
}

/**
 * Notas de un registro, de la más reciente a la más antigua.
 * `id_nota` desempata notas con el mismo timestamp → orden estable.
 * @param {string} tipo
 * @param {number|string} idRegistro
 * @returns {Promise<Nota[]>}
 */
export async function listarNotas(tipo, idRegistro) {
  const { columna } = exigirTipo(tipo)
  const id = exigirIdEntero(idRegistro)

  const { data, error } = await supabase
    .from('nota_registro')
    .select(COLUMNAS)
    .eq(columna, id)
    .order('created_at', { ascending: false })
    .order('id_nota',    { ascending: false })
    .limit(LIMITE_LISTADO)

  if (error) throw traducirError(error)
  return (data ?? []).map(mapNota)
}

/**
 * Crea una nota. IDEMPOTENTE por `idNota`.
 * @param {{ tipo: string, idRegistro: number|string, texto: string, idNota: string }} p
 * @returns {Promise<Nota>}
 */
export async function crearNota({ tipo, idRegistro, texto, idNota }) {
  const { columna } = exigirTipo(tipo)
  const id = exigirIdEntero(idRegistro)
  const v = validarNota(texto)
  if (!v.valido) throw new ErrorNota('INVALIDA', mensajeErrorNota(v))

  const { data, error } = await supabase
    .from('nota_registro')
    .insert({ id_nota: idNota, [columna]: id, texto: v.texto })
    .select(COLUMNAS)
    .single()

  if (!error) return mapNota(data)

  // 23505 = la PK ya existe → este intento YA se aplicó. Si es el mismo
  // contenido, es un reintento legítimo: se devuelve lo ya guardado.
  if (error.code === '23505') {
    const { data: previa, error: errLectura } = await supabase
      .from('nota_registro')
      .select(`${COLUMNAS}, ${columna}`)
      .eq('id_nota', idNota)
      .maybeSingle()
    if (errLectura) throw traducirError(errLectura)
    if (previa && previa[columna] === id && previa.texto === v.texto) {
      logger.info('notas.creacion_idempotente', { tipo, idRegistro: id })
      return mapNota(previa)
    }
    throw new ErrorNota('CLAVE_REUTILIZADA')
  }
  throw traducirError(error)
}

/**
 * Edita el texto. La fecha original se conserva y la marca "editada" la fija
 * el trigger de la base solo si el texto cambió.
 * @param {{ idNota: string, texto: string }} p
 * @returns {Promise<Nota>}
 */
export async function editarNota({ idNota, texto }) {
  const v = validarNota(texto)
  if (!v.valido) throw new ErrorNota('INVALIDA', mensajeErrorNota(v))

  const { data, error } = await supabase
    .from('nota_registro')
    .update({ texto: v.texto })
    .eq('id_nota', idNota)
    .select(COLUMNAS)
    .maybeSingle()

  if (error) throw traducirError(error)
  if (!data) throw new ErrorNota('NO_ENCONTRADA') // borrada, o RLS no la deja ver/modificar
  return mapNota(data)
}

/**
 * Elimina una nota.
 * @param {string} idNota
 * @returns {Promise<boolean>} `false` si no había nada que borrar (ya eliminada o sin permiso).
 */
export async function eliminarNota(idNota) {
  const { data, error } = await supabase
    .from('nota_registro')
    .delete()
    .eq('id_nota', idNota)
    .select('id_nota')

  if (error) throw traducirError(error)
  return (data?.length ?? 0) > 0
}

/**
 * Cuántas notas se perderían al eliminar un registro (Escenario 11).
 * Un presupuesto se elimina junto con su saldo: se cuentan también las del saldo.
 * @param {string} tipo
 * @param {number|string} idRegistro
 * @returns {Promise<{ propias: number, deSaldo: number }>}
 */
export async function contarNotasAfectadas(tipo, idRegistro) {
  const { columna } = exigirTipo(tipo)
  const id = exigirIdEntero(idRegistro)

  const contar = async (col, valor) => {
    const { count, error } = await supabase
      .from('nota_registro')
      .select('id_nota', { count: 'exact', head: true })
      .eq(col, valor)
    if (error) throw traducirError(error)
    return count ?? 0
  }

  const propias = await contar(columna, id)
  if (tipo !== 'presupuesto') return { propias, deSaldo: 0 }

  const { data: saldos, error } = await supabase
    .from('saldo')
    .select('id_saldo')
    .eq('id_presupuesto', id)
  if (error) throw traducirError(error)

  let deSaldo = 0
  for (const s of saldos ?? []) deSaldo += await contar('id_saldo', s.id_saldo)
  return { propias, deSaldo }
}
