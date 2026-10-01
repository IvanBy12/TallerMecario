# Inventario y analítica

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [5️⃣ Diccionario 05 — Inventario y Analítica Comercial](https://app.notion.com/p/3e06ab0a330d81df89c9f3be92795302?pvs=204) · última edición: 2026-09-19T18:02:56.938Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

---

# 1. inventory_balances
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | FK workshops, UNIQUE(tenant_id,id) |
catalog_item_id | uuid | NOT NULL | composite FK catalog_items | debe ser part + track_inventory=true
location_id | uuid | NOT NULL | composite FK workshop_locations |
quantity_on_hand | numeric(14,4) | NOT NULL DEFAULT 0 | CHECK >=0 | read model actual
low_stock_threshold | numeric(14,4) | NOT NULL DEFAULT 0 | CHECK >=0 |
version | integer | NOT NULL DEFAULT 1 | CHECK >0 | optimistic concurrency
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Constraints: `UNIQUE(tenant_id,catalog_item_id,location_id)`. `quantity_on_hand` solo cambia dentro del servicio de inventario en la misma transacción que inserta `inventory_movements`; API genérica no lo modifica.

# 2. inventory_movements
```text
id | uuid | NOT NULL | PK | append-only
tenant_id | uuid | NOT NULL | FK workshops, UNIQUE(tenant_id,id) |
catalog_item_id | uuid | NOT NULL | composite FK catalog_items | part inventariable
location_id | uuid | NOT NULL | composite FK workshop_locations |
service_order_item_id | uuid | NULL | FK (tenant,service_order_item_id,catalog_item_id)->service_order_items | consumo/return ligados a orden
movement_type | varchar(24) | NOT NULL | CHECK initial|receipt|consumption|return|adjustment_in|adjustment_out|transfer_in|transfer_out |
quantity_delta | numeric(14,4) | NOT NULL | CHECK <>0 | signo según tipo
transfer_group_id | uuid | NULL | - | requerido transfer_in/out
reason | text | NULL | CHECK/guard: obligatorio para adjustment_in|adjustment_out; opcional demás
performed_by_membership_id | uuid | NOT NULL | composite FK memberships | actor
occurred_at | timestamptz | NOT NULL DEFAULT now() | - | business timestamp
created_at | timestamptz | NOT NULL DEFAULT now() | - | immutable
```
Reglas de signo: `initial|receipt|return|adjustment_in|transfer_in > 0`; `consumption|adjustment_out|transfer_out < 0`. `consumption` y `return` originados por reparación exigen `service_order_item_id` y el mismo `catalog_item_id` que la línea de orden. Transferencia válida = exactamente un `transfer_out` y un `transfer_in` de igual magnitud absoluta, mismo tenant/item/`transfer_group_id`, locations distintas, dentro de una única transacción.
El stock no puede terminar negativo. Correcciones no editan movimientos: crean movimiento compensatorio. `inventory_movements` recibe REVOKE UPDATE/DELETE/TRUNCATE para runtime.

# 3. Integridad con service_order_items
Para que PostgreSQL pruebe que un consumo pertenece al mismo producto, `service_order_items` expone `UNIQUE(tenant_id,id,catalog_item_id)` cuando `catalog_item_id` sea el producto físico materializado/directo. Para líneas provenientes de cotización, al materializar un `part`, `service_order_items.catalog_item_id` **sí se copia desde ****`quote_items.catalog_item_id`** porque inventario necesita una FK estable al SKU/producto; este es el único cambio a la regla anterior que obligaba a NULL en source=quote.
La historia comercial sigue preservándose mediante snapshots; `catalog_item_id` solo identifica el producto para stock y no reemplaza precio/nombre/garantía históricos.

# 4. Campos añadidos a catalog_items
```text
barcode | varchar(120) | NULL | partial UNIQUE(tenant_id,barcode) WHERE NOT NULL |
track_inventory | boolean | NOT NULL DEFAULT false | CHECK !track_inventory OR item_type=part |
```
`catalog.manage` owner/admin gobierna alta/edición/desactivación. Desactivar no borra historial ni movimientos.

# 5. Campos añadidos a quote/items y órdenes
`quotes.quote_type varchar NOT NULL DEFAULT initial CHECK initial|supplemental`.
`quote_items.sales_originator_membership_id uuid NOT NULL` con FK tenant-safe. Se congela al enviar la versión.
`service_order_items.sales_originator_membership_id uuid NOT NULL` con FK tenant-safe, copiado desde `quote_items` cuando la línea procede de cotización. Para líneas directas autorizadas, el dominio lo establece explícitamente.
Para producto `part`, `service_order_items.catalog_item_id` es obligatorio cuando el ítem controla stock. Para service/labor/other puede ser NULL.

# 6. Semántica de participación
No existe tabla mutable de “ventas por empleado”. La métrica se deriva:
```text
eligible sale = service_order_item billable
                + delivery completed

staff sales = SUM(line_total)
              GROUP BY sales_originator_membership_id

participation_pct = staff_sales / SUM(attributed eligible sales)
```
La fecha comercial del dashboard es `deliveries.delivered_at`. `created_by_membership_id` conserva quién creó técnicamente el registro; `sales_originator_membership_id` conserva la atribución comercial. No son equivalentes.

# 7. Stock dashboard
Derivados:
```text
in_stock     = quantity_on_hand > low_stock_threshold
low_stock    = quantity_on_hand > 0 AND quantity_on_hand <= low_stock_threshold
out_of_stock = quantity_on_hand = 0
```
No se persiste otro `stock_status` para evitar drift.

# 9. Mutabilidad
- `inventory_balances`: mutable únicamente por comandos de inventario transaccionales.
- `inventory_movements`: append-only.
- `sales_originator_membership_id`: editable solo mientras la línea/cotización siga en fase editable; frozen tras envío/autorización/materialización según dominio.
- Dashboard: read model/queries, nunca fuente de verdad.

