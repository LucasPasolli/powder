// src/components/layout/ScrollToTopOnNavigate.jsx
//
// Gestor global de scroll. No renderiza nada: existe porque los hooks de
// react-router (useLocation) sólo pueden usarse DENTRO de <BrowserRouter>, y
// App() es quien crea el router.
//
// Se monta UNA sola vez, como hermano de <Routes>, así que no se remonta al
// navegar (el ref con el pathname previo del hook sobrevive entre rutas).

import { useScrollToTopOnNavigate } from '../../hooks/useScrollToTopOnNavigate'

export default function ScrollToTopOnNavigate() {
  useScrollToTopOnNavigate()
  return null
}
