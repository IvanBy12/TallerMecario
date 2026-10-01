# Privacidad, sincronización y flags

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [4️⃣ Diccionario 04 — Privacidad y Plataforma](https://app.notion.com/p/3e06ab0a330d815d8559cd85974347bc?pvs=204) · última edición: 2026-09-29T05:16:14.516Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Se omiten webhook_events, webhook_processing_attempts, outbox_events, audit_logs y la implementación RLS. HMAC/hash son server-owned; los campos de DB no definen el request HTTP.

---

# 1. privacy_consents
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
customer_id | uuid | NOT NULL | composite FK customers | titular MVP
purpose_code | varchar(80) | NOT NULL | - | finalidad separable
privacy_notice_version | varchar(40) | NOT NULL | - |
authorization_text_version | varchar(40) | NOT NULL | - |
authorization_text_hash | char(64) | NOT NULL | CHECK ~ '^[0-9a-f]{64}$' | sha256 hex lowercase de la representación canónica server-owned del aviso + autorización presentados; calculado por el servidor (§1.1, D-PRIV-02)
controller_notice_snapshot | jsonb | NOT NULL | inmutable, server-owned | identidad del Responsable mostrada (legalName, address, phone, email, rightsChannel); §1.1, D-PRIV-02
channel | varchar(24) | NOT NULL | CHECK web|in_person|whatsapp|email|phone|import|other |
status | varchar(16) | NOT NULL DEFAULT granted | CHECK granted|revoked |
captured_at | timestamptz | NOT NULL | - |
revoked_at | timestamptz | NULL | required revoked |
evidence_hash | varchar(128) | NULL | - | hash de evidencia cuando aplique
evidence_media_id | uuid | NULL | composite FK media_assets |
ip_address | inet | NULL | - |
user_agent | text | NULL | - |
created_by_membership_id | uuid | NULL | composite FK memberships | null public/import
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - | solo lifecycle grant->revoke
```
Partial unique: máximo un consentimiento `granted` por `(tenant_id,customer_id,purpose_code)`. Revocar exige `revoked_at`. Evidencia/versión exacta permanece; una nueva autorización posterior crea **nueva fila**, no reactiva la antigua.
## 1.1 Regla de recepción (RECEPTION-CONSENT-01)
**No se crea una ****`reception`****, ni se captura foto, video 360° o firma, sin aviso de privacidad mostrado y una autorización ****`granted`**** para ****`service_provision`**** capturada antes o en la misma transacción.** El taller es el Responsable del Tratamiento; ILVOX opera como Encargado.

### Base legal (Colombia)
- Ley 1581 de 2012, art. 10: las excepciones a la autorización (orden de entidad pública, datos públicos, urgencia médica, fines históricos/estadísticos/científicos, registro civil) no incluyen "ejecutar el contrato". Nombre, teléfono y placa asociada a una persona requieren autorización.
- Ley 1581, art. 12: al solicitarla se informa finalidad, carácter facultativo de datos sensibles o de menores, derechos del titular e identificación/dirección/teléfono del Responsable; el Responsable conserva prueba de haberlo informado.
- Decreto 1074 de 2015, art. 2.2.2.25.2.4 (modo de obtener la autorización): la autorización puede ser escrita, oral o por conducta inequívoca; en ningún caso el silencio se asimila a conducta inequívoca.
- Decreto 1074 de 2015, art. 2.2.2.25.2.6: la revocatoria/supresión no procede si existe deber legal o contractual de permanecer en la base de datos.
- Ley 2300 de 2023: en una transacción de bienes o servicios no se puede obligar al consumidor a aceptar mensajes comerciales, salvo los estrictamente relacionados con el servicio; los mensajes comerciales solo de lunes a viernes 7:00–19:00 y sábados 8:00–15:00, con mecanismo ágil de cancelación.
### Catálogo inicial de `purpose_code`

| purpose_code | Finalidad | ¿Condiciona la recepción? |
| --- | --- | --- |
| `service_provision` | Identificación, contacto, vehículo, fotos/video/firma y demás datos necesarios para prestar el servicio | Sí (única obligatoria) |
| `service_notifications_whatsapp` | Cotización, estado de orden y OTP por WhatsApp | No |
| `appointment_reminders` | Recordatorios de cita | No |
| `marketing` | Promociones y ofertas; nunca premarcada ni agrupada con otra finalidad | No |
| `image_use` | Uso de imagen para promoción | No |

### Flujo de `createReception` (una sola transacción)
1. Resolver el titular: el `customer` que es el propietario principal vigente del vehículo (`vehicle_owners.is_primary=true AND valid_to IS NULL`) y entrega el vehículo. La recepción bloquea la fila del vehículo con `FOR NO KEY UPDATE` (el mismo gate de `transferOwner`) antes de validar. La entrega por un representante o contacto de una persona jurídica, o por un conductor autorizado, queda fuera del MVP.
2. Verificar que el taller tenga configurado su aviso de privacidad (razón social, dirección, teléfono/email y canal para ejercer derechos); si no, rechazar. El servidor toma de ahí el `controller_notice_snapshot`.
3. Mostrar el aviso vigente y exigir `adultAttestationConfirmed = true` (D-PRIV-04). Registrar cada finalidad aceptada como fila `granted` (versión de aviso y de texto, `controller_notice_snapshot` y hash canónico calculados por el servidor, canal, `captured_at`, evidencia).
4. Bloquear el consentimiento `service_provision` con `SELECT ... FOR SHARE` y validar `status='granted'` y `revoked_at IS NULL`. Si no existe o está revocado, rechazar con error de dominio; no se permite captura de media.
5. Insertar la `reception` con `privacy_consent_id` apuntando al consentimiento de `service_provision`.
6. Auditar (`reception.created` con `privacy_consent_id`).
### Reglas asociadas
- El silencio, una casilla premarcada o un booleano CRM nunca cuentan como autorización.
- Negarse a `marketing`, `image_use`, `appointment_reminders` o `service_notifications_whatsapp` no bloquea la recepción.
- Revocar `service_provision` con orden abierta o garantía vigente no borra datos: cambia el estado a `revoked` y bloquea nuevas recepciones hasta una nueva autorización (nueva fila).
- La firma de recepción puede ser la evidencia (`evidence_media_id`), pero el texto autorizado se muestra y versiona aparte de las condiciones del servicio.
- Offline (ADR-005): `captured_at` es el momento declarado por el dispositivo: es parte de la evidencia, pero no es autoridad de ordenamiento ni de autorización (puede tener clock drift o manipulación); `created_at` es server-owned y es el que participa en la garantía transaccional. Si la PWA no tiene un `privacy_notice_bundle` vigente entregado por el servidor, no permite recepción offline (D-PRIV-05). La sincronización es idempotente por `operation_id`.
- Mayoría de edad (D-PRIV-04): el MVP no soporta titulares menores de edad. El titular declara expresamente ser mayor (`adultAttestationConfirmed = true`, obligatorio y no premarcado); si falta o es `false`, no se crea consentimiento ni recepción. La representación por padre, madre o representante legal queda fuera del MVP y requiere diseño específico posterior.
- Titular y receptor: el titular es el dueño que entrega el vehículo (`receptions.customer_id`) y es quien otorga la autorización. Quien lo recibe en el taller queda en `received_by_membership_id` y depende de quién registre (cualquier membership con permiso de recepción según RBAC). Que otra persona entregue el vehículo (conductor autorizado, o representante/contacto de una persona jurídica) queda fuera del MVP.
### Integridad en PostgreSQL (RECEPTION-CONSENT-01)
Toda recepción referencia el consentimiento `service_provision` que la cubrió. En el INSERT de `receptions`, PostgreSQL valida que `privacy_consent_id`:
- pertenezca al mismo `tenant_id`;
- pertenezca al mismo `customer_id`;
- tenga `purpose_code='service_provision'`;
- tenga `status='granted'` y `revoked_at IS NULL`;
- haya sido registrado server-side antes o dentro de la misma transacción que crea la recepción (`privacy_consents.created_at <= receptions.created_at`, ambos server-owned).
Serialización: el trigger toma `SELECT ... FOR SHARE` sobre la fila del consentimiento antes de decidir. El FK compuesto por sí solo no basta: toma `FOR KEY SHARE`, que no conflictúa con el UPDATE de revocación (`FOR NO KEY UPDATE`). Si la revocación gana, `createReception` falla; si la recepción gana, es históricamente válida y la revocación ocurre después.
Propietario: `createReception` exige que `customer_id` sea el propietario principal vigente del vehículo. El trigger de INSERT no confía en que la aplicación ya haya bloqueado: adquiere él mismo el lock de la fila del vehículo con `FOR NO KEY UPDATE`, el mismo modo que toma `transferOwner` (S2), luego resuelve `vehicle_owners WHERE is_primary = true AND valid_to IS NULL` y compara su `customer_id`. Así un INSERT SQL directo frente a un cambio de propietario concurrente no produce TOCTOU. Los locks son reentrantes dentro de la transacción, por lo que el bloqueo previo de la aplicación no genera espera propia. Esto endurece el contrato previo (S3-03), que aceptaba cualquier customer del tenant. Las recepciones históricas no se reevalúan si el propietario cambia después.
Orden de locks:
```text
CREATE RECEPTION              PATCH / CLOSE RECEPTION
vehicle                       reception
  ↓                             ↓
privacy_consent               vehicle
  ↓
INSERT reception
  ↓
audit
```
Modos: `vehicle` con `FOR NO KEY UPDATE`, `privacy_consent` con `FOR SHARE`. No se contradicen: al crear todavía no existe la `reception` que otra operación pueda bloquear. Los dos triggers BEFORE INSERT de `receptions` se disparan en orden alfabético por nombre, así que sus nombres deben fijar vehículo antes que consentimiento.
`captured_at` es evidencia declarada por el canal/dispositivo, no autoridad de ordenamiento. `privacy_consent_id` es inmutable tras el INSERT; una revocación posterior no invalida recepciones históricas, solo impide nuevas con esa autorización.
### Evidencia del texto presentado (D-PRIV-02)
- `authorization_text_hash` almacena SHA-256 en hexadecimal lowercase (64 caracteres) de la representación canónica server-owned del aviso de privacidad y del texto de autorización efectivamente presentados.
- `privacy_notice_version` y `authorization_text_version` identifican versiones inmutables mantenidas por el backend en un catálogo versionado en código (no hay tabla `privacy_notice_versions` en el MVP). Modificar el aviso o el texto exige una versión nueva.
- El cliente no es autoridad del contenido ni del hash: solo envía versiones y finalidades; el servidor calcula el hash y rechaza cualquier `authorization_text_hash` suministrado por el cliente.
- Representación canónica v1 (UTF-8, NFC, saltos de línea LF, sin BOM; el prefijo de longitud evita ambigüedad al concatenar; los campos del snapshot entran en el orden fijo indicado):
```text
preimage = "tallermecario.privacy_consent.text.v1" || 0x00
        || purpose_code || 0x00
        || privacy_notice_version || 0x00
        || authorization_text_version || 0x00
        || u64be(len(notice_utf8)) || notice_utf8
        || u64be(len(authorization_utf8)) || authorization_utf8
        || for f in [legalName, address, phone, email, rightsChannel]:
             encode_snapshot_field(f)

encode_snapshot_field(NULL) = 0x00
encode_snapshot_field(STRING) = 0x01 || u64be(len(f_utf8)) || f_utf8
authorization_text_hash = hex_lowercase(SHA-256(preimage))
```
- Los campos nullable del snapshot usan una codificación explícita: `NULL = 0x00`; `STRING = 0x01 || u64be(len(utf8)) || utf8`. Así `NULL` y string vacío nunca producen la misma evidencia. Los campos obligatorios siempre usan la rama `STRING`.
- Cada versión publicada se protege con tests de hash conocido.
- Identidad del Responsable: `controller_notice_snapshot jsonb NOT NULL` en `privacy_consents` guarda, inmutable y server-owned, la identidad mostrada al titular (`legalName`, `address`, `phone`, `email`, `rightsChannel`; art. 12, literal d, Ley 1581). Se toma desde `workshops`/`workshop_locations` cuando se crea el consentimiento; el cliente no puede suministrarlo. Sus cinco campos entran al preimage en ese orden, cada uno con prefijo de longitud. Sin el snapshot, un hash no permitiría reconstruir qué identidad se mostró si el taller cambia luego de dirección o contacto.
- Reconstrucción: versiones + textos del catálogo + snapshot conservado reproducen los mismos bytes y el mismo SHA-256.
- Offline: ver D-PRIV-05 (bundle autenticado por el servidor; el snapshot sale del bundle, no del estado actual de `workshops`).
### Mayoría de edad (D-PRIV-04)
TallerMecario no persiste fecha de nacimiento en `customers` para decidir elegibilidad de recepción.
Antes de capturar `service_provision`, el titular declara expresamente que es mayor de edad. La declaración es del titular; la membership del taller solo registra la manifestación y no certifica ni infiere la edad por apariencia u otros datos.
El comando de captura exige una confirmación explícita, no premarcada: `adultAttestationConfirmed = true`. Si falta o es `false`, no se crea el consentimiento ni la recepción.
La declaración forma parte del texto canónico versionado de autorización, por lo que queda cubierta por `authorization_text_version` y `authorization_text_hash`. No se persiste fecha de nacimiento ni un booleano redundante.
Es una restricción operativa del MVP, no una verificación documental de edad. Si la persona no puede declararse mayor de edad, el flujo se rechaza. El tratamiento mediante padre, madre, representante legal u otra figura de representación queda fuera del MVP y requiere contrato de producto específico antes de habilitarse.
### Snapshot del Responsable y operación offline (D-PRIV-05)
Cada `privacy_consent` conserva el snapshot exacto de la identidad del Responsable presentada al titular: `controller_notice_snapshot jsonb NOT NULL`, server-owned e inmutable. Incluye solo los campos que efectivamente se muestran en el aviso (razón social, dirección y canales de contacto/derechos). Sus valores forman parte de la representación canónica del `authorization_text_hash`. Cambios posteriores en `workshops` o `workshop_locations` no modifican consentimientos históricos.
**Online.** El servidor obtiene la configuración vigente del taller, construye el snapshot, resuelve los textos/versiones canónicos, calcula el hash y persiste consentimiento + snapshot de forma atómica.
**Offline.** La PWA no reconstruye el aviso desde datos locales arbitrarios. Mientras está online, el backend entrega un `privacy_notice_bundle` autenticado por el servidor que contiene como mínimo:
- `tenant_id`;
- versión del formato del bundle;
- `privacy_notice_version`;
- versiones de autorización disponibles;
- textos exactos;
- `controller_notice_snapshot`;
- `issued_at` y `expires_at`;
- `key_version`.
El bundle se autentica con HMAC-SHA256 y un secreto versionado del servidor (no se usa PKI/Ed25519 en el MVP: solo el servidor lo verifica). El HMAC cubre los bytes exactos del payload emitido por el backend; no se vuelve a serializar el objeto para verificarlo.
Formato conceptual del envelope:
```text
payload_bytes = UTF-8 exacto producido por el backend
payload = base64url(payload_bytes)
mac = base64url(HMAC-SHA256(key[key_version], payload_bytes))
bundle = payload || "." || mac
```
La PWA conserva el bundle original íntegro en IndexedDB y muestra exactamente su contenido durante la operación offline.
Al sincronizar, el cliente envía el bundle original y el backend:
- separa y decodifica `payload`/MAC;
- verifica el HMAC en tiempo constante sobre esos mismos `payload_bytes` antes de interpretar el JSON;
- verifica tenant, formato, `key_version` y vigencia conforme al contrato offline;
- resuelve `privacy_notice_version` y `authorization_text_version` en el catálogo server-owned e inmutable;
- compara exactamente los textos contenidos en el bundle con los textos publicados para esas versiones;
- usa el `controller_notice_snapshot` del bundle autenticado, no el estado actual de `workshops`/`workshop_locations`;
- calcula server-side el `authorization_text_hash`;
- rechaza cualquier hash o snapshot arbitrario enviado fuera del bundle.
La autenticidad criptográfica del bundle no sustituye la validación semántica de sus versiones. Una versión publicada no se modifica ni se elimina mientras pueda existir evidencia o un bundle que la referencie; un cambio de contenido exige una nueva versión. El snapshot histórico no se contrasta contra el taller actual.
La política exacta de expiración/grace de bundles se implementa con ADR-005 en Sprint 13; S3 solo fija la forma de la evidencia y la autoridad server-side.
### Lock canónico — propietario vs recepción
El cambio de propietario existente en S2 (`transferOwner`) bloquea la fila de `vehicles` con `FOR NO KEY UPDATE`. S3 adopta exactamente el mismo gate. `FOR NO KEY UPDATE` conflictúa con otro `FOR NO KEY UPDATE` y con `FOR SHARE`; `FOR KEY SHARE` no sería suficiente.
`createReception`:
1. `vehicles` `FOR NO KEY UPDATE`;
2. validar el propietario principal vigente;
3. bloquear `privacy_consent` con `FOR SHARE` (RECEPTION-CONSENT-01);
4. insertar la `reception`;
5. auditar.
Dos `createReception` concurrentes para el mismo vehículo se serializan deliberadamente sobre `vehicles FOR NO KEY UPDATE`. El primero puede crear la recepción; el segundo, cuando obtiene el lock, sigue sujeto a `receptions_one_open_vehicle_uq` y recibe `RECEPTION_ALREADY_OPEN` si la primera recepción continúa abierta.
El trigger PostgreSQL de respaldo también toma `FOR NO KEY UPDATE` sobre `vehicles` antes de resolver la fila vigente de `vehicle_owners`.
- Si `transferOwner` gana: cambia el propietario, `createReception` despierta, ve al nuevo propietario y rechaza al customer obsoleto.
- Si `createReception` gana: valida al propietario actual, el INSERT es válido, `transferOwner` continúa después y la recepción histórica permanece válida.
Implementación: el `createReception` de S3-03 hoy solo hace lecturas acotadas de `vehicles` y `customers` sin bloquear el vehículo; este cambio entra explícitamente en S3-04.5.
### Migración (fail closed)
La migración que agrega `receptions.privacy_consent_id`, `privacy_consents.authorization_text_hash` y `privacy_consents.controller_notice_snapshot` no hace backfill ficticio: no se inventan consentimientos, hashes ni snapshots para datos legacy. Antes del piloto la política es abortar:
- Si existe una `reception` legacy sin consentimiento verificable, la migración falla y hace rollback completo.
- Si existe un `privacy_consents` legacy cuyo texto o identidad exactos no pueden reconstruirse, la migración falla y hace rollback completo.
- Sin legacy incompatible, la migración pasa.
### Decisiones

| ID | Decisión | Estado |
| --- | --- | --- |
| D-PRIV-01 | `receptions.privacy_consent_id` NOT NULL con FK compuesta `(tenant_id, id)`; el consentimiento debe ser `service_provision`, del mismo `customer_id`, con `status='granted'`, `revoked_at IS NULL` y `created_at` (server) anterior o igual al de la recepción, bloqueado con `FOR SHARE` durante la validación. Ver Diccionario 01 §15. | Aceptada (2026-09-28) |
| D-PRIV-02 | Prueba del texto presentado: `authorization_text_hash char(64) NOT NULL` y `controller_notice_snapshot jsonb NOT NULL` (identidad del Responsable mostrada, inmutable) en `privacy_consents`, ambos calculados/tomados por el servidor desde un catálogo inmutable versionado en código (representación canónica arriba). No se crea `privacy_notice_versions` en el MVP. | Aceptada (2026-09-28) |
| D-PRIV-03 | Quien entrega y quien recibe. El dueño entrega y es el titular (`receptions.customer_id`, firma y consentimiento). Quien recibe queda en `received_by_membership_id` según quién registre. `customer_id` debe ser el propietario principal vigente del vehículo. Entrega por un tercero (conductor autorizado, o representante/contacto de persona jurídica) queda fuera del MVP. | Aceptada (2026-09-28) |
| D-PRIV-04 | Mayoría de edad por declaración del titular (`adultAttestationConfirmed = true`), sin fecha de nacimiento ni booleano redundante; cubierta por el texto canónico versionado y su hash. Ver §1.1. | Aceptada (2026-09-29) |
| D-PRIV-05 | `controller_notice_snapshot jsonb NOT NULL` inmutable; operación offline con `privacy_notice_bundle` autenticado por HMAC-SHA256 sobre los bytes exactos emitidos por el servidor, guardado íntegro en IndexedDB, verificado criptográficamente y contrastado semánticamente contra el catálogo versionado al sincronizar. Expiración/grace en ADR-005 (Sprint 13). Ver §1.1. | Aceptada (2026-09-29) |

D-PRIV-02 agrega las columnas `authorization_text_hash` y `controller_notice_snapshot` a `privacy_consents`; D-PRIV-03 no cambia el schema, pero endurece `createReception` (ver Diccionario 01 §15). Este texto define requisitos de producto; antes de comercializar conviene revisión jurídica colombiana.

# 2. data_subject_requests — mixed-scope
```text
id | uuid | NOT NULL | PK | global/mixed
controller_scope | varchar(16) | NOT NULL | CHECK tenant|ilvox |
tenant_id | uuid | NULL | FK workshops(id) | required scope=tenant; NULL scope=ilvox
customer_id | uuid | NULL | tenant-safe cuando scope=tenant |
user_id | uuid | NULL | FK users(id) | posible titular ILVOX
subject_reference | varchar(255) | NULL | - | referencia externa mínima si no hay FK
request_type | varchar(16) | NOT NULL | CHECK consult|update|correct|delete|revoke |
status | varchar(24) | NOT NULL DEFAULT received | CHECK received|in_review|awaiting_information|resolved|rejected |
received_at | timestamptz | NOT NULL | - |
due_at | timestamptz | NOT NULL | - | calculado por procedimiento aplicable
resolved_at | timestamptz | NULL | required resolved/rejected |
resolution | text | NULL | - | requerido al cerrar
evidence_reference | text | NULL | - | no secrets
assigned_to_reference | varchar(160) | NULL | - | operativo, NO autoridad; se migrará a plataforma interna futura
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
CHECK: `controller_scope=tenant <=> tenant_id IS NOT NULL`; `ilvox => tenant_id IS NULL`. `customer_id` solo puede usarse en scope tenant y debe pertenecer al mismo tenant; scope ilvox usa `user_id` y/o `subject_reference`. Al menos un identificador de titular/caso debe existir. Acceso mediante servicio/resolver mixed-scope, no policy tenant genérica.

# 3. privacy_security_incidents — mixed-scope
```text
id | uuid | NOT NULL | PK |
controller_scope | varchar(16) | NOT NULL | CHECK tenant|ilvox |
tenant_id | uuid | NULL | FK workshops(id) | scope semantics
detected_at | timestamptz | NOT NULL | - |
reported_internally_at | timestamptz | NOT NULL | - |
systems_affected | text[] | NOT NULL | - | categorías/sistemas, no secrets
categories_of_data | text[] | NOT NULL | - |
estimated_records | integer | NULL | CHECK >=0 |
risk_level | varchar(16) | NOT NULL | CHECK low|medium|high|critical |
containment_actions | text | NULL | - |
sic_report_required | boolean | NOT NULL DEFAULT false | - | decisión documentada
sic_reported_at | timestamptz | NULL | - |
status | varchar(20) | NOT NULL DEFAULT open | CHECK open|investigating|contained|resolved|closed |
postmortem_reference | text | NULL | - |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
CHECK scope igual a DSR. Si `sic_reported_at` existe, `sic_report_required=true`. Mixed-scope access control; nunca exposición a tenant por una RLS genérica cuando el incidente es ILVOX-scope.

# 4. legal_acceptances
```text
id | uuid | NOT NULL | PK | append-only acceptance evidence
acceptance_scope | varchar(16) | NOT NULL | CHECK global_user|tenant |
tenant_id | uuid | NULL | FK workshops(id) | required tenant scope
accepted_by_user_id | uuid | NOT NULL | FK users(id) |
document_type | varchar(32) | NOT NULL | CHECK terms|privacy_policy|dpa|commercial_terms|other |
document_version | varchar(40) | NOT NULL | - |
document_hash | varchar(128) | NOT NULL | - | exact content hash
accepted_at | timestamptz | NOT NULL | - |
ip_address | inet | NULL | - |
user_agent | text | NULL | - |
channel | varchar(24) | NOT NULL | CHECK web|admin|import|other |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
```
Append-only: no se persiste `superseded` mutable. Estado efectivo **superseded** se deriva si existe una aceptación posterior aplicable del mismo `document_type`; cualquier revocación jurídicamente aplicable se registra como evento/proceso separado, no reescribiendo evidencia. Partial uniques: tenant `(tenant_id,accepted_by_user_id,document_type,document_version)`; global `(accepted_by_user_id,document_type,document_version) WHERE tenant_id IS NULL`.

# 8. sync_operations
```text
id | uuid | NOT NULL | PK |
tenant_id | uuid | NOT NULL | UNIQUE(tenant_id,id) |
operation_id | uuid | NOT NULL | UNIQUE(tenant_id,operation_id) | client idempotency identity
device_id | varchar(160) | NULL | - | no autoridad
membership_id | uuid | NOT NULL | composite FK memberships | actor revalidado online
operation_type | varchar(80) | NOT NULL | - | allowlisted command type
entity_type | varchar(80) | NOT NULL | - |
entity_id | uuid | NULL | - |
base_version | integer | NULL | CHECK >0 | optimistic conflict input
status | varchar(24) | NOT NULL | CHECK queued|syncing|applied|conflict|retryable_error|permanent_error | server result
result_json | jsonb | NULL | - | safe/minimal
client_created_at | timestamptz | NULL | untrusted informational |
received_at | timestamptz | NOT NULL DEFAULT now() | - |
processed_at | timestamptz | NULL | - |
```
El actor canónico es `membership_id`, no un `user_id` suelto. Sync reejecuta RBAC/RLS/guards. `client_created_at` nunca decide ordering/authorization por sí solo.

# 10. feature_flags
```text
id | uuid | NOT NULL | PK | mixed scope
tenant_id | uuid | NULL | FK workshops(id) | solo tenant scope
plan_id | uuid | NULL | FK plans(id) | solo plan scope
feature_key | varchar(120) | NOT NULL | - |
scope | varchar(16) | NOT NULL | CHECK global|plan|tenant |
enabled | boolean | NOT NULL | - |
value_json | jsonb | NULL | - | REPLACE semantics, no deep merge
enabled_from | timestamptz | NULL | - |
enabled_until | timestamptz | NULL | CHECK > enabled_from cuando ambos |
created_at | timestamptz | NOT NULL DEFAULT now() | - |
updated_at | timestamptz | NOT NULL DEFAULT now() | - |
```
CHECK scope: global =\> tenant/plan NULL; plan =\> solo plan; tenant =\> solo tenant. Partial unique por feature/scope. Precedencia `tenant > plan > global > code default`; `enabled=false` específico bloquea fallback. `scheduled/expired` no aplica y permite bajar al siguiente scope. `value_json` de la fila ganadora reemplaza el valor inferior completo; no se fusionan objetos entre scopes.

