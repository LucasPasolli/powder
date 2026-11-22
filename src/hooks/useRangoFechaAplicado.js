// src/hooks/useRangoFechaAplicado.js
// Separa lo que el usuario ESCRIBE de lo que se CONSULTA (Escenario 6).
//
// En escritorio los filtros se aplican al cambiar cada campo (no hay botón «Aplicar»). Si el
// usuario deja «hasta» anterior a «desde» —aunque sea de paso, mientras corrige una fecha— no
// debe dispararse ninguna consulta: se muestra el error y el listado conserva el último
// resultado válido hasta que el rango vuelva a ser coherente.
//
// Se devuelve un objeto ESTABLE mientras el rango no cambie, así que es seguro usarlo dentro de
// `serverFilters` de usePaginatedList (que compara por contenido).

import { useEffect, useState } from 'react'
import { validarRangoFechaPago } from '../lib/saldosFiltros'

const SIN_RANGO = Object.freeze({ desde: '', hasta: '' })

/**
 * @param {string} desde  Valor escrito (ISO o '').
 * @param {string} hasta  Valor escrito (ISO o '').
 * @returns {{ aplicado: { desde: string, hasta: string }, error: string }}
 *   `aplicado`: último rango válido (el único que puede viajar al servidor).
 *   `error`: mensaje para mostrar al usuario ('' si el rango escrito es válido).
 */
export function useRangoFechaAplicado(desde, hasta) {
  const error = validarRangoFechaPago(desde, hasta)
  const [aplicado, setAplicado] = useState(() => (error ? SIN_RANGO : { desde, hasta }))

  useEffect(() => {
    if (error) return // rango inválido: no se toca lo aplicado → no hay refetch
    setAplicado((previo) => (previo.desde === desde && previo.hasta === hasta ? previo : { desde, hasta }))
  }, [error, desde, hasta])

  return { aplicado, error }
}

export default useRangoFechaAplicado
