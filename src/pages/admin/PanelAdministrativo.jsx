// src/pages/admin/PanelAdministrativo.jsx
// Pantalla de tarjetas por área. El layout (encabezado + grilla) es el compartido con Dashboard.
import { AREAS } from './areas'
import PantallaTarjetas from './PantallaTarjetas'

export default function PanelAdministrativo() {
  return <PantallaTarjetas eyebrow="Gestión y administración" titulo="Panel Administrativo" areas={AREAS} />
}
