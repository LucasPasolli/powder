// src/pages/admin/rutasLegadas.js
// Rutas viejas → nuevas. Mantiene vivos los marcadores guardados. El destino sigue
// protegido por PIN (la redirección no concede acceso: sólo cambia la URL).
export const REDIRECCIONES_LEGADAS = Object.freeze([
  ['/facturas',     '/admin/facturas'],
  ['/estadisticas', '/admin/estadisticas'],
  ['/abmc',         '/admin'],
])
