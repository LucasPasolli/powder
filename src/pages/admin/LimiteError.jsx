// src/pages/admin/LimiteError.jsx
// Error boundary de cada pestaña: un fallo (p. ej. chunk que no baja sin conexión)
// no tumba la navegación. Detalle técnico sólo al log; al usuario, mensaje genérico.
import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui'
import { logger } from '../../lib/logger'

export default class LimiteError extends Component {
  state = { fallo: false }
  static getDerivedStateFromError() { return { fallo: true } }
  componentDidCatch(error, info) {
    logger.error('admin.pestana_error', { error, componentStack: info?.componentStack })
  }
  componentDidUpdate(prev) {
    if (this.state.fallo && prev.resetKey !== this.props.resetKey) this.setState({ fallo: false })
  }
  render() {
    if (!this.state.fallo) return this.props.children
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-surface-700 bg-surface-800 p-8 text-center">
        <AlertTriangle size={28} className="text-red-400" aria-hidden="true" />
        <p className="font-body text-base text-surface-200 sm:text-sm">
          No se pudo cargar esta sección. Revisá tu conexión e intentá de nuevo.
        </p>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => this.setState({ fallo: false })}>
          Reintentar
        </Button>
      </div>
    )
  }
}
