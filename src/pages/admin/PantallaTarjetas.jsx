// src/pages/admin/PantallaTarjetas.jsx
// Layout ÚNICO de las pantallas de tarjetas (Dashboard y Panel Administrativo): contenedor,
// encabezado y grilla viven acá para que ambas pantallas no puedan divergir.
//
// Grilla: 1 col (< 768) · 2 col (768–1024) · 3 col (≥ 1025), igual que el resto del sistema
// (mismo umbral de 1025 px que useBreakpoint).
//
// Semántica: la grilla es una <ul> (lectores de pantalla anuncian «lista de N elementos»);
// cada <li> lleva `min-w-0` para que un título largo no desborde su columna.
import TarjetaArea from './TarjetaArea'

/**
 * @param {object} props
 * @param {string} props.eyebrow  Texto pequeño sobre el título.
 * @param {string} props.titulo   Título de la pantalla (se muestra en mayúsculas).
 * @param {ReadonlyArray<import('./areas').AreaAdmin>} props.areas  Tarjetas, en orden de grilla.
 */
export default function PantallaTarjetas({ eyebrow, titulo, areas }) {
  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <div className="animate-slide-up">
        <p className="text-brand-500 text-xs font-mono tracking-[0.3em] uppercase mb-2">
          {eyebrow}
        </p>
        {/* text-6xl desde md; más chico en mobile para no desbordar el ancho. */}
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl text-white tracking-widest leading-none uppercase break-words">
          {titulo}
        </h1>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 min-[1025px]:grid-cols-3 gap-4">
        {areas.map((area, i) => (
          <li key={area.id} className="min-w-0">
            <TarjetaArea area={area} indice={i} />
          </li>
        ))}
      </ul>
    </div>
  )
}
