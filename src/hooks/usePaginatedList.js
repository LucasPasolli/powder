// src/hooks/usePaginatedList.js
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

/**
 * usePaginatedList
 * ────────────────────────────────────────────────────────────────────────
 * Hook genérico para listas paginadas (tablas de Inventario, Saldos,
 * PedidosCompra, Historial, ABMC, etc.) que centraliza un patrón que se
 * repetía -y se rompía independientemente- en cada página: mantener la
 * página actual de la tabla al recargar datos tras crear/editar/eliminar
 * un registro, sin dejar de resetear a la página 1 cuando el usuario
 * cambia un filtro, una búsqueda o el orden.
 *
 * GARANTÍA de este hook (la regla que se estaba rompiendo antes):
 *   - `reload()` — pensado para usarse en el `onSaved`/`onDeleted` de un
 *     modal de alta/edición — NUNCA resetea `page`.
 *   - Cambiar `serverFilters` o `clientFilters` SIEMPRE resetea `page` a 1.
 *   - Si tras una recarga `page` queda fuera de rango (se eliminó el
 *     último registro de la última página, un filtro redujo el resultado,
 *     etc.) se ajusta automáticamente al máximo válido en vez de dejar la
 *     tabla vacía. Ese ajuste NO corre mientras se está cargando: con los
 *     datos todavía vacíos `totalPages` vale 1 y pisaría la página
 *     restaurada (ver `initialPage`).
 *   - `initialPage` permite ARRANCAR en una página distinta de la 1 (p. ej.
 *     al volver a una pantalla cuya vista se guardó). El reset a la página 1
 *     solo ocurre cuando los filtros CAMBIAN de verdad respecto del render
 *     anterior, no al montar.
 *
 * Soporta los dos esquemas de paginación que conviven en el proyecto:
 *
 *  mode: 'client' (default)
 *    `fetcher(serverFilters)` devuelve el array COMPLETO (puede venir ya
 *    filtrado/ordenado por el backend si `serverFilters` se usa para eso
 *    dentro del propio fetcher — p. ej. Saldos). El hook aplica
 *    `clientFilter`/`sort` en memoria (si se pasan — p. ej. Inventario,
 *    o el filtro de proveedor en PedidosCompra) y pagina con `slice()`.
 *
 *  mode: 'server'
 *    `fetcher({ ...serverFilters, page, pageSize })` devuelve
 *    `{ data, count }`. El propio fetcher resuelve el offset/limit contra
 *    el backend (p. ej. Supabase `.range()`), como ya hace Historial.
 *
 * @param {object}   opts
 * @param {Function} opts.fetcher
 *   mode 'client': `(serverFilters) => Promise<Array>`
 *   mode 'server': `(params: serverFilters & {page, pageSize}) => Promise<{data: Array, count: number}>`
 * @param {object}   [opts.serverFilters={}]
 *   Filtros que se le pasan al fetcher. Cambiar cualquiera dispara un
 *   refetch y resetea `page` a 1. No hace falta memoizar el objeto: se
 *   compara por contenido (JSON.stringify), no por identidad.
 * @param {object}   [opts.clientFilters={}]
 *   Filtros/orden aplicados solo en memoria (mode 'client'). Cambiar
 *   cualquiera resetea `page` a 1 pero NO dispara un refetch al backend.
 * @param {(item:any, clientFilters:object) => boolean} [opts.clientFilter]
 *   Predicado de filtrado en memoria. Se re-ejecuta cuando cambian los
 *   datos crudos o `clientFilters`.
 * @param {(a:any, b:any, clientFilters:object) => number} [opts.sort]
 *   Comparador de orden en memoria.
 * @param {number}          [opts.pageSize=50]
 * @param {number}          [opts.initialPage=1]  Página inicial (se ajusta al rango válido al terminar de cargar).
 * @param {'client'|'server'} [opts.mode='client']
 *
 * @returns {{
 *   pageItems: any[],     // página actual — lo que se renderiza en <tbody>
 *   items: any[],         // lista completa filtrada/ordenada, SIN paginar
 *                          // (mode server: igual a pageItems, ya que el
 *                          // filtrado ocurre en el backend)
 *   rawItems: any[],      // datos crudos del fetcher, antes de clientFilter/sort
 *                          // (solo relevante en mode 'client')
 *   page: number,
 *   setPage: Function,
 *   totalPages: number,
 *   totalCount: number,
 *   pageSize: number,
 *   loading: boolean,
 *   error: Error|null,
 *   reload: () => Promise<void>,  // refresca SIN resetear la página
 * }}
 */
export function usePaginatedList({
  fetcher,
  serverFilters = {},
  clientFilters = {},
  clientFilter,
  sort,
  pageSize = 50,
  mode = 'client',
  initialPage = 1,
} = {}) {
  const [rawItems, setRawItems] = useState([])  // mode client: data cruda del fetcher
  const [serverItems, setServerItems] = useState([]) // mode server: página devuelta por el backend
  const [count,    setCount]    = useState(0)    // mode server: total reportado por el backend
  const [page,     setPage]     = useState(initialPage)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  // Claves de cambio por contenido: el consumidor puede pasar un literal
  // `{ ... }` nuevo en cada render (como ya hacía todo el proyecto) sin
  // necesidad de envolverlo en useMemo.
  const serverKey = JSON.stringify(serverFilters)
  const clientKey = JSON.stringify(clientFilters)

  // Refs para que clientFilter/sort no formen parte de la identidad de
  // `load` — son puramente de post-procesamiento en memoria y no deberían
  // disparar un refetch al backend.
  const fetcherRef      = useRef(fetcher);      fetcherRef.current      = fetcher
  const clientFilterRef = useRef(clientFilter); clientFilterRef.current = clientFilter
  const sortRef         = useRef(sort);         sortRef.current         = sort
  const reqIdRef        = useRef(0) // descarta respuestas de requests anteriores

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError(null)
    try {
      if (mode === 'server') {
        const { data, count: total } = await fetcherRef.current({ ...serverFilters, page, pageSize })
        if (reqId !== reqIdRef.current) return
        setServerItems(data)
        setCount(total ?? data.length)
      } else {
        const data = await fetcherRef.current(serverFilters)
        if (reqId !== reqIdRef.current) return
        setRawItems(data)
      }
    } catch (err) {
      if (reqId !== reqIdRef.current) return
      console.error('[usePaginatedList] Error cargando datos:', err)
      setError(err)
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
    // `page` solo debe formar parte de la identidad de `load` en mode
    // 'server' (ahí sí hay que refetchear al cambiar de página). En mode
    // 'client' se pasa como `null` para no invalidar `load` en cada click
    // de "Siguiente" — la paginación en ese modo es un simple slice().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, serverKey, pageSize, mode === 'server' ? page : null])

  useEffect(() => { load() }, [load])

  // Reset a página 1 únicamente cuando cambia un filtro/búsqueda/orden real
  // — NUNCA por un reload() disparado tras crear/editar/eliminar un
  // registro. Esta es la corrección central: antes, el propio `load()`
  // reseteaba `page`, así que guardar un registro en la página 3 volvía a
  // la página 1.
  //
  // Se compara contra la clave del render anterior (y no se resetea "siempre
  // que corra el efecto") para que montar con `initialPage` > 1 no la pise:
  // tampoco se resetea en el doble montaje de StrictMode.
  const clavesPrevRef = useRef(`${serverKey}|${clientKey}`)
  useEffect(() => {
    const claves = `${serverKey}|${clientKey}`
    if (clavesPrevRef.current === claves) return
    clavesPrevRef.current = claves
    setPage(1)
  }, [serverKey, clientKey])

  // mode 'client': aplica filtro + orden en memoria sobre la data cruda. Se DERIVA con useMemo (y no
  // con un efecto + estado): así `items` es coherente en el MISMO render en que llegan los datos, sin
  // un render intermedio con la lista vacía que haría "saltar" la página restaurada a la 1.
  const items = useMemo(() => {
    if (mode !== 'client') return serverItems
    let result = [...rawItems]
    if (clientFilterRef.current) result = result.filter((item) => clientFilterRef.current(item, clientFilters))
    if (sortRef.current) result = result.sort((a, b) => sortRef.current(a, b, clientFilters))
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, serverItems, rawItems, clientKey])

  const totalCount = mode === 'server' ? count : items.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Salvaguarda: si la página actual queda fuera de rango tras una
  // recarga o un cambio de filtro que redujo el resultado, la ajustamos al
  // máximo válido en vez de dejar la tabla vacía.
  // Mientras carga (o si falló) `items` puede estar vacío por falta de datos, no por un filtro:
  // ajustar ahí perdería la página del usuario.
  useEffect(() => {
    if (loading || error) return
    setPage((p) => Math.min(p, totalPages))
  }, [totalPages, loading, error])

  const pageItems = mode === 'server'
    ? items
    : items.slice((page - 1) * pageSize, page * pageSize)

  return {
    pageItems,
    items,
    rawItems,
    page,
    setPage,
    totalPages,
    totalCount,
    pageSize,
    loading,
    error,
    reload: load,
  }
}

export default usePaginatedList
