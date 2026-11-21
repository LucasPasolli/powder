// src/components/inventario/FiltrosInventario.jsx
// Barra de búsqueda y filtros del Inventario. UNA sola fuente de estado (la pantalla) y DOS presentaciones:
//
//   Desktop (≥ 1025 px): tarjeta con una grilla — Nombre (2fr) · ID (mín. 9 rem: que su rótulo no parta en
//     dos líneas y desalinee los inputs) · Categoría · Proveedor · Stock. Cada cambio se aplica al instante.
//   Mobile/tablet (≤ 1024 px): patrón único del sistema <FiltrosMovil>. Los DOS buscadores quedan siempre
//     visibles y rotulados (nombre junto al botón «Filtros»; ID debajo); categoría, proveedor, stock,
//     bajo stock y orden van en el panel con borrador («Aplicar»).
//
// Filtros dependientes: las opciones de cada desplegable se calculan con `opcionesFaceta` (lib pura):
// sólo se ofrecen valores que dejan resultados dadas todas las demás condiciones. «Promoción» es la
// excepción: SIEMPRE ofrece «Todos / En promoción / Sin promoción» (con su cantidad, aunque sea 0).
//
// Desktop: 2 filas (Nombre + ID / 4 desplegables) y, desde 2xl, una sola fila de 6 columnas. Con la
// sidebar de 224 px, seis columnas en una fila no entran en 1025–1535 px sin truncar los rótulos.

import { useMemo } from 'react'
import { Hash } from 'lucide-react'
import { Card } from '../ui'
import FiltrosMovil from '../ui/FiltrosMovil'
import { CampoBusqueda, CampoSelect } from './CamposFiltro'
import ResumenCriterios from './ResumenCriterios'
import { sanitizarDigitosId, MAX_DIGITOS_ID } from '../../lib/busquedaProductos'
import {
  FILTROS_INICIALES, MAX_CARACTERES_NOMBRE, TODOS, describirCriterios, opcionesFaceta,
} from '../../lib/inventarioFiltros'
import { SORT_OPCIONES, parseOrden, valorOrden } from '../../lib/inventarioUtils'

const UNIVERSO_STOCK = [{ value: 'con', label: 'Con stock' }, { value: 'sin', label: 'Sin stock' }]
const UNIVERSO_PROMOCION = [{ value: 'con', label: 'En promoción' }, { value: 'sin', label: 'Sin promoción' }]
const AYUDA_PROMOCION_NO_DISPONIBLE = 'No disponible: no se pudieron cargar las promociones.'
const ETIQUETA_TODOS = 'Todos'

const AYUDA_NOMBRE = 'Todas las palabras, en cualquier orden.'
const AYUDA_ID = 'Solo números. ID exacto.'

/**
 * @param {object} props
 * @param {boolean} props.esCompacto           Mobile/tablet (≤ 1024 px) → panel de filtros.
 * @param {typeof FILTROS_INICIALES} props.filtros
 * @param {(clave: string, valor: string | boolean) => void} props.onCambiar
 * @param {(parcial: object) => void} props.onAplicar   Varios filtros de una vez (panel móvil).
 * @param {() => void} props.onLimpiar
 * @param {any[]} props.catalogo               Todos los productos activos (base de las opciones dependientes).
 * @param {Array<{ idCategoria: number, nombre: string }>} props.categorias
 * @param {Array<{ idProveedor: number, nombreComercial?: string, nombreFiscal: string }>} props.proveedores
 * @param {string} props.sortKey
 * @param {string} props.sortDir
 * @param {(orden: { sortKey: string, sortDir: string }) => void} props.onOrden
 * @param {number} props.mostrados
 * @param {number} props.total
 * @param {boolean} [props.promocionesDisponibles]  `false` si falló la carga de promociones: el filtro se deshabilita.
 */
export default function FiltrosInventario({
  esCompacto, filtros, onCambiar, onAplicar, onLimpiar, catalogo, categorias, proveedores,
  sortKey, sortDir, onOrden, mostrados, total, promocionesDisponibles = true,
}) {
  const universoCat = useMemo(
    () => categorias.map((c) => ({ value: String(c.idCategoria), label: c.nombre })), [categorias])
  const universoProv = useMemo(
    () => proveedores.map((p) => ({ value: String(p.idProveedor), label: p.nombreComercial || p.nombreFiscal })), [proveedores])

  const universoDe = (faceta) => {
    if (faceta === 'categoria') return universoCat
    if (faceta === 'proveedor') return universoProv
    return faceta === 'promocion' ? UNIVERSO_PROMOCION : UNIVERSO_STOCK
  }
  const opciones = (f, faceta) => opcionesFaceta({
    catalogo, filtros: f, faceta, etiquetaTodos: ETIQUETA_TODOS, universo: universoDe(faceta),
    completa: faceta === 'promocion',
  })

  // Opciones del modo escritorio: se recalculan solo cuando cambian los filtros o el catálogo.
  const opcionesEscritorio = useMemo(() => (esCompacto ? null : {
    categoria: opciones(filtros, 'categoria'),
    proveedor: opciones(filtros, 'proveedor'),
    stock: opciones(filtros, 'stock'),
    promocion: opciones(filtros, 'promocion'),
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [esCompacto, filtros, catalogo, universoCat, universoProv])

  const nombreDe = (universo) => (id) => universo.find((o) => o.value === id)?.label ?? id
  const criterios = describirCriterios(filtros, {
    nombreCategoria: nombreDe(universoCat), nombreProveedor: nombreDe(universoProv),
  })
  const quitar = (clave) => onCambiar(clave, FILTROS_INICIALES[clave])

  const resumen = (
    <ResumenCriterios criterios={criterios} mostrados={mostrados} total={total}
      onQuitar={quitar} onLimpiar={onLimpiar} />
  )

  const buscadorNombre = (
    <CampoBusqueda etiqueta="Buscar por nombre" placeholder="Kit de Pistón..." maxLength={MAX_CARACTERES_NOMBRE}
      value={filtros.searchNombre} onChange={(v) => onCambiar('searchNombre', v)}
      ayuda={esCompacto ? undefined : AYUDA_NOMBRE} className={esCompacto ? 'flex-1' : ''} />
  )
  const buscadorId = (
    <CampoBusqueda etiqueta="Buscar por ID" placeholder="Ej.: 1250" icono={Hash} mono inputMode="numeric"
      maxLength={MAX_DIGITOS_ID} normalizar={sanitizarDigitosId}
      value={filtros.searchId} onChange={(v) => onCambiar('searchId', v)}
      ayuda={AYUDA_ID} />
  )

  // ── Mobile / tablet ───────────────────────────────────────────────────
  if (esCompacto) {
    const valoresPanel = {
      filterCat: filtros.filterCat, filterProveedor: filtros.filterProveedor, filterStock: filtros.filterStock,
      filterPromocion: filtros.filterPromocion, filterBajoStock: filtros.filterBajoStock,
      orden: valorOrden(sortKey, sortDir),
    }
    const defaultsPanel = {
      filterCat: TODOS, filterProveedor: TODOS, filterStock: TODOS, filterPromocion: TODOS, filterBajoStock: false,
      orden: valorOrden('nombre', 'asc'),
    }
    // Las opciones dependen del BORRADOR del panel (más los buscadores ya aplicados), así el panel también
    // ofrece solo combinaciones posibles mientras se arma.
    const deBorrador = (faceta) => (b) => opciones({ ...filtros, ...b }, faceta)
    const camposPanel = [
      { tipo: 'select', clave: 'filterCat', etiqueta: 'Categoría', opciones: deBorrador('categoria') },
      { tipo: 'select', clave: 'filterProveedor', etiqueta: 'Proveedor', opciones: deBorrador('proveedor') },
      { tipo: 'select', clave: 'filterStock', etiqueta: 'Stock', opciones: deBorrador('stock') },
      // Sin promociones cargadas el campo no se ofrece (el panel no admite controles deshabilitados).
      { tipo: 'select', clave: 'filterPromocion', etiqueta: 'Promoción', opciones: deBorrador('promocion'),
        visible: () => promocionesDisponibles },
      { tipo: 'checkbox', clave: 'filterBajoStock', etiqueta: 'Bajo stock', texto: 'Solo bajo stock' },
      { tipo: 'select', clave: 'orden', etiqueta: 'Ordenar por',
        opciones: SORT_OPCIONES.map((o) => ({ value: o.value, label: o.label })) },
    ]
    const aplicarPanel = (b) => {
      const { sortKey: k, sortDir: d } = parseOrden(b.orden)
      onAplicar({
        filterCat: b.filterCat, filterProveedor: b.filterProveedor,
        filterStock: b.filterStock, filterPromocion: b.filterPromocion, filterBajoStock: b.filterBajoStock,
      })
      onOrden({ sortKey: k, sortDir: d })
    }
    return (
      <FiltrosMovil
        alineacion="fin"
        busqueda={buscadorNombre}
        value={valoresPanel} defaults={defaultsPanel} campos={camposPanel} onApply={aplicarPanel}
        debajo={(
          <div className="space-y-3">
            <div className="max-w-[11rem]">{buscadorId}</div>
            {resumen}
          </div>
        )}
      />
    )
  }

  // ── Desktop ───────────────────────────────────────────────────────────
  return (
    <Card className="p-4 space-y-3">
      <div className="grid gap-3 items-start grid-cols-4 2xl:grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)_repeat(4,minmax(0,1fr))]">
        <div className="col-span-3 min-w-0 2xl:col-span-1">{buscadorNombre}</div>
        <div className="min-w-0">{buscadorId}</div>
        <CampoSelect etiqueta="Categoría" value={filtros.filterCat} opciones={opcionesEscritorio.categoria}
          onChange={(v) => onCambiar('filterCat', v)} />
        <CampoSelect etiqueta="Proveedor" value={filtros.filterProveedor} opciones={opcionesEscritorio.proveedor}
          onChange={(v) => onCambiar('filterProveedor', v)} />
        <CampoSelect etiqueta="Stock" value={filtros.filterStock} opciones={opcionesEscritorio.stock}
          onChange={(v) => onCambiar('filterStock', v)} />
        <CampoSelect etiqueta="Promoción" value={filtros.filterPromocion} opciones={opcionesEscritorio.promocion}
          disabled={!promocionesDisponibles} ayuda={promocionesDisponibles ? undefined : AYUDA_PROMOCION_NO_DISPONIBLE}
          onChange={(v) => onCambiar('filterPromocion', v)} />
      </div>
      {resumen}
    </Card>
  )
}
