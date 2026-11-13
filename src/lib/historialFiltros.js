// src/lib/historialFiltros.js
// Reglas entre los filtros «Método de pago» y «Estado» del Historial de presupuestos.
//
// Antes vivían como condicionales dentro de los `onChange` del JSX de escritorio. Se
// extraen para que el filtro de escritorio y el panel móvil apliquen EXACTAMENTE la
// misma regla (DRY) y para poder probarla sin renderizar nada.
//
// La regla: un presupuesto de CONTADO (efectivo / transferencia / split) nunca queda
// «Aprobado» (ese estado es propio de Cuenta Corriente) y uno de CUENTA CORRIENTE
// (cc15 / cc30) nunca queda «Pagado» por sí mismo. Combinaciones imposibles = lista vacía.

/** Cuenta corriente a 15 o 30 días. */
export const esMetodoCC = (m) => m === 'cc15' || m === 'cc30'

/** Cobro de contado (nunca pasa por Cuenta Corriente): efectivo, transferencia o split. */
export const esFiltroContado = (m) => m === 'efectivo' || m === 'transferencia' || m === 'split'

/** ¿Tiene sentido ofrecer este método con el estado elegido? */
export function metodoCompatibleConEstado(metodo, estado) {
  const cc = esMetodoCC(metodo)
  if (estado === 'pagado' && cc) return false
  if (estado === 'aprobado' && !cc) return false
  return true
}

/** ¿Tiene sentido ofrecer este estado con el método elegido? */
export function estadoCompatibleConMetodo(estado, metodo) {
  if (estado === 'pagado' && esMetodoCC(metodo)) return false
  if (estado === 'aprobado' && esFiltroContado(metodo)) return false
  return true
}

/**
 * Tras cambiar `metodo` o `estado`, deja el par coherente reiniciando a «todos» el OTRO campo
 * cuando la nueva elección lo vuelve imposible. Devuelve un objeto nuevo (no muta).
 *
 * @param {'metodo'|'estado'} cambio  Campo que acaba de cambiar.
 * @param {{metodo: string, estado: string}} siguiente  Valores ya con el cambio aplicado.
 */
export function reconciliarMetodoEstado(cambio, siguiente) {
  const { metodo, estado } = siguiente
  if (cambio === 'metodo') {
    if (esMetodoCC(metodo) && estado === 'pagado') return { ...siguiente, estado: 'all' }
    if (esFiltroContado(metodo) && estado === 'aprobado') return { ...siguiente, estado: 'all' }
  }
  if (cambio === 'estado') {
    if (estado === 'pagado' && esMetodoCC(metodo)) return { ...siguiente, metodo: 'all' }
    if (estado === 'aprobado' && esFiltroContado(metodo)) return { ...siguiente, metodo: 'all' }
  }
  return siguiente
}
