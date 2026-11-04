// src/pages/admin/AdminRoutes.jsx
// Árbol de rutas del Panel Administrativo. En App.jsx:
//   <Route path="/admin/*" element={<RequireAuth><AdminRoutes Guard={RequireSpecialAuth} /></RequireAuth>} />
//
// SEGURIDAD (segunda capa, SpecialAuthGate):
//  • UN SOLO guard envuelve TODO el árbol /admin/* (tarjetas, Facturas, Estadísticas y las
//    secciones del ex-ABMC). Se ingresa la contraseña una vez y se navega libremente por
//    cualquier apartado del panel: el guard no se remonta al cambiar de ruta interna, así que
//    no se dispara la revocación/período de gracia de SpecialAuthContext.
//  • Al salir del panel el guard se desmonta y aplica el comportamiento habitual del contexto
//    (período de gracia de 15 s); al volver pasado ese tiempo se pide de nuevo.
//  • El guard va a nivel de ruta: URL directa y marcadores quedan cubiertos, y el chunk de cada
//    módulo ni se descarga hasta que el acceso se concede.
//  • Sin `Guard` el componente falla CERRADO (lanza error, no renderiza nada).
import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Spinner } from '../../components/ui'
import LimiteError from './LimiteError'
import PanelAdministrativo from './PanelAdministrativo'
import SeccionConPestanas from './SeccionConPestanas'
import { RUTA_PANEL } from './areas'
import { SECCIONES } from './secciones'

// Módulos conservados sin cambios de lógica.
const Facturas = lazy(() => import('../Facturas'))
const Estadisticas = lazy(() => import('../Estadisticas'))

// Clave de acceso especial del panel. Se reutiliza la de "abmc" (ya configurada en el servidor,
// con su contraseña). Para una contraseña propia del panel: dar de alta otra clave en el
// servidor y cambiar SOLO esta constante.
export const PAGE_KEY_PANEL = 'abmc'
export const LABEL_PANEL = 'Panel Administrativo'

const Cargando = ({ etiqueta }) => (
  <div className="flex justify-center py-12"><Spinner label={etiqueta} /></div>
)

const conSuspense = (Modulo, etiqueta) => (
  <LimiteError resetKey={etiqueta}>
    <Suspense fallback={<Cargando etiqueta={etiqueta} />}><Modulo /></Suspense>
  </LimiteError>
)

export default function AdminRoutes({ Guard }) {
  if (!Guard) {
    throw new Error('AdminRoutes: falta la prop Guard (SpecialAuthGate). Se rechaza el montaje para no exponer el panel sin segunda autorización.')
  }

  return (
    <Guard pageKey={PAGE_KEY_PANEL} label={LABEL_PANEL}>
      <Routes>
        <Route index element={<PanelAdministrativo />} />
        <Route path="facturas" element={conSuspense(Facturas, 'Cargando Facturas')} />
        <Route path="estadisticas" element={conSuspense(Estadisticas, 'Cargando Estadísticas')} />
        {Object.entries(SECCIONES).map(([slug, seccion]) => (
          <Route key={slug} path={`${slug}/:tab?`} element={<SeccionConPestanas slug={slug} seccion={seccion} />} />
        ))}
        <Route path="*" element={<Navigate to={RUTA_PANEL} replace />} />
      </Routes>
    </Guard>
  )
}
