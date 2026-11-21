// src/components/inventario/PromocionProducto.jsx
// Presentación de la promoción vigente de un producto en el listado de Inventario.
// Componentes puramente presentacionales: reciben el resultado ya resuelto (`producto.promocion`,
// ver lib/promocionProducto) y NO calculan nada. La tarjeta (mobile/tablet) y la tabla (desktop)
// usan EXACTAMENTE los mismos, así que se ven y se leen igual en cualquier dispositivo.
//
// Accesibilidad (WCAG 2.1 AA):
//   · El color no es el único canal (1.4.1): la etiqueta lleva ícono + texto "Promoción", y el
//     precio tachado/promocional lleva texto oculto "Precio original" / "Precio promocional".
//   · El violeta de la etiqueta y el esmeralda del precio superan 4,5:1 sobre el tema oscuro.
//   · El nombre interno de la promoción va en `title` solo como ayuda: nada esencial depende del hover.

import { Tag } from 'lucide-react'
import { Badge } from '../ui'
import { describirPromocion } from '../../lib/promocionProducto'

/**
 * Etiqueta "Promoción −15 %" / "Promoción −$ 1.200,00" / "Promoción 2×1". Una sola por producto: la
 * promoción que efectivamente se aplica según la regla de prioridad del sistema.
 *
 * @param {object} props
 * @param {import('../../lib/promocionProducto').PromocionProducto} props.promocion
 */
export function EtiquetaPromocion({ promocion }) {
  const { corto, accesible } = describirPromocion(promocion)
  return (
    <span title={promocion.nombre || undefined} className="inline-flex max-w-full">
      <Badge color="violet">
        <span className="inline-flex items-center gap-1 min-w-0">
          <Tag size={12} aria-hidden="true" className="flex-shrink-0" />
          <span>Promoción</span>
          {corto && <span aria-hidden="true" className="font-mono">{corto}</span>}
          {accesible && <span className="sr-only">: {accesible}</span>}
        </span>
      </Badge>
    </span>
  )
}

/**
 * Precio de venta del producto.
 *   · Sin promoción (o 2×1, que no tiene precio unitario promocional): el precio guardado, como siempre.
 *   · Con precio promocional: el original tachado y, debajo, el precio resultante.
 * Un precio 0 se muestra como "—" (igual que antes: "sin precio cargado").
 *
 * @param {object} props
 * @param {number} props.precioUnitario
 * @param {import('../../lib/promocionProducto').PromocionProducto | null | undefined} props.promocion
 * @param {(n: number) => string} props.formatear   Formateador de moneda del listado.
 */
export function PrecioProducto({ precioUnitario, promocion, formatear }) {
  if (promocion?.reducePrecio) {
    return (
      <span className="flex flex-col leading-tight">
        <s className="text-surface-400 text-xs">
          <span className="sr-only">Precio original: </span>{formatear(promocion.precioOriginal)}
        </s>
        <span className="text-emerald-400 font-semibold">
          <span className="sr-only">Precio promocional: </span>{formatear(promocion.precioFinal)}
        </span>
      </span>
    )
  }
  return precioUnitario > 0 ? formatear(precioUnitario) : <span className="text-surface-500">—</span>
}
