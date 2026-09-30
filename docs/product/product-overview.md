# Producto y mapa funcional

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [Proyecto: Aplicaciones para Talleres Bogota](https://app.notion.com/p/3dd6ab0a330d80f6ac30e656cc016e2f?pvs=204) · última edición: 2026-09-20T20:30:19.248Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

El mapa describe el producto completo; no obliga a implementarlo entero en Sprint 3 Track B.

---

Es## Objetivo

TallerMecario es el SaaS multitenant para talleres de carros y motos. El personal opera mediante PWA móvil/desktop. El cliente recibe comunicaciones por WhatsApp y enlaces web, sin requerir una app instalada.

Flujo de producto: recepción → diagnóstico → cotización → autorización → reparación → calidad → entrega → historial. El mapa siguiente describe el producto completo, no todas las features de Sprint 3 Track B.

| Área | Información o acciones previstas en la página canónica |
| --- | --- |
| Autenticación | Inicio de sesión, recuperación y sesión/dispositivo. |
| Inicio | Órdenes activas, vehículos del día, listos y alertas. Owner/admin: ventas, recaudo/cartera, ticket promedio, participación, catálogo y stock. |
| Recepción | Buscar placa; seleccionar/crear cliente y vehículo; kilometraje, combustible, observaciones; video, fotos, checklist, daños y firma; crear orden. |
| Órdenes | Listado/filtros y detalle con recepción, diagnóstico, cotización, reparación, evidencias, comunicaciones y entrega. |
| Diagnóstico | Hallazgo, evidencia, descripción, recomendación y paso a cotización. |
| Cotizaciones | Servicios, repuestos, labor, impuestos/descuentos, total, versión, envío y estado de autorización. |
| Reparación | Inicio, asignación técnica, actividades, consumo de inventario, propuesta de labor adicional, evidencia y finalización. |
| Inventario | Productos/repuestos, stock por ubicación, entradas/ajustes/transferencias, movimientos y consumo por orden. Acciones y visibilidad sujetas a la matriz RBAC. |
| Calidad | Checklist final, evidencia, observaciones y aprobación de entrega. |
| Entrega | Resumen, valor, estado de pago, firma y cierre. |
| Clientes | Listado, datos, vehículos, historial y comunicaciones. |
| Vehículos | Placa, datos, propietarios, historial, kilometrajes, evidencia y mantenimiento. |
| Agenda | Citas, creación, reprogramación y estados. |
| Notificaciones | Autorizaciones, mensajes, video pendiente, retrasos y recordatorios. |
| Configuración | Taller/logo, usuarios, catálogo, inventario, WhatsApp, plantillas y suscripción. |

## Requisitos actuales que completan el mapa inicial

El listado original no explica todo el orden de consentimiento. Consultar privacy/privacy-product-requirements.md y domain/data-dictionary/05-privacy-and-offline.md: aviso, declaración adulta y service_provision anteceden captura de media/firma. En MVP, entrega el propietario principal vigente.

Los clientes finales no son un rol interno. Los enlaces públicos tienen alcance limitado y el backend autoriza cada acción. Las notas internas y las finanzas no se trasladan a un DTO público o técnico por conveniencia.

Síntesis editorial de la página canónica, con actualización referenciada de privacidad; no define rutas, campos HTTP, wireframes ni tokens visuales nuevos.
