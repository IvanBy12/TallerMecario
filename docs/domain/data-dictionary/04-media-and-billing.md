# Media, comunicaciones y pagos

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [3️⃣ Diccionario 03 — Media, Comunicaciones, Billing y Pagos](https://app.notion.com/p/3e06ab0a330d8110981af4b11ce837e0?pvs=204) · última edición: 2026-09-19T05:33:15.729Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

---

# Diccionario 03 — Media, Comunicaciones, Billing SaaS y Pagos Operativos
**Padre:** [Diccionario de Datos v1 — PostgreSQL](https://app.notion.com/p/3e06ab0a330d815fbb32e6200f8d5417)
# 1. media_assets
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
storage_provider | varchar(24) | NOT NULL DEFAULT cloudflare_r2 | - |
bucket | varchar(120) | NOT NULL | - | server-owned
object_key | varchar(512) | NOT NULL | UNIQUE(storage_provider,bucket,object_key) | no PII necesaria
media_type | varchar(24) | NOT NULL | CHECK photo|video360|video|signature|quote_pdf|document |
mime_type | varchar(160) | NOT NULL | allowlist por caso |
size_bytes | bigint | NULL | CHECK >=0 | confirmado al completar
checksum_sha256 | char(64) | NULL | - | hex lowercase
status | varchar(24) | NOT NULL DEFAULT pending_upload | CHECK pending_upload|uploaded|active|quarantined|deleted |
retention_class | varchar(32) | NOT NULL | CHECK ephemeral_upload|operational|warranty_evidence|authorization_evidence|delivery_evidence|document |
retention_until | timestamptz | NULL | - | server-calculated
retention_policy_version | varchar(32) | NOT NULL | - |
legal_hold_until | timestamptz | NULL | - | overrides purge
deletion_requested_at | timestamptz | NULL | - |
deleted_at | timestamptz | NULL | - | bloquea acceso/signed URLs
purged_at | timestamptz | NULL | - | objeto R2 físicamente eliminado
delete_reason | varchar(160) | NULL | - |
captured_at | timestamptz | NULL | - |
uploaded_at | timestamptz | NULL | - |
created_by_membership_id | uuid | NULL | composite FK memberships | system/public flows pueden ser NULL
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - | lifecycle
```
`deleted_at` precede a `purged_at`. Legal hold/garantía/vínculos aplicables impiden purge. Media activo requiere objeto comprobable en R2. Binario nunca vive en PostgreSQL.
# 2. upload_sessions
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
media_asset_id | uuid | NOT NULL | composite FK media_assets |
idempotency_key | uuid | NOT NULL | UNIQUE(tenant_id,idempotency_key) |
status | varchar(16) | NOT NULL DEFAULT pending | CHECK pending|completed|expired|failed |
expires_at | timestamptz | NOT NULL | - |
completed_at | timestamptz | NULL | - |
created_by_membership_id | uuid | NULL | composite FK memberships |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Una sesión `completed` exige `completed_at`; la seguridad de URL firmada también valida expiración real aunque cleanup no haya materializado `expired`.
# 3. Tablas de enlace de media
Todas son tenant-owned, sin FK polimórfica. Formato común:
```text
tenant_id | uuid | NOT NULL | PK parcial + FK workshops |
media_asset_id | uuid | NOT NULL | composite FK media_assets |
purpose | varchar(48) | NOT NULL | PK parcial | semántica dominio
sort_order | integer | NOT NULL DEFAULT 0 | CHECK >=0 |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Cada tabla añade `<target_id> | uuid | NOT NULL | composite FK tenant-safe`. La PK completa es `(tenant_id,<target_id>,media_asset_id,purpose)` y los targets son:
- `reception_media.reception_id -> receptions`
- `damage_media.damage_id -> vehicle_damages`
- `finding_media.finding_id -> findings`
- `work_activity_media.work_activity_id -> work_activities`
- `quality_check_media.quality_check_id -> quality_checks`
- `delivery_media.delivery_id -> deliveries`
- `quote_media.quote_version_id -> quote_versions` (**versión exacta**, no quote lógico).
Índices adicionales `(tenant_id,media_asset_id)` para purge/retention y `(tenant_id,target_id,sort_order)` para lectura.
# 4. tenant_whatsapp_accounts
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
provider | varchar(32) | NOT NULL DEFAULT meta_whatsapp | CHECK meta_whatsapp |
meta_business_id | varchar(160) | NULL | - |
waba_id | varchar(160) | NOT NULL | - |
phone_number_id | varchar(160) | NOT NULL | UNIQUE | inbound tenant resolver
display_phone_number | varchar(32) | NULL | - |
verified_name | varchar(200) | NULL | - |
status | varchar(20) | NOT NULL DEFAULT pending | CHECK pending|active|disconnected|error |
connection_mode | varchar(32) | NOT NULL DEFAULT embedded_signup | CHECK embedded_signup |
billing_mode | varchar(24) | NOT NULL DEFAULT tenant_direct | CHECK tenant_direct |
credential_secret_ref | varchar(255) | NULL | - | opaque secret-store reference
connected_by_membership_id | uuid | NOT NULL | composite FK memberships |
connected_at | timestamptz | NULL | - |
disconnected_at | timestamptz | NULL | - |
last_webhook_at | timestamptz | NULL | telemetry |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Partial unique: máximo una fila `active` por tenant en MVP. El access token real no se guarda en DB. Meta factura al taller.
# 5. message_threads
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
customer_id | uuid | NOT NULL | composite FK customers |
order_id | uuid | NULL | composite FK service_orders |
channel | varchar(16) | NOT NULL | CHECK whatsapp|email|sms|other |
external_thread_ref | varchar(255) | NULL | partial UNIQUE(tenant_id,channel,external_thread_ref) |
status | varchar(16) | NOT NULL DEFAULT open | CHECK open|closed |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
# 6. messages
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
thread_id | uuid | NOT NULL | composite FK message_threads |
whatsapp_account_id | uuid | NULL | composite FK tenant_whatsapp_accounts | requerido provider=meta_whatsapp
direction | varchar(12) | NOT NULL | CHECK inbound|outbound |
provider | varchar(32) | NOT NULL | CHECK meta_whatsapp|email|sms|internal |
provider_message_id | varchar(255) | NULL | partial UNIQUE(provider,provider_message_id) |
message_type | varchar(20) | NOT NULL | CHECK text|template|media|system |
body | text | NULL | - | minimizado; no secrets/OTP persistidos
status | varchar(16) | NOT NULL | CHECK received|queued|accepted|sent|delivered|read|failed |
provider_status_at | timestamptz | NULL | - | orden monotónico webhooks
sent_at | timestamptz | NULL | - |
delivered_at | timestamptz | NULL | - |
read_at | timestamptz | NULL | - |
failed_at | timestamptz | NULL | - |
failure_code | varchar(120) | NULL | no payload sensible |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Inbound usa `received`; outbound progresa `queued/accepted -> sent -> delivered -> read`, o `failed`. Webhook viejo no regresa estado si `provider_status_at` es anterior.
# 7. customer_order_access_tokens
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
order_id | uuid | NOT NULL | composite FK service_orders |
token_hash | varchar(128) | NOT NULL | UNIQUE | raw token never persisted
access_scope | varchar(24) | NOT NULL | CHECK order_tracking|delivery_summary |
status | varchar(16) | NOT NULL DEFAULT active | CHECK active|revoked |
expires_at | timestamptz | NOT NULL | - | baseline created_at + 30 días
created_by_membership_id | uuid | NOT NULL | composite FK memberships |
revoked_at | timestamptz | NULL | - |
revoked_by_membership_id | uuid | NULL | composite FK memberships |
revoke_reason | text | NULL | - |
last_accessed_at | timestamptz | NULL | telemetry only |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Seguridad valida `active AND expires_at>now()`. Token reusable durante vigencia para lectura limitada; revocable anticipadamente.
# 8. plans
```text
id | uuid | NOT NULL | PK | global
code | varchar(64) | NOT NULL | UNIQUE |
name | varchar(160) | NOT NULL | - |
billing_period | varchar(16) | NOT NULL | CHECK monthly|yearly |
price_amount | bigint | NOT NULL | CHECK >=0 | minor units
currency | char(3) | NOT NULL DEFAULT COP | - |
is_active | boolean | NOT NULL DEFAULT true | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Global/read-only para tenant runtime.
# 9. subscriptions
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
plan_id | uuid | NOT NULL | FK plans(id) |
provider | varchar(32) | NOT NULL DEFAULT wompi | CHECK wompi|manual |
provider_ref | varchar(255) | NULL | partial UNIQUE(provider,provider_ref) |
provider_payment_source_id | varchar(255) | NULL | - | ID seguro proveedor; nunca tarjeta
status | varchar(16) | NOT NULL | CHECK trialing|active|past_due|suspended|cancelled |
current_period_start | timestamptz | NOT NULL | - |
current_period_end | timestamptz | NOT NULL | CHECK > start |
grace_until | timestamptz | NULL | - |
cancel_at_period_end | boolean | NOT NULL DEFAULT false | - |
cancelled_at | timestamptz | NULL | required cancelled |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Partial unique: máximo una suscripción no `cancelled` por tenant. `cancelled` terminal para esa fila; nueva contratación crea nuevo registro.
# 10. billing_events
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
subscription_id | uuid | NOT NULL | composite FK subscriptions |
provider | varchar(32) | NOT NULL | - |
provider_event_id | varchar(255) | NOT NULL | UNIQUE(provider,provider_event_id) |
event_type | varchar(120) | NOT NULL | - | normalized/business event
payload_json | jsonb | NOT NULL | redacted/allowed provider event |
occurred_at | timestamptz | NOT NULL | - | provider/business event time
created_at | timestamptz | NOT NULL DEFAULT now() | - | ingestion
```
Append-only; no UPDATE/DELETE/TRUNCATE runtime.
# 11. payments — SaaS taller → ILVOX
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
subscription_id | uuid | NOT NULL | composite FK subscriptions |
provider | varchar(32) | NOT NULL DEFAULT wompi | - |
environment | varchar(16) | NOT NULL | CHECK test|production |
reference | varchar(160) | NOT NULL | UNIQUE | server-generated, immutable
provider_transaction_id | varchar(255) | NULL | partial UNIQUE(provider,environment,provider_transaction_id) |
amount | bigint | NOT NULL | CHECK >0 |
currency | char(3) | NOT NULL DEFAULT COP | - |
status | varchar(16) | NOT NULL DEFAULT pending | CHECK pending|approved|declined|error|voided | normalized
paid_at | timestamptz | NULL | approved time |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | provider reconciliation
```
`reference` correlaciona; nunca email/monto. Test/prod no se cruzan.
# 12. customer_payments — cliente → taller
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
customer_id | uuid | NOT NULL | composite FK customers |
payment_method | varchar(24) | NOT NULL | CHECK cash|card|bank_transfer|nequi|daviplata|other |
status | varchar(16) | NOT NULL DEFAULT pending | CHECK pending|confirmed|reversed |
amount | bigint | NOT NULL | CHECK >0 |
currency | char(3) | NOT NULL DEFAULT COP | CHECK COP in MVP |
reference | varchar(160) | NULL | - | evidencia externa/manual
receipt_number | varchar(80) | NULL | partial UNIQUE(tenant_id,receipt_number) |
idempotency_key | uuid | NULL | partial UNIQUE(tenant_id,idempotency_key) |
paid_at | timestamptz | NULL | - |
confirmed_at | timestamptz | NULL | required confirmed/reversed lineage
confirmed_by_membership_id | uuid | NULL | composite FK memberships |
reversed_at | timestamptz | NULL | required reversed
reversed_by_membership_id | uuid | NULL | composite FK memberships |
reversal_reason | text | NULL | required reversed
correction_of_payment_id | uuid | NULL | composite self FK same tenant | new corrected payment
recorded_by_membership_id | uuid | NOT NULL | composite FK memberships |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Después de `confirmed`, monto/moneda/método/reference/paid_at son frozen. Corrección = reverse + nueva fila; nunca DELETE/overwrite.
# 13. customer_payment_allocations
```text
id | uuid | NOT NULL | PK | append-only allocation
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
customer_payment_id | uuid | NOT NULL | composite FK customer_payments |
order_id | uuid | NOT NULL | composite FK service_orders |
allocated_amount | bigint | NOT NULL | CHECK >0 |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Runtime no UPDATE/DELETE. Constraint trigger/transacción serializa por payment e impide `SUM(allocated_amount)>payment.amount`. Solo payments confirmed cuentan al saldo; reversed contribuye 0 aunque allocations permanezcan como historia.
# 14. customer_payment_reconciliation_runs
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
period_start | timestamptz | NOT NULL | - |
period_end | timestamptz | NOT NULL | CHECK > start |
run_source | varchar(16) | NOT NULL | CHECK scheduled|manual |
initiated_by_membership_id | uuid | NULL | composite FK memberships | required manual
status | varchar(16) | NOT NULL | CHECK ok|issues |
confirmed_total | bigint | NOT NULL DEFAULT 0 | CHECK >=0 |
allocated_total | bigint | NOT NULL DEFAULT 0 | CHECK >=0 |
unallocated_total | bigint | NOT NULL DEFAULT 0 | CHECK >=0 |
reversed_total | bigint | NOT NULL DEFAULT 0 | CHECK >=0 |
discrepancy_count | integer | NOT NULL DEFAULT 0 | CHECK >=0 |
details_json | jsonb | NULL | no PII innecesaria | findings summary
started_at | timestamptz | NOT NULL | - |
finished_at | timestamptz | NOT NULL | CHECK >= started_at |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Append-only evidence. Job detecta drift; jamás corrige automáticamente.
