# Agenda, recepción, checklist, daños y firma

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [1️⃣ Diccionario 01 — Tenancy, Identidad, CRM, Agenda y Recepción](https://app.notion.com/p/3e06ab0a330d81fb94c1c237556999a0?pvs=204) · última edición: 2026-09-29T22:44:53.182Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

---

# 13. appointments
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
customer_id | uuid | NOT NULL | composite FK customers |
vehicle_id | uuid | NULL | composite FK vehicles |
location_id | uuid | NULL | composite FK workshop_locations |
scheduled_start | timestamptz | NOT NULL | - |
scheduled_end | timestamptz | NOT NULL | CHECK > start |
reason | text | NOT NULL | - |
status | varchar(16) | NOT NULL DEFAULT scheduled | CHECK scheduled|confirmed|arrived|cancelled|no_show|completed |
source | varchar(24) | NOT NULL DEFAULT staff | CHECK staff|customer|import|other |
created_by_membership_id | uuid | NULL | composite FK memberships | null si origen externo/import
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Índice `(tenant_id,scheduled_start)`.

# 14. reminders
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
appointment_id | uuid | NULL | composite FK appointments |
customer_id | uuid | NOT NULL | composite FK customers |
channel | varchar(16) | NOT NULL | CHECK whatsapp|email|sms|other |
scheduled_for | timestamptz | NOT NULL | - |
status | varchar(16) | NOT NULL DEFAULT pending | CHECK pending|queued|sent|failed|cancelled |
sent_at | timestamptz | NULL | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```

# 15. receptions
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id), UNIQUE(tenant_id,id,vehicle_id,customer_id) |
vehicle_id | uuid | NOT NULL | composite FK vehicles |
customer_id | uuid | NOT NULL | composite FK customers |
appointment_id | uuid | NULL | composite FK appointments |
location_id | uuid | NULL | composite FK workshop_locations |
received_by_membership_id | uuid | NOT NULL | composite FK memberships |
privacy_consent_id | uuid | NOT NULL | composite FK (tenant_id,privacy_consent_id) -> privacy_consents(tenant_id,id) | consentimiento service_provision que cubrió la recepción; inmutable
mileage_km | integer | NOT NULL | CHECK >=0 |
fuel_level_pct | smallint | NULL | CHECK 0..100 |
customer_notes | text | NULL | - |
advisor_notes | text | NULL | - | internal
status | varchar(16) | NOT NULL DEFAULT open | CHECK open|closed|cancelled |
received_at | timestamptz | NOT NULL DEFAULT now() | - |
closed_at | timestamptz | NULL | CHECK coherencia status |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
`closed|cancelled` exige `closed_at`; `open` exige `closed_at IS NULL`.
**Regla de consentimiento (RECEPTION-CONSENT-01, D-PRIV-01 aceptada 2026-09-28):** toda recepción referencia el consentimiento `service_provision` que la cubrió. Un trigger valida en INSERT que el consentimiento pertenezca al mismo tenant y al mismo `customer_id`, tenga `purpose_code='service_provision'`, `status='granted'` y `revoked_at IS NULL`, y haya sido registrado server-side antes o dentro de la misma transacción (`privacy_consents.created_at <= receptions.created_at`). `captured_at` es evidencia declarada por el dispositivo, no autoridad de ordenamiento. El trigger toma `SELECT ... FOR SHARE` sobre la fila del consentimiento para serializar contra una revocación concurrente. `privacy_consent_id` es inmutable tras el INSERT. Revocar el consentimiento después no altera recepciones existentes; bloquea nuevas recepciones hasta una nueva autorización. `customer_id` de la recepción es el titular que entrega el vehículo (el dueño); quien lo recibe en el taller queda en `received_by_membership_id` y depende de quién registre (cualquier membership con permiso de recepción según RBAC). El `customer_id` debe ser el propietario principal vigente del vehículo (`vehicle_owners.is_primary=true AND valid_to IS NULL`): `createReception` bloquea la fila del vehículo con `FOR NO KEY UPDATE` (mismo gate de `transferOwner`, S2) y valida; el trigger de INSERT adquiere el mismo lock del vehículo antes de comparar `vehicle_owners`, de modo que un INSERT SQL directo frente a un cambio de propietario concurrente no produzca TOCTOU. Orden de locks al crear: vehículo → consentimiento → INSERT (la recepción aún no existe); PATCH/CLOSE: recepción → vehículo. Esto endurece el contrato previo (S3-03), que aceptaba cualquier customer del tenant; las recepciones históricas no se reevalúan. Detalle y flujo en Diccionario 04 §1.1.

# 16. reception_check_items
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
reception_id | uuid | NOT NULL | composite FK receptions |
code | varchar(64) | NOT NULL | UNIQUE(tenant_id,reception_id,code) |
label | varchar(160) | NOT NULL | - | snapshot
status | varchar(24) | NOT NULL | CHECK ok|issue|not_checked|not_applicable |
notes | text | NULL | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```

# 17. vehicle_damages
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
reception_id | uuid | NOT NULL | composite FK receptions |
zone_code | varchar(64) | NOT NULL | - | esquema UI estable
damage_type | varchar(64) | NOT NULL | - |
severity | varchar(16) | NOT NULL DEFAULT minor | CHECK minor|moderate|severe |
description | text | NULL | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```

# 18. signatures
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
reception_id | uuid | NULL | composite FK receptions |
delivery_id | uuid | NULL | composite FK deliveries |
signed_by_name | varchar(200) | NOT NULL | - |
signed_by_document | varchar(60) | NULL | - | minimize
signature_media_id | uuid | NOT NULL | composite FK media_assets | media_type=signature guard domain
signed_at | timestamptz | NOT NULL | - |
ip_address | inet | NULL | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
CHECK XOR: exactamente uno de `reception_id`/`delivery_id` es NOT NULL. Evidencia append-only después de firma.
**D-SIG-01 — media de firma de un solo uso.** Cada `media_asset` con `media_type='signature'` puede respaldar como máximo una fila de `signatures` dentro del tenant. La regla se materializa como `UNIQUE(tenant_id,signature_media_id)` y aplica tanto a firmas de recepción como de entrega: son actos distintos y requieren capturas distintas.
Una media ya referenciada por `signatures` puede cambiar de `active` a `quarantined` si posteriormente se considera insegura. La cuarentena conserva la fila de firma, `signature_media_id`, identidad del objeto, bytes y metadata histórica, pero bloquea el acceso normal/signed URLs al dejar de estar `active`. El vínculo histórico no autoriza sustituir el objeto ni borrar/purgar la evidencia mientras deba conservarse.
