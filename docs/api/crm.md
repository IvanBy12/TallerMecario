# Contratos HTTP de clientes, vehículos y propietarios

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🏗️ Arquitectura Técnica v1 — TallerMecario](https://app.notion.com/p/3de6ab0a330d817ab78bcbd88c100e5a?pvs=204) · última edición: 2026-09-28T14:28:04.864Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

expectedUpdatedAt debe circular como string opaco exacto; convertirlo a Date pierde microsegundos. Los POST CRM no ofrecen deduplicación universal.

---

## 13.4 Clientes, vehículos y propietarios (Sprint 2, S2-02) — contrato backend ↔ PWA
```text
POST  /api/v1/customers                        tenant route: customers.create
GET   /api/v1/customers                        tenant route: customers.read
GET   /api/v1/customers/:customerId            tenant route: customers.read
PATCH /api/v1/customers/:customerId            tenant route: customers.update
POST  /api/v1/vehicles                         tenant route: vehicles.create (+ vehicle_owners.manage en el servicio)
GET   /api/v1/vehicles                         tenant route: vehicles.read, scope tenant (?plate=)
GET   /api/v1/vehicles/:vehicleId              resource route: vehicles.read (tenant | assigned)
PATCH /api/v1/vehicles/:vehicleId              tenant route: vehicles.update
GET   /api/v1/vehicles/:vehicleId/owners       tenant route: customers.read (+ vehicles.read scope tenant en el servicio)
POST  /api/v1/vehicles/:vehicleId/owners       tenant route: vehicle_owners.manage
```
- **Convenciones:** JSON camelCase en request y response; ids `customerId`, `vehicleId`, `ownershipId`. Bodies estrictos: cualquier propiedad no listada → 400. Tenant, actor, `id`, `createdAt`, `updatedAt`, `validFrom`, `validTo`, `relationshipType` e `isPrimary` nunca vienen del cliente. `:customerId`/`:vehicleId` malformado, inexistente o de otro tenant → el mismo 404 (código y cuerpo). `cache-control: no-store`. El body `role_code` de §13.2 queda como excepción histórica.
- **DTOs** (timestamps ISO-8601 UTC):
	- `CustomerDto = { customerId, firstName, lastName, phone, email|null, documentType|null, documentNumber|null, notes|null, createdAt, updatedAt }`.
	- `VehicleDto = { vehicleId, plate, vehicleType, brand, model, modelYear|null, color|null, vin|null, engineNumber|null, currentMileageKm|null, createdAt, updatedAt }`.
	- `VehicleTechDto = { vehicleId, plate, vehicleType, brand, model, modelYear|null, color|null }`: sin VIN, número de motor, kilometraje, timestamps ni datos de cliente/propietario.
	- `OwnershipDto = { ownershipId, vehicleId, customerId, relationshipType, isPrimary, validFrom, validTo|null }`.
	- `OwnerHistoryItemDto = { ownershipId, customerId, customer: { firstName, lastName }, relationshipType, isPrimary, validFrom, validTo|null }`: sin email, phone, documentType, documentNumber ni notes.
- **Respuestas:** POST customer 201 `{ customer }`; GET y PATCH customer 200 `{ customer }`; listado 200 `{ customers, nextCursor }`; POST vehicle 201 `{ vehicle, ownership }`; GET vehicle 200 `{ vehicle }` (`VehicleDto` o `VehicleTechDto` según el scope); listado 200 `{ vehicles, nextCursor }`; PATCH vehicle 200 `{ vehicle }`; GET owners 200 `{ owners }`; POST owners 201 `{ ownership }` si cambia el propietario, 200 `{ ownership }` si es no-op.
- **Requests:**
	- POST customer: `{ firstName, lastName, phone, email?, documentType?, documentNumber?, notes? }`. Los opcionales `email`, `documentType`, `documentNumber` y `notes` aceptan también `null` (S2-04).
	- PATCH customer: `{ expectedUpdatedAt, …subconjunto no vacío de los campos del POST }`; `email`, `documentType`, `documentNumber` y `notes` aceptan `null`; `firstName`, `lastName` y `phone` no.
	- POST vehicle: `{ customerId, plate, vehicleType, brand, model, modelYear?, color?, vin?, engineNumber? }`. Los opcionales `modelYear`, `color`, `vin` y `engineNumber` aceptan también `null` (S2-05).
	- PATCH vehicle: `{ expectedUpdatedAt, …subconjunto no vacío de plate, vehicleType, brand, model, modelYear, color, vin, engineNumber }`; `modelYear`, `color`, `vin` y `engineNumber` aceptan `null` (= limpiar el campo); `plate`, `vehicleType`, `brand` y `model` no. `customerId` no se cambia por PATCH (ver propietarios).
	- `currentMileageKm` es solo lectura en Sprint 2: snapshot de conveniencia server-owned; Sprint 3 define su actualización desde recepción.
	- POST owners: `{ customerId, expectedCurrentOwnershipId }`, ambos obligatorios; `expectedCurrentOwnershipId` es un UUID o `null` (= “el vehículo no tiene propietario vigente”).
- **Validación y normalización** (Diccionario 01 §10–§11):
	- Texto (nombres, notas, brand, model, color, documentType, documentNumber, vin, engineNumber): regla de texto del proyecto — NFC, trim, rechazo de caracteres de control/bidi, no vacío cuando la columna es NOT NULL y longitudes del Diccionario (en `customers`, `notes` tiene regla propia multilínea: ver «Clientes — cierre S2-04»). `modelYear` 1886–2200; `vehicleType` `car | motorcycle | other`.
	- `plate`: trim → eliminar espacios, `-` y `.` → mayúsculas ASCII → validar `^[A-Z0-9]{1,16}$`. Se guarda y se devuelve la forma canónica (`abc-123`, `ABC 123`, `ABC.123` y `ABC123` → `ABC123`). Cualquier otro carácter, incluidos los no ASCII, → 400.
	- `phone`: eliminar espacios, `-`, `.`, `(` y `)` → validar `^\+?[0-9]{7,15}$`. Se guarda normalizado; no se asume indicativo de país; sin unicidad.
	- `email`: trim + validación de formato existente; sin lowercase canónico; sin unicidad.
	- `documentType` y `documentNumber`: ambos con valor o ambos `null`/ausentes, evaluado sobre el estado resultante (tras un PATCH, la fila mezclada; ver «Clientes — cierre S2-04»). `documentType`: texto 1–24 sin catálogo. `documentNumber`: trim + NFC, sin otra canonicalización; sin unicidad.
- **Clientes — cierre S2-04 (S2-04 DOC_GAP-01…05: CLOSED; bitácora en ****`docs/S2-04-DOC-CHANGES.md`****):**
	- **Obligatorios y anulables (DOC_GAP-02):** `firstName`, `lastName` y `phone` rechazan `null`, `""` y cualquier valor que quede vacío tras normalizar (→ 400). `email`, `documentType`, `documentNumber` y `notes` aceptan `null` en POST (donde son opcionales) y en PATCH (`null` = limpiar el campo). En esos cuatro campos, un valor que tras su normalización queda `""` (p. ej. `""` o solo espacios exteriores) se canonicaliza a `null`: nunca se almacenan strings vacíos.
	- **Par de documento (DOC_GAP-02):** `documentType` y `documentNumber` terminan ambos `null` o ambos con valor válido, nunca solo uno. En PATCH se evalúa sobre el estado resultante tras mezclar el patch con la fila existente. Ejemplo: `documentType: "CC"` + `documentNumber: ""` → `documentNumber = null` → estado roto → 400 `REQUEST_VALIDATION_FAILED`.
	- **`notes`**** (DOC_GAP-03/04):** texto libre multilínea. Normalización: Unicode bien formado → NFC → CRLF → LF y CR → LF → trim exterior → si queda vacío, `null`. Se permiten LF (U+000A) internos; no se colapsan espacios internos ni líneas múltiples ni se eliminan saltos de línea internos. Se rechazan TAB (U+0009), los demás caracteres de control C0/C1 y los de control bidi (→ 400). Máximo 2000 code points tras normalizar (→ 400 `REQUEST_VALIDATION_FAILED`); la columna sigue siendo `text` (sin migración). La excepción de LF es exclusiva de `notes`: `firstName`, `lastName`, `email`, `documentType`, `documentNumber`, `phone` y el filtro `name` siguen la regla general de rechazo de caracteres de control.
	- **Tamaño del body (DOC_GAP-03):** `POST /customers` y `PATCH /customers/:customerId` usan `bodyLimit` = 16384 bytes (16 KiB); si se excede → 413 `PAYLOAD_TOO_LARGE` (mapper existente).
	- **PATCH no-op (DOC_GAP-01):** `expectedUpdatedAt` sigue siendo obligatorio y el OCC se valida siempre antes de decidir el no-op: 1) resolver el customer bajo TenantContext/RLS; 2) inexistente o de otro tenant → 404 `CUSTOMER_NOT_FOUND`; 3) comparar `expectedUpdatedAt` conservando microsegundos; 4) obsoleto → 409 `RESOURCE_VERSION_CONFLICT`, aunque el payload resulte idéntico; 5) normalizar y mezclar el patch; 6) calcular `changed_fields`. Si `changed_fields` queda vacío → 200 con el `CustomerDto` actual, sin UPDATE, sin modificar `updated_at`, sin `customer.updated` ni fila en `audit_logs`.
	- **Filtro de nombre:** `name` es el único filtro de nombre de `GET /customers`; no existen los query params `firstName` ni `lastName`. Requisito verificable: `ÁLVARO` y `álvaro` coinciden entre sí; `alvaro` no coincide con `Álvaro` (distingue acentos). La implementación demuestra en PostgreSQL 18 que su expresión cumple ambos requisitos; una comparación sin case-folding Unicode (p. ej. collation `"C"`) no cumple.
- **Vehículos — cierre S2-05 (S2-05 DOC_GAP-01…03: CLOSED; bitácora en ****`docs/S2-05-DOC-CHANGES.md`****):**
	- **Obligatorios y anulables (DOC_GAP-02):** en POST, `customerId`, `plate`, `vehicleType`, `brand` y `model` son obligatorios y rechazan `null`; `plate`, `brand` y `model` rechazan además `""` y cualquier valor que quede vacío tras normalizar (→ 400). `modelYear`, `color`, `vin` y `engineNumber` son opcionales anulables. POST: ausente → `null`; `null` explícito → `null`. PATCH: ausente → sin cambio; `null` explícito → limpiar el campo; `plate`, `vehicleType`, `brand` y `model` no aceptan `null`. En `color`, `vin` y `engineNumber`, un valor que tras la regla de texto del proyecto queda `""` (p. ej. `""` o solo espacios exteriores) se canonicaliza a `null`: nunca se almacenan strings vacíos. `modelYear`: `null` → `null` (en PATCH lo limpia); un valor no nulo debe ser entero en 1886–2200 (→ 400 `REQUEST_VALIDATION_FAILED`). `vin` y `engineNumber` no tienen canonicalización adicional a la regla de texto del proyecto (sin mayúsculas, sin quitar separadores, sin validar formato ni checksum de VIN).
	- **PATCH no-op (DOC_GAP-01):** `expectedUpdatedAt` sigue siendo obligatorio y el OCC se valida siempre antes de decidir el no-op: 1) resolver el vehicle bajo TenantContext/RLS; 2) malformado, inexistente o de otro tenant → 404 `VEHICLE_NOT_FOUND`; 3) comparar `expectedUpdatedAt` conservando microsegundos; 4) obsoleto → 409 `RESOURCE_VERSION_CONFLICT`, aunque los valores pedidos sean iguales a los actuales; 5) normalizar y mezclar el patch; 6) calcular `changed_fields`. Si `changed_fields` queda vacío → 200 con el `VehicleDto` actual, sin UPDATE, sin modificar `updated_at` ni `xmin`, sin `vehicle.updated` ni fila en `audit_logs`. Si hay cambios → UPDATE condicional (OCC), `updated_at` avanza conservando la semántica de microsegundos de PostgreSQL y se emite `vehicle.updated` con `changed_fields` minimizado.
	- **Nombres en ****`changed_fields`**** (DOC_GAP-03):** mismo criterio que customer (Operación §5.2): nombres de columna snake_case del conjunto `plate`, `vehicle_type`, `brand`, `model`, `model_year`, `color`, `vin`, `engine_number`, sin duplicados y siempre en ese orden.
- **Paginación y búsqueda:** keyset por `id DESC` (UUIDv7 ≈ orden de creación; `id` único es el desempate); cursor opaco base64url versionado; `limit` 20 por defecto, 100 máximo.
	- `GET /customers`: filtros opcionales combinables con AND. `phone`: misma normalización, igualdad exacta. `documentNumber`: trim/NFC, igualdad exacta. `name`: prefijo sin distinguir mayúsculas sobre `first_name` o `last_name` (distingue acentos). Sin filtros → listado paginado.
	- `GET /vehicles`: `plate` opcional, con el mismo normalizador e igualdad exacta (placa inválida → 400); sin filtro → listado paginado.
	- Se usan los índices existentes (ERD §17); no hay índices nuevos. Diferidos: `q` libre, email, VIN, prefijo/contains de placa, `unaccent` y trigram.
	- Las query strings de búsqueda CRM contienen PII: los logs registran la plantilla de ruta, nunca la query (Operación §6.3).
- **Propietario inicial:** `POST /vehicles` exige `customerId` y, en una sola transacción, inserta el vehículo y su `vehicle_owners` inicial (`relationship_type = owner`, `is_primary = true`, `valid_from` = hora del servidor). Requiere además `vehicle_owners.manage`. Cliente inexistente o de otro tenant → 404 `CUSTOMER_NOT_FOUND`. Ningún fallo deja un vehículo sin propietario. La invariante “todo vehículo tiene propietario” es de aplicación en Sprint 2 (sin constraint trigger).
- **Propietario actual:** la fila `is_primary = true AND valid_to IS NULL` (máximo una, Diccionario 01 §12). La API de Sprint 2 solo crea relaciones `owner` primarias; las relaciones secundarias no se exponen (diferido).
- **Cambio de propietario** (`POST /vehicles/:vehicleId/owners`), en una transacción única:
	1. `SELECT … FROM vehicles WHERE id = $v FOR NO KEY UPDATE` bajo RLS; 0 filas → 404 `VEHICLE_NOT_FOUND`.
	2. Verificar el cliente (404 `CUSTOMER_NOT_FOUND`) y releer el propietario vigente.
	3. Si `customerId` ya es el propietario vigente → 200 no-op con la fila vigente: sin fila nueva ni auditoría.
	4. Si `expectedCurrentOwnershipId` no coincide con la fila vigente (o no es `null` cuando no hay ninguna) → 409 `VEHICLE_OWNERSHIP_CONFLICT`.
	5. `t := clock_timestamp()` después del lock.
	6. Cerrar la fila vigente, si existe, con `valid_to = t`.
	7. Insertar la nueva fila `owner` primaria con `valid_from = t`.
	8. Auditar `vehicle.owner_changed`.
	9. COMMIT. No hay last-write-wins silencioso.
- **Historial** (`GET /vehicles/:vehicleId/owners`): requiere `customers.read` (ruta) y `vehicles.read` con scope tenant (servicio); orden `validFrom DESC, ownershipId DESC`; tope de 200 sin paginación. Technician → 403.
- **Historia inmutable:** `vehicle_owners` es Frozen-on-close (Diccionario §2 y 01 §12); las correcciones y promociones cierran e insertan, nunca editan.
- **Concurrencia optimista:** todo PATCH exige `expectedUpdatedAt`, que es el valor `updatedAt` exacto emitido por el backend, tratado como token opaco extremo a extremo: nunca se convierte a `Date` de JavaScript ni se re-formatea, y conserva la precisión de microsegundos de PostgreSQL. El UPDATE compara `updated_at` con ese valor exacto y fija un nuevo `updated_at`. Sin coincidencia → 409 `RESOURCE_VERSION_CONFLICT`; recurso inexistente o ajeno → 404. No existe columna `version`.
- **Technician** (RBAC §5/§17): `GET /vehicles/:vehicleId` solo con una asignación activa (`released_at IS NULL`) de tipo `lead_technician` o `support_technician` en una `service_order` de ese vehículo; recibe `VehicleTechDto`. Sin asignación → 404 `VEHICLE_NOT_FOUND` (sin oráculo ni auditoría). `quality_control` no cuenta como A en Sprint 2 (se reabre en Sprint 5). Listados/búsqueda, clientes, historial y cambio de propietario → 403 `PERMISSION_DENIED`.
- **Errores estables** `{ error: { code, message, request_id } }`:
	- `CUSTOMER_NOT_FOUND` 404: path o `customerId` del body inexistente, malformado o de otro tenant.
	- `VEHICLE_NOT_FOUND` 404: ídem; también technician sin asignación.
	- `VEHICLE_PLATE_ALREADY_EXISTS` 409: 23505 `vehicles_tenant_plate_key`, en POST y PATCH.
	- `VEHICLE_OWNERSHIP_CONFLICT` 409: premisa obsoleta; backstop 23505 `vehicle_owners_one_primary_uq`.
	- `RESOURCE_VERSION_CONFLICT` 409.
	- `PERMISSION_DENIED` 403.
	- `REQUEST_VALIDATION_FAILED` 400: incluye cursor/limit/query inválidos y el backstop 23514 `vehicles_plate_normalized_check` / `vehicles_plate_format_check`.
	- `REQUEST_BODY_MALFORMED` 400.
	- `UNSUPPORTED_MEDIA_TYPE` 415.
	- Backstops: 23503 de las FKs CRM → el 404 de la entidad según la constraint; 23514 `vehicle_owners_validity_check` / `vehicle_owners_history_guard` y 42501 → 500 `INTERNAL_ERROR` (defecto).
	- Sin `DOMAIN_*`: CRM no tiene máquina de estados.

- **Idempotencia:** UUIDv7 del servidor; sin `Idempotency-Key` CRM en Sprint 2 (§9). Un POST customer reintentado puede duplicar. Un POST vehicle reintentado → 409 de placa, recuperable con `GET /vehicles?plate=`. Un cambio de propietario reintentado → 200 no-op.
- **No incluido (S2-02, diferido):**
	- DELETE de clientes, vehículos o propietarios; archivo/desarchivo de clientes (`customers.archive` sembrado sin endpoint).
	- Relaciones no-owner, primario no-owner, varias relaciones vigentes no primarias y solapes, cerrar sin sucesor, fecha efectiva enviada por el cliente y `valid_to` futuro.
	- Formatos de placa por `vehicle_type`.
	- Canonicalización de email, documento, VIN y número de motor; catálogo de `document_type`; E.164.
	- `Idempotency-Key`; búsqueda por email, VIN y prefijo de placa.
	- Detalle de decisiones y triggers de reapertura en `docs/S2-02-DOC-CHANGES.md`.
