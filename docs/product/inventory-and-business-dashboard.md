# Inventario, mano de obra adicional y dashboard

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [📦 Inventario y Dashboard Comercial v1 — TallerMecario](https://app.notion.com/p/3e06ab0a330d813baa30dbcff20a874b?pvs=204) · última edición: 2026-09-20T20:26:23.823Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Contexto de producto futuro. Atribución comercial usa sales_originator_membership_id; creado por o técnico asignado no equivalen a originador.

---

**Decisión:** incorporar inventario básico de productos/repuestos y un dashboard comercial para owner/admin. El inventario usa `catalog_items` como maestro de producto y un ledger append-only de movimientos; el dashboard deriva ventas, recaudo, participación y stock de datos operativos reales.

**Estado:** Baseline documental v1 — cambio de alcance posterior al primer freeze  
**Roles principales:** owner, admin; technician con alcance limitado a consumo de repuestos en órdenes asignadas y propuesta de mano de obra.

# 1. Alcance MVP
Incluye:
- owner/admin crean, editan, activan/desactivan productos/repuestos, servicios y conceptos de mano de obra en catálogo;
- repuestos/productos físicos pueden marcarse `track_inventory=true`;
- stock separado por `workshop_location`;
- entradas, ajustes, transferencias y consumos dejan movimiento append-only;
- técnico asignado puede registrar consumo real de repuesto de su orden sin tener permiso de ajustar stock general;
- técnico asignado puede proponer mano de obra adicional;
- owner/admin tienen dashboard comercial/operativo con ventas, recaudo, cartera, ticket promedio, participación por colaborador, productos vendidos y stock;
- alertas de bajo stock/sin stock.
Fuera de alcance baseline:
- proveedores;
- órdenes de compra;
- cuentas por pagar;
- lotes/seriales/fecha de vencimiento;
- contabilidad oficial;
- cálculo de comisión/nómina;
- inventario multi-bodega distinto de `workshop_locations`;
- costos promedio/PEPS y utilidad contable. Pueden añadirse después.
# 2. Catálogo como maestro
`catalog_items` sigue siendo la ficha comercial reutilizable. Se amplía con:
```text
barcode varchar nullable
track_inventory boolean default false
```
Regla: `track_inventory=true` solo es válido para `item_type=part`. Servicios/mano de obra nunca generan stock.
Owner/admin tienen `catalog.manage`. Advisor y technician conservan lectura para cotizar/operar, pero no modifican maestro ni precios base.
# 2.1 Ubicación de inventario y onboarding
Todo taller debe tener exactamente una `workshop_location` principal desde su creación. El onboarding no finaliza creando primero un workshop “vacío”: `workshop + owner/membership según flujo + workshop_location principal` se coordinan transaccionalmente antes del COMMIT.
La ubicación primaria funciona como default de UX para recepción/entrada/consumo cuando solo existe una sede, pero el backend siempre persiste un `location_id` explícito. Si el taller agrega más sedes, owner/admin puede elegir otra ubicación; no se infiere silenciosamente durante una mutación sensible.
Integridad: partial unique para máximo una principal + constraint trigger diferido para mínimo una. Cambiar la principal debe ser atómico.
# 3. Inventario
## 3.1 `inventory_balances`
Balance actual por producto + ubicación. Es un **read model/cache transaccional**, no el historial.
```text
id
tenant_id
catalog_item_id
location_id
quantity_on_hand numeric(14,4)
low_stock_threshold numeric(14,4)
version integer
updated_at
```
`UNIQUE(tenant_id,catalog_item_id,location_id)`.
`available_stock = quantity_on_hand` en baseline; no se implementan reservas todavía.
## 3.2 `inventory_movements`
Ledger append-only y fuente histórica del stock:
```text
id
tenant_id
catalog_item_id
location_id
service_order_item_id nullable
movement_type
quantity_delta numeric(14,4)
transfer_group_id nullable
reason nullable
performed_by_membership_id
occurred_at
created_at
```
Tipos:
`initial | receipt | consumption | return | adjustment_in | adjustment_out | transfer_in | transfer_out`.
Reglas:
- `quantity_delta != 0`;
- receipt/adjustment_in/return/transfer_in \> 0;
- consumption/adjustment_out/transfer_out \< 0;
- movimiento + actualización de balance ocurren en una transacción con lock/version;
- balance no puede terminar negativo en baseline;
- transfer genera dos movimientos atómicos con mismo `transfer_group_id`: salida origen + entrada destino;
- `inventory_movements` no se UPDATE/DELETE por runtime; correcciones crean movimiento compensatorio;
- `adjustment_in` y `adjustment_out` exigen `reason`; en particular `adjustment_out` siempre genera auditoría con saldo antes/después;
- cualquier consumo ligado a orden usa FK tenant-safe a `service_order_items` del mismo producto cuando aplique.
# 4. Consumo de repuestos por técnicos
Technician con assignment activo puede ejecutar un comando de consumo sobre un `service_order_item` tipo `part` de su orden:
```text
orden asignada
  ↓
part item autorizado
  ↓
selecciona ubicación + cantidad realmente usada
  ↓
lock inventory_balance
  ↓
validar stock >= consumo
  ↓
inventory_movement consumption
  + quantity_actual del order item
  + balance actualizado
  ↓
COMMIT
```
El técnico **no recibe** `inventory.adjust`, `inventory.receive` ni `inventory.transfer`. No puede aumentar stock ni corregir inventario general.
# 5. Mano de obra agregada por técnico
El técnico sí puede originar un cobro de mano de obra, pero no hacerlo billable unilateralmente.
Flujo baseline:
```text
Technician asignado
   ↓
quotes.propose_labor_adjustment
   ↓
quote tipo supplemental en DRAFT
   ↓
solo quote_items item_type=labor
   ↓
owner/admin/advisor revisa
   ↓
quotes.send
   ↓
cliente autoriza
   ↓
service_order_item autorizado
   ↓
ejecución/facturación
```
Reglas:
- technician solo puede crear propuesta para una orden donde tenga assignment técnico activo;
- solo `quote_type=supplemental`;
- únicamente líneas `item_type=labor`;
- no puede enviar la cotización, registrar autorización manual ni aprobarse a sí mismo;
- puede usar un `catalog_item` de labor o proponer una línea ad-hoc;
- el precio propuesto queda congelado al enviar; revisión previa puede ajustar owner/admin/advisor según permisos;
- si el cliente rechaza, nunca se vuelve billable.
# 6. Atribución de ventas
Para no confundir “quién escribió el registro” con “quién originó la venta”, las líneas comerciales conservan:
`sales_originator_membership_id`.
Baseline:
- cotización normal: por defecto el originador es quien creó la línea/versión comercial;
- mano de obra suplementaria propuesta por technician: originador = technician;
- owner/admin/advisor pueden corregir atribución **antes de enviar** con auditoría; después de enviar queda frozen para esa versión;
- `service_order_items` copia `sales_originator_membership_id` cuando una línea autorizada se materializa;
- el dashboard nunca calcula comisión automática; “participación” es una métrica analítica.
# 7. Definición de venta y participación
**Venta reconocida baseline:** línea billable de una orden cuya `delivery.status=completed`, usando la fecha `delivered_at`.
Esto separa:
```text
VENTAS = valor entregado/facturado
RECAUDO = customer_payments confirmed
CARTERA = venta - recaudo asignado
```
Participación por colaborador:
```text
participation_sales_amount = SUM(service_order_items.line_total)
WHERE delivery completed
  AND sales_originator_membership_id = actor

participation_pct = actor_sales / attributed_sales_total
```
Las líneas sin originador aparecen como `Sin atribuir`; no se reparten artificialmente. La métrica no es una evaluación laboral ni una comisión.
# 8. Dashboard owner/admin
Pantalla Main para owner/admin:
## KPIs
- ventas hoy / semana / mes;
- recaudo confirmado del periodo;
- cartera pendiente;
- ticket promedio por orden entregada;
- órdenes activas / listas / entregadas;
- número de vehículos atendidos;
- productos/repuestos vendidos;
- ingreso por mano de obra;
- stock bajo / sin stock.
## Gráficas/listas
- ventas por día/semana/mes;
- ventas por categoría: repuestos vs servicios vs labor;
- top productos por unidades e importe;
- top servicios/labor;
- participación en ventas por membership;
- stock bajo y stock agotado;
- últimas órdenes entregadas/pagos;
- opcional filtro por ubicación.
No crear una tabla `dashboard_metrics` como fuente de verdad en MVP. Se calculan desde órdenes, items, deliveries, payments e inventory. Si volumen real lo exige, se añade materialized view/read model sin cambiar la semántica.
# 9. RBAC baseline

| Permission | Owner | Admin | Advisor | Technician |
| --- | --- | --- | --- | --- |
| `catalog.manage` | ✅ | ✅ | — | — |
| `inventory.read` | ✅ | ✅ | ✅ | ✅ |
| `inventory.movements.read` | ✅ | ✅ | ✅ | A/propia orden |
| `inventory.receive` | ✅ | ✅ | — | — |
| `inventory.adjust` | ✅ | ✅ | — | — |
| `inventory.transfer` | ✅ | ✅ | — | — |
| `inventory.consume_assigned` | ✅ | ✅ | ✅ | A |
| `quotes.propose_labor_adjustment` | ✅ | ✅ | ✅ | A |
| `dashboard.operational.read` | ✅ | ✅ | ✅ | ✅/self-assigned |
| `dashboard.business.read` | ✅ | ✅ | — | — |

# 10. API/commands baseline
```text
GET   /api/v1/catalog
POST  /api/v1/catalog
PATCH /api/v1/catalog/:id
GET   /api/v1/inventory/balances
GET   /api/v1/inventory/movements
POST  /api/v1/inventory/receipts
POST  /api/v1/inventory/adjustments
POST  /api/v1/inventory/transfers
POST  /api/v1/orders/:orderId/items/:itemId/consume
POST  /api/v1/orders/:orderId/items/:itemId/return
POST  /api/v1/orders/:orderId/labor-adjustments
GET   /api/v1/dashboard/business?from=&to=&location_id=
```
Todos son tenant-scoped y usan comandos de dominio; no existe endpoint para escribir `quantity_on_hand` directamente. Los periodos del dashboard se interpretan en `workshops.timezone` y se consultan contra timestamps UTC.
# 11. Quality Gate
- [ ] Owner/admin crean/editan/desactivan producto inventariable.
- [ ] Advisor/technician no pueden modificar catálogo/precio base.
- [ ] `track_inventory=true` en service/labor es rechazado.
- [ ] Dos ubicaciones mantienen saldos independientes del mismo producto.
- [ ] Movement + balance son atómicos y movimiento queda append-only.
- [ ] Stock no puede quedar negativo por carrera concurrente.
- [ ] Transferencia produce salida+entrada atómicas e iguales en valor absoluto.
- [ ] Technician no puede receipt/adjust/transfer.
- [ ] Technician asignado puede consumir solo part de su propia orden.
- [ ] Technician no asignado no puede consumir ni proponer mano de obra.
- [ ] Propuesta de labor del técnico queda draft/supplemental y no billable.
- [ ] Technician no puede enviar/autorizar su cotización suplementaria.
- [ ] Labor rechazado nunca llega a `service_order_items` billable.
- [ ] Ventas del dashboard solo incluyen órdenes entregadas; cancelled/no entregadas no cuentan.
- [ ] Recaudo se obtiene de customer payments confirmed y no se confunde con venta.
- [ ] Participación usa `sales_originator_membership_id`, no `created_by` implícito.
- [ ] Dashboard business devuelve solo el tenant actual y solo owner/admin.
- [ ] Low-stock se deriva del balance/threshold y detecta stock cero.
Este cambio amplía el ERD baseline antes de crear migraciones. Una vez propagado a ERD, diccionario, RBAC, RLS, roadmap y Quality Gates, el Documentation Freeze puede volver a considerarse cerrado con el nuevo alcance.

