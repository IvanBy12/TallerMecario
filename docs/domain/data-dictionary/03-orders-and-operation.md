# Órdenes, diagnóstico, cotización, reparación y entrega

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [2️⃣ Diccionario 02 — Órdenes, Diagnóstico, Cotizaciones y Operación](https://app.notion.com/p/3e06ab0a330d8179b886c1bbfd0e70f2?pvs=204) · última edición: 2026-09-19T17:39:38.224Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

---

# Diccionario 02 — Órdenes, Diagnóstico, Catálogo, Cotizaciones y Operación
**Padre:** [Diccionario de Datos v1 — PostgreSQL](https://app.notion.com/p/3e06ab0a330d815fbb32e6200f8d5417)
# 1. service_orders
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | FK workshops, UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,vehicle_id,customer_id) |
reception_id | uuid | NOT NULL | UNIQUE(tenant_id,reception_id) | 1 recepción -> 1 orden
vehicle_id | uuid | NOT NULL | composite lineage FK vía reception + vehicles |
customer_id | uuid | NOT NULL | composite lineage FK vía reception + customers |
order_number | bigint | NOT NULL | UNIQUE(tenant_id,order_number) | referencia humana
status | varchar(32) | NOT NULL DEFAULT reception | CHECK máquina service_orders | server-owned
priority | varchar(16) | NOT NULL DEFAULT normal | CHECK low|normal|high|urgent |
opened_at | timestamptz | NOT NULL DEFAULT now() | - |
promised_at | timestamptz | NULL | - |
closed_at | timestamptz | NULL | CHECK terminal | delivered/cancelled
created_by_membership_id | uuid | NOT NULL | composite FK memberships |
version | integer | NOT NULL DEFAULT 1 | CHECK >0 | optimistic concurrency
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
FK de linaje recomendada: `(tenant_id,reception_id,vehicle_id,customer_id) -> receptions(tenant_id,id,vehicle_id,customer_id)`; así una orden no puede cambiar vehículo/cliente respecto de recepción. Estados: `reception|diagnosis|quote_pending|approved|partially_approved|rejected|in_progress|quality_control|ready_for_delivery|delivered|cancelled`.
# 2. order_status_history
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
order_id | uuid | NOT NULL | composite FK service_orders |
from_status | varchar(32) | NULL | NULL solo creación inicial
to_status | varchar(32) | NOT NULL | CHECK estados service_order |
reason | text | NULL | requerido en cancel/retorno cuando aplique
changed_by_membership_id | uuid | NULL | composite FK memberships | NULL para system/provider
changed_at | timestamptz | NOT NULL DEFAULT now() | - |
request_id | varchar(128) | NOT NULL | - | correlación
```
Append-only. Índice `(tenant_id,order_id,changed_at DESC)`.
# 3. assignments
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,order_id,membership_id) |
order_id | uuid | NOT NULL | composite FK service_orders |
membership_id | uuid | NOT NULL | composite FK memberships |
assignment_type | varchar(24) | NOT NULL | CHECK lead_technician|support_technician|quality_control |
assigned_by_membership_id | uuid | NOT NULL | composite FK memberships |
assigned_at | timestamptz | NOT NULL DEFAULT now() | - |
released_at | timestamptz | NULL | CHECK > assigned_at |
```
Partial unique activo `(tenant_id,order_id,membership_id,assignment_type) WHERE released_at IS NULL`. Separación QC vs técnico se valida transaccional/constraint trigger, con excepción unipersonal explícita y auditada.
# 4. service_order_items
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,order_id), UNIQUE(tenant_id,id,catalog_item_id) |
order_id | uuid | NOT NULL | composite FK service_orders |
quote_item_id | uuid | NULL | FK (tenant,quote_item_id,order_id)->quote_items | misma orden
catalog_item_id | uuid | NULL | composite FK catalog_items | requerido para part inventariable; puede provenir de quote
sales_originator_membership_id | uuid | NOT NULL | composite FK memberships | atribución comercial
item_type | varchar(16) | NOT NULL | CHECK service|labor|part|other |
code_snapshot | varchar(80) | NULL | - |
name_snapshot | varchar(200) | NOT NULL | - |
description_snapshot | text | NULL | - |
unit | varchar(40) | NULL | - |
quantity_authorized | numeric(14,4) | NOT NULL | CHECK >0 | cantidad autorizada
quantity_actual | numeric(14,4) | NULL | CHECK >=0 | ejecución/consumo real
quantity_billed | numeric(14,4) | NULL | CHECK >=0 AND <= quantity_authorized | final facturable
unit_price | bigint | NOT NULL | CHECK >=0 | minor units
currency | char(3) | NOT NULL DEFAULT COP | - | snapshot monetario
tax_rate_snapshot | numeric(7,4) | NULL | CHECK 0..100 | puntos porcentuales
tax_amount | bigint | NOT NULL DEFAULT 0 | CHECK >=0 | snapshot
discount_amount | bigint | NOT NULL DEFAULT 0 | CHECK >=0 | snapshot
line_total | bigint | NOT NULL DEFAULT 0 | CHECK >=0 | usa quantity_billed al cerrar
warranty_duration_value_snapshot | integer | NULL | CHECK >0 |
warranty_duration_unit_snapshot | varchar(8) | NULL | CHECK day|month|year |
warranty_terms_snapshot | text | NULL | - |
warranty_origin | varchar(24) | NOT NULL DEFAULT none | CHECK none|catalog_default|quote_override|order_override |
warranty_start_at | timestamptz | NULL | - |
warranty_expires_at | timestamptz | NULL | CHECK > start |
status | varchar(20) | NOT NULL DEFAULT authorized | CHECK authorized|in_progress|completed|cancelled |
source | varchar(24) | NOT NULL | CHECK quote|manual_adjustment|warranty|other |
adjustment_reason | text | NULL | requerido para manual_adjustment/order override relevante
cancel_reason | text | NULL | requerido si cancelled
created_by_membership_id | uuid | NOT NULL | composite FK memberships |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
completed_at | timestamptz | NULL | requerido si completed
```
Reglas canónicas: si `source=quote`, `quote_item_id NOT NULL`; `catalog_item_id` copia `quote_items.catalog_item_id` cuando exista para mantener identidad estable del producto/stock, mientras precio/nombre/impuesto/garantía siguen siendo snapshots. Para `item_type=part` con `catalog_items.track_inventory=true`, `catalog_item_id` es obligatorio. `sales_originator_membership_id` se copia desde la línea comercial autorizada y se usa solo para analítica/participación. `completed` exige `quantity_billed`, `completed_at`; `cancelled` exige `cancel_reason`. `quantity_actual > quantity_authorized` puede registrarse como realidad técnica, pero **no** puede facturarse por encima de `quantity_authorized` sin un ajuste autorizado que aumente esta última. Warranty start baseline = `completed_at`.
# 5. diagnostics
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,order_id) |
order_id | uuid | NOT NULL | composite FK service_orders |
status | varchar(20) | NOT NULL DEFAULT draft | CHECK draft|in_progress|completed|cancelled |
diagnosed_by_membership_id | uuid | NOT NULL | composite FK memberships |
summary | text | NULL | - |
started_at | timestamptz | NULL | - |
completed_at | timestamptz | NULL | terminal coherence |
cancelled_at | timestamptz | NULL | terminal coherence |
cancel_reason | text | NULL | requerido cancelled
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Partial unique: máximo un `(draft|in_progress)` por `(tenant_id,order_id)`. Completed/cancelled terminales.
# 6. findings
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,order_id) |
diagnostic_id | uuid | NOT NULL | composite FK diagnostics |
order_id | uuid | NOT NULL | FK (tenant,diagnostic_id,order_id)->diagnostics | denormalizado para integridad
category | varchar(64) | NOT NULL | - |
title | varchar(200) | NOT NULL | - |
description | text | NOT NULL | - |
severity | varchar(16) | NOT NULL DEFAULT medium | CHECK low|medium|high|critical |
requires_action | boolean | NOT NULL DEFAULT false | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
# 7. recommendations
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
finding_id | uuid | NOT NULL | composite FK findings |
description | text | NOT NULL | - |
recommended_action | text | NULL | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
# 8. catalog_items
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
item_type | varchar(16) | NOT NULL | CHECK service|part|labor|other |
code | varchar(80) | NULL | partial UNIQUE(tenant_id,code) WHERE NOT NULL |
barcode | varchar(120) | NULL | partial UNIQUE(tenant_id,barcode) WHERE NOT NULL |
name | varchar(200) | NOT NULL | - |
description | text | NULL | - |
default_unit_price | bigint | NOT NULL | CHECK >=0 | minor units
currency | char(3) | NOT NULL DEFAULT COP | - |
tax_rate | numeric(7,4) | NULL | CHECK 0..100 | puntos porcentuales
unit | varchar(40) | NULL | - |
default_warranty_duration_value | integer | NULL | CHECK >0 |
default_warranty_duration_unit | varchar(8) | NULL | CHECK day|month|year |
default_warranty_terms | text | NULL | - |
track_inventory | boolean | NOT NULL DEFAULT false | CHECK !track_inventory OR item_type=part | stock solo para repuestos/productos físicos
is_active | boolean | NOT NULL DEFAULT true | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
CHECK warranty: value y unit son ambos NULL o ambos NOT NULL. `track_inventory=true` solo se permite para `item_type=part`; el stock vive en `inventory_balances`/`inventory_movements`.
# 9. quotes
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,order_id) |
order_id | uuid | NOT NULL | composite FK service_orders |
quote_type | varchar(16) | NOT NULL DEFAULT initial | CHECK initial|supplemental | supplemental para ajustes posteriores
status | varchar(24) | NOT NULL DEFAULT draft | CHECK draft|awaiting_authorization|approved|partially_approved|rejected|cancelled |
current_version_id | uuid | NULL | composite FK a quote_versions del mismo quote/order |
created_by_membership_id | uuid | NOT NULL | composite FK memberships |
cancelled_at | timestamptz | NULL | - |
cancelled_by_membership_id | uuid | NULL | composite FK memberships |
cancel_reason | text | NULL | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
`cancelled` exige timestamp/actor/motivo. FK de `current_version_id`: `(tenant_id,current_version_id,id,order_id) -> quote_versions(tenant_id,id,quote_id,order_id)`.
# 10. quote_versions
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,order_id), UNIQUE(tenant_id,id,quote_id,order_id) |
quote_id | uuid | NOT NULL | FK (tenant,quote_id,order_id)->quotes |
order_id | uuid | NOT NULL | denormalizado/immutable | integridad misma orden
version_number | integer | NOT NULL | UNIQUE(tenant_id,quote_id,version_number), CHECK >0 |
subtotal_amount | bigint | NOT NULL | CHECK >=0 |
tax_amount | bigint | NOT NULL DEFAULT 0 | CHECK >=0 |
discount_amount | bigint | NOT NULL DEFAULT 0 | CHECK >=0 |
total_amount | bigint | NOT NULL | CHECK >=0 |
currency | char(3) | NOT NULL DEFAULT COP | - |
notes | text | NULL | - |
created_by_membership_id | uuid | NOT NULL | composite FK memberships |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
sent_at | timestamptz | NULL | freeze boundary |
```
Cuando `sent_at IS NOT NULL`, contenido y líneas de esta versión quedan frozen para runtime.
# 11. quote_items
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,order_id), UNIQUE(tenant_id,id,quote_version_id) |
quote_version_id | uuid | NOT NULL | FK (tenant,quote_version_id,order_id)->quote_versions |
order_id | uuid | NOT NULL | immutable/denormalized | misma orden
finding_id | uuid | NULL | FK (tenant,finding_id,order_id)->findings |
catalog_item_id | uuid | NULL | composite FK catalog_items |
sales_originator_membership_id | uuid | NOT NULL | composite FK memberships | atribución comercial; frozen al enviar
item_type | varchar(16) | NOT NULL | CHECK service|labor|part|other |
code_snapshot | varchar(80) | NULL | - |
name_snapshot | varchar(200) | NOT NULL | - |
description_snapshot | text | NULL | - |
unit | varchar(40) | NULL | - |
quantity | numeric(14,4) | NOT NULL | CHECK >0 |
unit_price | bigint | NOT NULL | CHECK >=0 |
tax_rate_snapshot | numeric(7,4) | NULL | CHECK 0..100 |
warranty_duration_value_snapshot | integer | NULL | CHECK >0 |
warranty_duration_unit_snapshot | varchar(8) | NULL | CHECK day|month|year |
warranty_terms_snapshot | text | NULL | - |
tax_amount | bigint | NOT NULL DEFAULT 0 | CHECK >=0 |
discount_amount | bigint | NOT NULL DEFAULT 0 | CHECK >=0 |
line_total | bigint | NOT NULL | CHECK >=0 |
sort_order | integer | NOT NULL DEFAULT 0 | CHECK >=0 |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Warranty value/unit ambos NULL o ambos presentes. Currency se hereda de `quote_versions.currency`; una versión enviada congela sus `quote_items`, incluido `sales_originator_membership_id`. Un technician con assignment activo puede originar un `quote_type=supplemental` únicamente con líneas `labor` bajo `quotes.propose_labor_adjustment`; no puede enviarlo ni autorizarlo.
# 12. quote_authorization_tokens
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,quote_version_id) |
quote_version_id | uuid | NOT NULL | composite FK quote_versions |
token_hash | varchar(128) | NOT NULL | UNIQUE | raw token nunca persiste
status | varchar(16) | NOT NULL DEFAULT active | CHECK active|consumed|expired|revoked|superseded |
created_by_membership_id | uuid | NOT NULL | composite FK memberships |
issued_for_message_id | uuid | NULL | composite FK messages |
expires_at | timestamptz | NOT NULL | - | baseline issued_at + 72 h
last_accessed_at | timestamptz | NULL | telemetry only |
consumed_at | timestamptz | NULL | - |
revoked_at | timestamptz | NULL | - |
revoked_by_membership_id | uuid | NULL | composite FK memberships |
revoke_reason | text | NULL | - |
superseded_at | timestamptz | NULL | - |
supersede_reason | varchar(24) | NULL | CHECK quote_revised|sibling_consumed |
superseded_by_token_id | uuid | NULL | FK same tenant/version |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
GET no consume. Validación siempre exige `expires_at > now()`, quote `awaiting_authorization` y versión current. Token final/superseded/revoked/expired no vuelve a active.
# 13. quote_authorization_challenges
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id,authorization_token_id) |
authorization_token_id | uuid | NOT NULL | composite FK token |
code_hash | varchar(128) | NULL | - | HMAC-SHA256, no hash simple
hash_key_version | smallint | NULL | CHECK >0 | secret pepper version
status | varchar(20) | NOT NULL DEFAULT requested | CHECK requested|active|verified|consumed|expired|locked|superseded|delivery_failed |
delivery_channel | varchar(16) | NOT NULL DEFAULT whatsapp | CHECK whatsapp|email|sms | solo integración habilitada
destination_masked | varchar(160) | NULL | - | nunca destino arbitrario del public request
delivery_message_id | uuid | NULL | composite FK messages |
attempt_count | integer | NOT NULL DEFAULT 0 | CHECK 0..max_attempts |
max_attempts | integer | NOT NULL DEFAULT 5 | CHECK 1..10 | baseline 5
requested_at | timestamptz | NOT NULL DEFAULT now() | - |
expires_at | timestamptz | NULL | - | materialización + 5 min
verified_at | timestamptz | NULL | - |
verification_expires_at | timestamptz | NULL | - | verified_at + 5 min baseline
consumed_at | timestamptz | NULL | - |
locked_at | timestamptz | NULL | - |
superseded_at | timestamptz | NULL | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
`code_hash = HMAC-SHA256(OTP_PEPPER[key_version], challenge_id || otp)`; CSPRNG 6 dígitos. Un challenge utilizable por token (`requested|active|verified`) mediante partial unique. Resend cooldown 60 s. El destinatario se resuelve server-side desde contacto ya asociado a cliente/orden; el public endpoint no acepta un número/email libre como autoridad. Decisión exige `verified` y `verification_expires_at > now()`.
# 14. quote_authorizations
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,quote_version_id) |
quote_version_id | uuid | NOT NULL | UNIQUE(tenant_id,quote_version_id), composite FK quote_versions | una decisión final por versión
authorization_token_id | uuid | NULL | FK token same version | público
authorization_challenge_id | uuid | NULL | FK challenge same token | público
decision | varchar(24) | NOT NULL | CHECK approved|partially_approved|rejected |
authorized_amount | bigint | NULL | CHECK >=0 | requerido approved/partial según cálculo
customer_name | varchar(200) | NOT NULL | - | evidence snapshot
customer_document | varchar(60) | NULL | - | minimize
channel | varchar(32) | NOT NULL | CHECK public_whatsapp_otp|manual_in_person|manual_phone|other_manual |
recorded_by_membership_id | uuid | NULL | composite FK memberships | requerido manual
ip_address | inet | NULL | - |
user_agent | text | NULL | - |
authorized_at | timestamptz | NOT NULL | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Append-only. Public: token+challenge NOT NULL y `recorded_by` NULL. Manual: token/challenge NULL y `recorded_by` NOT NULL. Una única fila por quote version es la barrera DB adicional contra carreras de tokens.
# 15. quote_authorization_items
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
authorization_id | uuid | NOT NULL | FK (tenant,authorization_id,quote_version_id)->quote_authorizations |
quote_version_id | uuid | NOT NULL | immutable | versión exacta
quote_item_id | uuid | NOT NULL | FK (tenant,quote_item_id,quote_version_id)->quote_items |
decision | varchar(16) | NOT NULL | CHECK approved|rejected |
authorized_quantity | numeric(14,4) | NULL | CHECK >0 cuando approved |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
`UNIQUE(tenant_id,authorization_id,quote_item_id)`. Append-only. Para `partially_approved` debe existir al menos una línea approved y una rejected/quantity reducida, validado transaccionalmente.
# 16. work_activities
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,order_id) |
order_id | uuid | NOT NULL | composite FK service_orders |
service_order_item_id | uuid | NULL | FK (tenant,item_id,order_id)->service_order_items | misma orden
title | varchar(200) | NOT NULL | - |
description | text | NULL | - |
status | varchar(20) | NOT NULL DEFAULT pending | CHECK pending|in_progress|paused|completed|cancelled |
assigned_membership_id | uuid | NULL | composite FK memberships |
started_at | timestamptz | NULL | - |
completed_at | timestamptz | NULL | - |
cancel_reason | text | NULL | requerido cancelled
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
# 17. technician_logs
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
activity_id | uuid | NOT NULL | composite FK work_activities |
membership_id | uuid | NOT NULL | composite FK memberships |
event_type | varchar(20) | NOT NULL | CHECK started|paused|resumed|note|completed|cancelled |
notes | text | NULL | - |
logged_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Append-oriented; no UPDATE/DELETE normal.
# 18. quality_checks
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
order_id | uuid | NOT NULL | composite FK service_orders |
checked_by_membership_id | uuid | NOT NULL | composite FK memberships |
status | varchar(16) | NOT NULL DEFAULT pending | CHECK pending|passed|failed |
notes | text | NULL | - |
checked_at | timestamptz | NULL | required passed/failed |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Perform requiere assignment `quality_control` activo y separación de duties salvo excepción unipersonal auditada.
# 19. deliveries
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
order_id | uuid | NOT NULL | UNIQUE(tenant_id,order_id), composite FK service_orders |
status | varchar(16) | NOT NULL DEFAULT pending | CHECK pending|completed |
delivered_to_name | varchar(200) | NULL | requerido completed
delivered_by_membership_id | uuid | NULL | composite FK memberships | requerido completed
final_amount | bigint | NULL | CHECK >=0 | frozen al completar
currency | char(3) | NOT NULL DEFAULT COP | - |
payment_status | varchar(16) | NOT NULL DEFAULT unpaid | CHECK unpaid|partial|paid | DERIVED cache
outstanding_balance | bigint | NOT NULL DEFAULT 0 | CHECK >=0 | DERIVED cache
notes | text | NULL | - |
delivered_at | timestamptz | NULL | required completed
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - | ledger cache updates
```
Se crea/prepara solo con orden `ready_for_delivery`; completar delivery y pasar orden a `delivered` es atómico. `payment_status/outstanding_balance` se reconcilian contra customer-payment ledger; saldo pendiente no bloquea entrega en baseline.
