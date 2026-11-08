// src/pages/admin/PanelAdministrativo.jsx
// Pantalla de tarjetas por área. Maquetada sobre Dashboard.jsx (encabezado, contenedor y grilla).
// Grilla: 1 col (<768) · 2 col (768–1024) · 3 col (≥1025).
import { AREAS } from './areas'
import TarjetaArea from './TarjetaArea'

export default function PanelAdministrativo() {
  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <div className="animate-slide-up">
        <p className="text-brand-500 text-xs font-mono tracking-[0.3em] uppercase mb-2">
          Gestión y administración
        </p>
        {/* text-6xl desde md (idéntico a Dashboard); más chico en mobile para no desbordar el ancho. */}
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl text-white tracking-widest leading-none uppercase break-words">
          Panel Administrativo
        </h1>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 min-[1025px]:grid-cols-3 gap-4">
        {AREAS.map((area, i) => (
          <li key={area.id} className="min-w-0">
            <TarjetaArea area={area} indice={i} />
          </li>
        ))}
      </ul>
    </div>
  )
}
