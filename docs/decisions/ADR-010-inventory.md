# 🔟 ADR-010 — Inventario transaccional, cotización suplementaria y atribución comercial

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🔟 ADR-010 — Inventario transaccional, cotización suplementaria y atribución comercial](https://app.notion.com/p/3e06ab0a330d8192ae92d938f0d3ab3c?pvs=204) · última edición: 2026-09-19T18:03:53.445Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Referencia de decisión; no incluir secretos ni activar la integración por la sola existencia del ADR.

---

# ADR-010 — Inventario transaccional, cotización suplementaria y atribución comercial
**Estado:** Aceptada  
**Fecha:** 2026-09-19  
**Ámbito:** catálogo, inventario, órdenes, cotizaciones, RBAC, auditoría, onboarding y dashboard comercial.
# 1. Contexto
Después del Documentation Freeze inicial se incorporó al MVP la administración de productos/repuestos, control de stock por ubicación, consumo de repuestos desde órdenes, propuesta de mano de obra adicional por técnicos y dashboard comercial para owner/admin.
Estas capacidades alteran el modelo de datos y reglas de autorización; por la regla arquitectónica del proyecto deben quedar registradas como ADR.
# 2. Decisión
Se adoptan conjuntamente las siguientes decisiones:
## 2.1 Inventario
- `catalog_items` sigue siendo el maestro comercial.
- Solo `item_type=part` puede tener `track_inventory=true`.
- `inventory_balances` mantiene el saldo actual por producto + `workshop_location`.
- `inventory_movements` es el ledger append-only que explica cada cambio.
- saldo y movimiento se actualizan en la misma transacción.
- stock negativo se rechaza en baseline.
- transferencias crean `transfer_out` + `transfer_in` atómicos.
- correcciones se hacen con movimientos compensatorios, nunca reescribiendo el historial.
## 2.2 Ubicación primaria obligatoria
Todo workshop debe tener **exactamente una** `workshop_location` con `is_primary=true`.
Implementación documental:
- partial unique `(tenant_id) WHERE is_primary=true` garantiza como máximo una;
- constraint trigger **DEFERRABLE / al COMMIT**, disparado por cambios relevantes en `workshops` y por INSERT/UPDATE/DELETE de `workshop_locations`, garantiza al menos una incluso en la creación inicial del workshop;
- crear workshop y ubicación primaria ocurre en una misma transacción de onboarding;
- cambiar la ubicación principal exige promover/demover dentro de la misma transacción;
- eliminar la principal sin reemplazo en esa transacción es rechazado;
- inventario usa la ubicación primaria como default de UX cuando el usuario no ha elegido otra; el backend persiste siempre `location_id` explícito.
No se agrega `workshops.primary_location_id`, porque duplicaría la misma verdad y crearía dos autoridades para “ubicación principal”.
## 2.3 Consumo desde reparación
Technician con assignment activo puede registrar consumo/return de repuestos de su propia orden mediante comandos de dominio. No obtiene permisos para entradas, ajustes o transferencias generales.
## 2.4 Mano de obra adicional
Technician asignado puede ejecutar `proposeLaborAdjustment`, que crea una nueva cotización `quote_type=supplemental` en draft con líneas exclusivamente `labor`.
El technician:
- no puede enviarla;
- no puede registrar autorización manual;
- no puede convertirla directamente en una línea billable.
Owner/admin/advisor revisan/envían según RBAC y el cliente autoriza por el flujo normal. Una supplemental aprobada materializa solo nuevas líneas y mantiene la orden `in_progress`; rechazo/cancelación no revierte el trabajo ya autorizado.
## 2.5 Atribución comercial
`sales_originator_membership_id` es la fuente explícita de atribución de una línea comercial para analítica.
No se usa `created_by_membership_id` como sustituto porque creación técnica y origen comercial pueden ser actores distintos. La atribución se congela cuando la versión deja de ser editable.
El dashboard owner/admin deriva ventas/participación de datos operativos; no persiste una tabla editable de “ventas por empleado”.
# 3. Auditoría obligatoria
Toda mutación de inventario deja `inventory_movement` y, además, audit event correlacionado.
Eventos baseline:
- `inventory.receipt_recorded`;
- `inventory.adjustment_in_recorded`;
- `inventory.adjustment_out_recorded`;
- `inventory.transfer_recorded`;
- `inventory.consumption_recorded`;
- `inventory.return_recorded`;
- `inventory.initial_stock_recorded`.
`inventory.adjustment_out_recorded` es especialmente sensible: exige `reason` no vacío y el audit log debe poder correlacionar actor, producto, ubicación, cantidad, `balance_before`, `balance_after`, movement id y `request_id`. No se registran secretos ni PII innecesaria.
Transferencias generan un único evento lógico de auditoría con `transfer_group_id` y referencias a ambos movimientos.
# 4. Integridad y concurrencia
- FKs compuestas impiden cruzar tenant/producto/orden/ubicación.
- consumo/return ligado a orden prueba `service_order_item_id + catalog_item_id`.
- locks/versionado serializan saldo antes de aplicar delta.
- carrera de consumos que exceda stock: solo uno puede confirmar si el segundo dejaría saldo negativo.
- `inventory_movements` recibe REVOKE UPDATE/DELETE/TRUNCATE en runtime.
# 5. Dashboard
`dashboard.business.read` queda limitado a owner/admin.
Semántica baseline:
- venta = líneas billable de órdenes entregadas, fechadas por `deliveries.delivered_at`;
- recaudo = customer payments confirmed;
- cartera = venta - recaudo asignado;
- participación = suma atribuida por `sales_originator_membership_id` / ventas atribuidas del periodo;
- stock bajo/agotado deriva de `inventory_balances`.
No se interpreta participación como comisión, nómina ni evaluación de desempeño.
# 6. Alternativas descartadas
## Stock solo en `catalog_items`
Descartado: no permite stock por ubicación ni historial auditable.
## Recalcular stock únicamente con SUM(movements)
Descartado para cada lectura operacional: el ledger sigue siendo histórico, pero `inventory_balances` funciona como saldo transaccional/read model para concurrencia y rendimiento.
## Permitir al técnico agregar directamente un cobro
Descartado: saltaría revisión y autorización del cliente.
## Usar `created_by` para ranking comercial
Descartado: atribuye ventas al actor que creó técnicamente la fila, no necesariamente al originador.
## Guardar `primary_location_id` en workshop además de `is_primary`
Descartado: dos fuentes de verdad y ciclo referencial innecesario.
# 7. Consecuencias
Positivas:
- stock trazable y reconciliable;
- soporte multiubicación desde MVP sin ERP completo;
- técnicos ágiles sin capacidad de cobrar unilateralmente;
- métricas comerciales reproducibles;
- onboarding garantiza que todo inventario tenga una ubicación válida.
Costos:
- dos tablas adicionales y más locks/guards transaccionales;
- auditoría adicional;
- onboarding de workshop requiere datos de ubicación antes del commit;
- más pruebas de concurrencia y autorización.
# 8. Fuentes canónicas relacionadas
- [Fuente Notion](https://app.notion.com/p/3e06ab0a330d813baa30dbcff20a874b)
- [Fuente Notion](https://app.notion.com/p/3e06ab0a330d815fbb32e6200f8d5417)
- [Fuente Notion](https://app.notion.com/p/3df6ab0a330d81fda465f8944c3291e6)
- [Fuente Notion](https://app.notion.com/p/3e06ab0a330d81d398ffe925a65506c8)
- [Fuente Notion](https://app.notion.com/p/3e06ab0a330d819080edfe450a75a7f5)
- [Fuente Notion](https://app.notion.com/p/3df6ab0a330d818486e9dd6f06b5f573)
