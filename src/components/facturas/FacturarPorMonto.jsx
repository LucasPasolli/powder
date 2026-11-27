// src/components/facturas/FacturarPorMonto.jsx
// Apartado «Facturar por monto» del módulo Facturas (TASK 1 + TASK 2).
//
//   formulario → RPC `fn_facturar_por_monto` (servidor) → listado editable → PDF
//
// Es una pantalla de CONSULTA: no modifica stock, presupuestos, pagos ni saldos. Todo lo que
// el usuario edita vive en memoria del navegador y sólo sale como PDF.
//
// Estados cubiertos: inicial (vacío), cargando, error (con reintento), sin base (con oferta
// de productos habituales o aviso de imposibilidad), listo, sin conexión.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Calculator, FileText, RotateCcw, WifiOff } from 'lucide-react'
import { Button, Card, Modal, Spinner } from '../ui'
import { logger } from '../../lib/logger'
import { fmtFecha } from '../../lib/facturas'
import {
  DOCUMENTOS, construirGruposPdf, filtrarPromocionesCalculables, precioNetoDeCatalogo, validarFormulario,
} from '../../lib/facturarPorMonto'
import { obtenerPromocionesVigentes } from '../../services/promocionesService'
import { useFacturarPorMonto } from '../../hooks/useFacturarPorMonto'
import { useEntregaPdf } from '../../hooks/useEntregaPdf'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import FormularioFacturarPorMonto from './FormularioFacturarPorMonto'
import ResumenPorMonto from './ResumenPorMonto'
import ListadoPorMonto from './ListadoPorMonto'
import { TOQUE } from './estilos'

const COLOR_AVISO = {
  ok: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  error: 'text-red-400 bg-red-500/10 border-red-500/20',
}

export default function FacturarPorMonto() {
  const online = useOnlineStatus()
  const m = useFacturarPorMonto()
  const { descargar, generando, aviso } = useEntregaPdf()

  const [activo, setActivo] = useState(/** @type {'noEfectivo'|'efectivo'} */ ('noEfectivo'))
  const [confirmar, setConfirmar] = useState(/** @type {null|'regenerar'|'restablecer'} */ (null))
  const [avisoExport, setAvisoExport] = useState('')
  const promosRef = useRef(/** @type {any[]} */ ([]))
  const refListado = useRef(/** @type {HTMLDivElement|null} */ (null))

  // Promociones vigentes: se cargan una vez al tener un listado, para fijar el precio REAL
  // de los productos que el usuario agrega a mano. Si falla, se usa el precio de lista.
  const listo = m.fase === 'listo'
  useEffect(() => {
    if (!listo) return undefined
    let vivo = true
    obtenerPromocionesVigentes()
      .then((p) => { if (vivo) promosRef.current = filtrarPromocionesCalculables(p) })
      .catch((e) => logger.warn('facturar_por_monto.promos_error', { error: e }))
    return () => { vivo = false }
  }, [listo])

  // Al generar, se abre la pestaña que tenga líneas.
  const idCarga = m.meta?.montoIngresadoCentavos
  useEffect(() => {
    if (!m.docs) return
    if (m.docs.noEfectivo.lineas.length === 0 && m.docs.efectivo.lineas.length > 0) setActivo('efectivo')
    else setActivo('noEfectivo')
  }, [m.fase === 'listo', idCarga])   // eslint-disable-line react-hooks/exhaustive-deps

  // Aviso del navegador si se intenta salir con ediciones sin exportar.
  useEffect(() => {
    if (!m.sinExportar) return undefined
    const alSalir = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', alSalir)
    return () => window.removeEventListener('beforeunload', alSalir)
  }, [m.sinExportar])

  // ── Generar (con confirmación si hay ediciones sin exportar — TASK 2, esc. 8) ──
  const pedirGenerar = useCallback(() => {
    if (m.sinExportar && validarFormulario(m.form).valido) { setConfirmar('regenerar'); return }
    setAvisoExport('')
    m.generar()
  }, [m])

  const confirmarAccion = useCallback(() => {
    const que = confirmar
    setConfirmar(null)
    if (que === 'regenerar') { setAvisoExport(''); m.generar() }
    if (que === 'restablecer') { setAvisoExport(''); m.restablecer() }
  }, [confirmar, m])

  // ── Agregar producto: precio de venta registrado (con promociones vigentes), sin IVA ──
  const agregar = useCallback((doc, p) => {
    m.agregarProducto(doc, {
      idProducto: p.idProducto,
      nombre: p.nombre,
      precioNeto: precioNetoDeCatalogo(p, promosRef.current),
    })
  }, [m])

  // ── Exportar ──
  const exportar = useCallback(async (tipo) => {
    if (!m.docs || !m.meta) return
    if (m.validacion?.hayErrores) {
      setAvisoExport('Corregí los campos marcados en rojo antes de exportar.')
      refListado.current?.querySelector('[aria-invalid="true"]')?.focus?.()
      return
    }
    setAvisoExport('')
    const d = DOCUMENTOS.find((x) => x.tipo === tipo)
    const { desde, hasta } = m.meta.periodo
    const ok = await descargar({
      grupos: construirGruposPdf({
        cliente: m.meta.cliente, doc: m.docs[tipo], hasta, alicuota: m.meta.alicuota,
        etiqueta: `Período ${fmtFecha(desde)} al ${fmtFecha(hasta)} — ${d.pantalla}`, metodoPago: d.metodoPago,
      }),
      titulo: d.pdf, desde, hasta, sufijo: m.meta.cliente.nombre,
    })
    if (ok) m.marcarExportado()
  }, [m, descargar])

  const cantidadLineas = useMemo(() => ({
    noEfectivo: m.docs?.noEfectivo.lineas.length ?? 0,
    efectivo: m.docs?.efectivo.lineas.length ?? 0,
  }), [m.docs])

  const cargando = m.fase === 'cargando'
  const docActivo = DOCUMENTOS.find((d) => d.tipo === activo)

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {!online && (
        <div role="status" className="flex items-start gap-2 text-yellow-400 text-base sm:text-sm bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2.5 font-body">
          <WifiOff size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          Sin conexión. No se puede generar el listado hasta que vuelva internet.
        </div>
      )}

      <FormularioFacturarPorMonto form={m.form} onCampo={m.setCampo} errores={m.errores}
        cargando={cargando} onGenerar={pedirGenerar} />

      {m.fase === 'inicial' && (
        <Card className="p-6 text-center">
          <Calculator size={28} className="mx-auto text-surface-500" aria-hidden="true" />
          <p className="mt-3 text-surface-300 text-base sm:text-sm font-body max-w-prose mx-auto">
            Elegí un cliente, el período y el monto con IVA a facturar. Armamos el listado de productos
            a partir de sus compras reales, con precios sin IVA, y podés ajustarlo antes de exportar el PDF.
          </p>
        </Card>
      )}

      {cargando && !m.docs && (
        <div className="flex justify-center py-10"><Spinner label="Generando el listado" /></div>
      )}

      {m.fase === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-red-400 text-base sm:text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 font-body">
          <AlertCircle size={16} className="flex-shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words flex-1">{m.mensajeError}</span>
          <Button size="sm" variant="secondary" className={TOQUE} onClick={pedirGenerar}>Reintentar</Button>
        </div>
      )}

      {m.fase === 'sin_base' && m.meta && (
        <Card className="p-4 sm:p-6 space-y-3">
          <p role="status" className="text-white text-base sm:text-sm font-body font-semibold">No hay base de facturación</p>
          <p className="text-surface-300 text-base sm:text-sm font-body">
            {m.meta.cliente.nombre || 'El cliente'} no tiene presupuestos pagados entre {fmtFecha(m.meta.periodo.desde)} y {fmtFecha(m.meta.periodo.hasta)}.
          </p>
          {m.meta.historialDisponible ? (
            <>
              <p className="text-surface-300 text-base sm:text-sm font-body">
                Podés generar el listado igualmente con los productos que suele comprar, a su precio de venta actual.
              </p>
              <Button className={`${TOQUE} w-full sm:w-auto`} loading={cargando}
                onClick={() => m.generar({ permitirSinBase: true })}>
                Generar desde productos habituales
              </Button>
            </>
          ) : (
            <p className="text-amber-300 text-base sm:text-sm font-body">
              No es posible generar el listado: el cliente no tiene historial de compras.
            </p>
          )}
        </Card>
      )}

      {m.docs && m.resumen && m.meta && (
        <div aria-busy={cargando} className={`space-y-4 sm:space-y-6 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <ResumenPorMonto resumen={m.resumen} activo={activo} onSeleccionar={setActivo}
            onDescargar={exportar} generando={generando} bloqueado={Boolean(m.validacion?.hayErrores)}
            cantidadLineas={cantidadLineas} editado={m.hayCambios} desdeHabituales={m.meta.desdeHabituales} />

          <Card className="overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-surface-700 flex flex-col gap-3 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={16} className="text-brand-500 flex-shrink-0" aria-hidden="true" />
                <h3 className="font-body font-semibold text-white text-base min-[1025px]:text-sm break-words">
                  {m.meta.cliente.nombre} — {docActivo.pantalla}
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:flex">
                <Button size="sm" variant="secondary" icon={RotateCcw} className={TOQUE}
                  disabled={!m.hayCambios} onClick={() => setConfirmar('restablecer')}>
                  Restablecer
                </Button>
                <Button size="sm" className={TOQUE} loading={generando}
                  disabled={cantidadLineas[activo] === 0 || Boolean(m.validacion?.hayErrores)}
                  onClick={() => exportar(activo)}>
                  {generando ? 'Generando…' : 'Descargar PDF'}
                </Button>
              </div>
            </div>

            <div role="status" aria-live="polite">
              {(avisoExport || aviso) && (
                <p className={`mx-4 sm:mx-6 mt-4 px-4 py-2.5 rounded-xl border text-base sm:text-sm font-body
                  ${avisoExport ? COLOR_AVISO.error : COLOR_AVISO[aviso.tipo]}`}>
                  {avisoExport || aviso.texto}
                </p>
              )}
            </div>

            <div ref={refListado} className="p-3 sm:p-6">
              <ListadoPorMonto key={activo} doc={activo} datos={m.docs[activo]} validacion={m.validacion[activo]}
                totales={m.resumen.porDoc[activo]} alicuota={m.meta.alicuota}
                onCantidad={m.editarCantidad} onPrecio={m.editarPrecio}
                onEliminar={m.eliminarLinea} onAgregar={agregar} />
            </div>
          </Card>
        </div>
      )}

      <Modal open={confirmar !== null} onClose={() => setConfirmar(null)}
        title={confirmar === 'restablecer' ? 'Restablecer el listado' : 'Generar un nuevo listado'}>
        <p className="text-surface-300 text-base sm:text-sm font-body">
          {confirmar === 'restablecer'
            ? 'Vas a volver al resultado automático original. Se pierden tus ediciones.'
            : 'Tenés ediciones sin exportar. Si generás un nuevo listado se van a perder.'}
        </p>
        <div className="mt-5 grid grid-cols-1 sm:flex sm:justify-end gap-2">
          <Button variant="secondary" className={TOQUE} onClick={() => setConfirmar(null)}>Cancelar</Button>
          <Button className={TOQUE} onClick={confirmarAccion}>
            {confirmar === 'restablecer' ? 'Restablecer' : 'Generar y descartar'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
