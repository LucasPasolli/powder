# POWDER

> Sistema de gestión (ERP) para distribuidores B2B: presupuestos, inventario, compras a proveedores, cuentas corrientes, finanzas y estadísticas en una única aplicación web.

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)

---

## Módulos del sistema

### Mapa de rutas

| Ruta              | Módulo                      |
| ----------------- | --------------------------- |
| `/login`          | Inicio de sesión            |
| `/`               | Dashboard (panel principal) |
| `/presupuestador` | Presupuestador              |
| `/historial`      | Historial de presupuestos   |
| `/inventario`     | Inventario                  |
| `/pedidos`        | Pedidos de compra           |
| `/saldos`         | Saldos (cuentas corrientes) |
| `/promociones`    | Promociones                 |
| `/admin/*`        | Panel administrativo        |

### Módulos operativos

| Módulo                | Descripción                                                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**         | Pantalla de tarjetas de acceso a cada módulo. Consulta indicadores (presupuestos del período, saldos pendientes, total de productos).                                                                                                                                                                                       |
| **Presupuestador**    | Alta y edición de presupuestos con buscadores de productos por nombre y por ID, y alta rápida de clientes. Aplica promociones vigentes y el ajuste por método de pago. Informa el stock (sin stock o stock insuficiente) pero no bloquea la venta. Genera el PDF, autoguarda un borrador local y usa clave de idempotencia. |
| **Historial**         | Consulta de presupuestos emitidos con filtros (estado, método de pago, fechas, búsqueda) y paginación. Permite cambiar el estado, registrar pago dividido, regenerar saldos, eliminar, editar, descargar PDF y agregar notas.                                                                                               |
| **Inventario**        | Alta, baja, modificación y consulta del catálogo. Incluye filtros guardables por vista, medidas por producto, proveedores asociados, indicadores de bajo stock, actualización de precios por proveedor y exportación de la lista de precios a un Spreadsheet.                                                               |
| **Pedidos de compra** | Pedidos a proveedores con detalle, plan de cuotas en cuenta corriente y marcado de cuotas y pedidos como pagados. Flujo de estados `original → facturado → recibido`. Incluye formulario de factura, formulario de recepción, comparación original vs. facturado y exportación a PDF.                                       |
| **Saldos**            | Seguimiento de cobros pendientes en cuenta corriente: KPIs, filtros, pagos parciales con previsualización de la imputación, historial de aplicaciones y notas.                                                                                                                                                              |
| **Promociones**       | ABMC de promociones. Tipo: _Producto específico_, _Categoría_ o _A todo el carrito_. Modalidad: _% Descuento_ o _Precio fijo_. Permite activar o desactivar, eliminar con confirmación y resolver conflictos entre promociones.                                                                                             |

### Panel administrativo (`/admin`)

Toda la ruta `/admin/*` está protegida por una segunda capa de autorización.

| Área                                           | Contenido                                                                                                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Finanzas** (`/admin/finanzas`)               | Pestañas: **Egresos**, **Ingresos**, **Debe/Haber** (montos pendientes y confirmados por cliente), **Saldos** e **Inversiones** (FCI, plazo fijo, acciones, otro).                                               |
| **Facturas** (`/admin/facturas`)               | Listado por período, separado en _Transferencia y Cuenta Corriente_ y _Efectivo_. Filtros, resumen del período y exportación a PDF.                                                                              |
| **Estadísticas** (`/admin/estadisticas`)       | KPIs, gráficos de barras y de dona, ranking de productos por ingresos, demora de pago por cliente, ticket promedio, productos con datos incompletos, stock crítico y valor del inventario. Todo en modo lectura. |
| **Terceros** (`/admin/terceros`)               | Pestañas: **Clientes** y **Proveedores**.                                                                                                                                                                        |
| **Ventas y Pedidos** (`/admin/ventas-pedidos`) | Pestañas: **Presupuestos**, **Pedidos** y **Categorías** de producto.                                                                                                                                            |

---

## Stack tecnológico

### Arquitectura

**Aplicación de página única (SPA) sin backend propio.** El frontend se conecta directamente a Supabase (backend como servicio). La lógica transaccional sensible se ejecuta en funciones PostgreSQL (RPC, `SECURITY DEFINER`) y no en el cliente.

```
Navegador (SPA React)
  pages/ → components/ → hooks/ → services/ → lib/supabase.js
                                                  │
                                                  ▼
                                   Supabase (Auth + PostgreSQL + RPC)
```

| Capa              | Carpeta           | Responsabilidad                                                                        |
| ----------------- | ----------------- | -------------------------------------------------------------------------------------- |
| Páginas           | `src/pages/`      | Orquestación de cada módulo y rutas                                                    |
| Componentes       | `src/components/` | UI reutilizable por módulo                                                             |
| Hooks             | `src/hooks/`      | Estado, paginación, debounce, conectividad, borradores                                 |
| Servicios         | `src/services/`   | Único punto de acceso a datos                                                          |
| Lógica de dominio | `src/lib/`        | Funciones puras (cálculo, validaciones, PDF, exportación) y contextos de autenticación |
