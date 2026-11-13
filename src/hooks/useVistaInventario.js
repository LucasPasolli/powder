// src/hooks/useVistaInventario.js
// Estado de la "vista" del Inventario (buscadores + filtros + orden) y su persistencia por pestaña.
//
// Un solo objeto de filtros (en vez de seis useState sueltos) por tres motivos:
//   1. Se restaura de una sola vez desde sessionStorage (escenario 11) con la lectura inicial perezosa.
//   2. Aplicar el panel móvil y "Limpiar filtros" son una única actualización → un solo render.
//   3. Las funciones puras de lib/inventarioFiltros reciben exactamente este objeto.
//
// La página vive en usePaginatedList; por eso se guarda con `useGuardarVista`, que la recibe de afuera.

import { useCallback, useEffect, useState } from 'react'
import { FILTROS_INICIALES } from '../lib/inventarioFiltros'
import { guardarVista, leerVista } from '../lib/inventarioVista'

/**
 * @returns {{
 *   filtros: typeof FILTROS_INICIALES,
 *   setFiltros: React.Dispatch<React.SetStateAction<typeof FILTROS_INICIALES>>,
 *   cambiarFiltro: (clave: keyof typeof FILTROS_INICIALES, valor: string | boolean) => void,
 *   aplicarFiltros: (parcial: Partial<typeof FILTROS_INICIALES>) => void,
 *   limpiarFiltros: () => void,
 *   sortKey: string, sortDir: string,
 *   setOrden: (orden: { sortKey: string, sortDir: string }) => void,
 *   toggleOrden: (clave: string) => void,
 *   paginaInicial: number,
 * }}
 */
export function useVistaInventario() {
  // Lectura única al montar: el inicializador perezoso evita tocar el storage en cada render.
  const [inicial] = useState(() => leerVista())
  const [filtros, setFiltros] = useState(inicial?.filtros ?? FILTROS_INICIALES)
  const [orden, setOrdenState] = useState({ sortKey: inicial?.sortKey ?? 'nombre', sortDir: inicial?.sortDir ?? 'asc' })

  const cambiarFiltro = useCallback((clave, valor) => {
    // Si el valor no cambia se devuelve el MISMO objeto: React descarta el render.
    setFiltros((previo) => (previo[clave] === valor ? previo : { ...previo, [clave]: valor }))
  }, [])

  const aplicarFiltros = useCallback((parcial) => setFiltros((previo) => ({ ...previo, ...parcial })), [])

  // Limpiar restablece búsquedas y filtros; el orden es una preferencia de lectura y se conserva.
  const limpiarFiltros = useCallback(() => setFiltros(FILTROS_INICIALES), [])

  const setOrden = useCallback((o) => setOrdenState({ sortKey: o.sortKey, sortDir: o.sortDir }), [])

  const toggleOrden = useCallback((clave) => {
    setOrdenState((previo) => (previo.sortKey === clave
      ? { sortKey: clave, sortDir: previo.sortDir === 'asc' ? 'desc' : 'asc' }
      : { sortKey: clave, sortDir: 'asc' }))
  }, [])

  return {
    filtros, setFiltros, cambiarFiltro, aplicarFiltros, limpiarFiltros,
    sortKey: orden.sortKey, sortDir: orden.sortDir, setOrden, toggleOrden,
    paginaInicial: inicial?.page ?? 1,
  }
}

/**
 * Guarda la vista cada vez que cambia algo que el usuario percibe como "dónde estaba parado".
 * @param {{ filtros: object, sortKey: string, sortDir: string, page: number }} vista
 */
export function useGuardarVista({ filtros, sortKey, sortDir, page }) {
  useEffect(() => {
    guardarVista({ filtros, sortKey, sortDir, page })
  }, [filtros, sortKey, sortDir, page])
}

export default useVistaInventario
