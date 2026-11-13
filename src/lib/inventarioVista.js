// src/lib/inventarioVista.js
// Persistencia de la "vista" del Inventario (filtros + orden + página) para el escenario 11:
// al abrir un producto y volver, los criterios y la página se conservan.
//
// Decisiones:
//   · sessionStorage (no localStorage): sobrevive a navegar, recargar y volver con "Atrás" dentro de la
//     pestaña, pero NO arrastra filtros viejos a una sesión de trabajo nueva (otro día / otra pestaña).
//   · Lo guardado es input no confiable (el storage lo puede editar el usuario o venir de otra versión):
//     `sanearVista` valida TODO contra listas cerradas y tipos antes de usarlo (OWASP A08).
//   · Nunca guarda datos sensibles: solo texto de búsqueda y valores de filtros.
//   · Capa pura con storage inyectable: se testea sin navegador. Toda falla de storage (modo privado,
//     cuota llena, storage bloqueado) se absorbe: persistir es una mejora, jamás puede romper la pantalla.

import { FILTROS_INICIALES, TODOS, VALORES_STOCK, MAX_CARACTERES_NOMBRE } from './inventarioFiltros'
import { sanitizarDigitosId } from './busquedaProductos'
import { parseOrden } from './inventarioUtils'
import { logger } from './logger'

export const CLAVE_VISTA = 'inventario.vista.v1'
const MAX_PAGINA = 100_000

/** @returns {Storage | null} */
function sesion() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null // acceder a sessionStorage puede lanzar (cookies bloqueadas)
  }
}

const esIdONada = (v) => v === TODOS || (typeof v === 'string' && /^\d{1,10}$/.test(v))

/**
 * Valida y normaliza una vista leída del storage. Cualquier campo inválido cae a su valor por defecto.
 * @param {unknown} crudo
 * @returns {{ filtros: typeof FILTROS_INICIALES, sortKey: string, sortDir: string, page: number }}
 */
export function sanearVista(crudo) {
  const o = crudo && typeof crudo === 'object' ? /** @type {any} */ (crudo) : {}
  const f = o.filtros && typeof o.filtros === 'object' ? o.filtros : {}
  const { sortKey, sortDir } = parseOrden(`${o.sortKey}:${o.sortDir}`)
  const page = Number.isInteger(o.page) && o.page >= 1 && o.page <= MAX_PAGINA ? o.page : 1
  return {
    filtros: {
      searchNombre: typeof f.searchNombre === 'string' ? f.searchNombre.slice(0, MAX_CARACTERES_NOMBRE) : '',
      searchId: sanitizarDigitosId(f.searchId),
      filterCat: esIdONada(f.filterCat) ? f.filterCat : TODOS,
      filterProveedor: esIdONada(f.filterProveedor) ? f.filterProveedor : TODOS,
      filterStock: VALORES_STOCK.includes(f.filterStock) ? f.filterStock : TODOS,
      filterBajoStock: f.filterBajoStock === true,
    },
    sortKey,
    sortDir,
    page,
  }
}

/**
 * @param {Storage | null} [storage]
 * @returns {ReturnType<typeof sanearVista> | null}  null si no hay nada guardado o está corrupto.
 */
export function leerVista(storage = sesion()) {
  if (!storage) return null
  try {
    const texto = storage.getItem(CLAVE_VISTA)
    return texto ? sanearVista(JSON.parse(texto)) : null
  } catch (error) {
    logger.warn('inventario.vista.lectura_fallida', { error })
    return null
  }
}

/**
 * @param {{ filtros: object, sortKey: string, sortDir: string, page: number }} vista
 * @param {Storage | null} [storage]
 */
export function guardarVista(vista, storage = sesion()) {
  if (!storage) return
  try {
    storage.setItem(CLAVE_VISTA, JSON.stringify(sanearVista(vista)))
  } catch (error) {
    logger.warn('inventario.vista.escritura_fallida', { error })
  }
}

/** @param {Storage | null} [storage] */
export function borrarVista(storage = sesion()) {
  try { storage?.removeItem(CLAVE_VISTA) } catch { /* idem: no crítico */ }
}
