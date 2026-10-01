# Roles y ciclo de vida de memberships

Exportación seleccionada de Notion — 2026-09-30 (America/Bogota).

- Fuente: [🏗️ Arquitectura Técnica v1 — TallerMecario](https://app.notion.com/p/3de6ab0a330d817ab78bcbd88c100e5a?pvs=204) · última edición: 2026-09-28T14:28:04.864Z.

Tipo: extracto fiel con formato Markdown normalizado. La selección no constituye un nuevo contrato HTTP ni demuestra implementación desplegada.

Mantener role_code como excepción histórica; no traducirlo a camelCase. Reactivación y salida del taller siguen pendientes.

---

## 13.2 Roles de memberships (S1-05) — contrato backend ↔ PWA
```text
GET    /api/v1/memberships/:membershipId/roles             tenant route: memberships.read
POST   /api/v1/memberships/:membershipId/roles             tenant route: memberships.manage_staff (+ roles.assign_* en el servicio)
       body {"role_code": "owner" | "admin" | "service_advisor" | "technician"}   (additionalProperties: false)
DELETE /api/v1/memberships/:membershipId/roles/:roleCode   tenant route: memberships.manage_staff (+ roles.assign_* en el servicio)
```
- **Respuesta:** `{ "membership": { "membershipId", "status", "roles": [{ "role", "assignedAt" }] } }`, `cache-control: no-store`. POST → 201, DELETE → 200, GET → 200 (también para memberships `suspended`/`revoked`).
- **Autorización** (RBAC §4/§16/§18; solo permission codes, nunca nombres de rol): cambiar el rol R de la membership T exige `memberships.manage_staff`, el permiso de asignación de R **y** el de cada rol que T ya tiene (`owner → roles.assign_owner`, `admin → roles.assign_admin`, `service_advisor|technician → roles.assign_staff`). Efecto: admin gestiona solo staff y no puede tocar una membership que tenga owner/admin. Los permisos del actor se **releen de PostgreSQL después de los locks** (no del snapshot del inicio del request): un actor degradado mientras su request espera queda denegado. Nadie modifica sus propios roles (RBAC §16.6) → 403 `SELF_ROLE_MODIFICATION_FORBIDDEN`.
- **Nunca desde el cliente:** tenant (sale del TenantContext), `assigned_by_membership_id` (= membership del actor autenticado), listas de permisos, claims de Clerk (`org_role`, `org_permissions`, metadata). Campos extra en el body → 400.
- **Errores estables** `{ error: { code, message, request_id } }`: `MEMBERSHIP_NOT_FOUND` 404 (id inexistente, malformado o de otro tenant) · `MEMBERSHIP_NOT_ACTIVE` 409 · `ROLE_ALREADY_ASSIGNED` 409 · `ROLE_NOT_ASSIGNED` 404 · `LAST_OWNER_REQUIRED` 409 · `ROLE_ASSIGNMENT_NOT_ALLOWED` 403 (auditado `denied`, commit durable) · `SELF_ROLE_MODIFICATION_FORBIDDEN` 403 (auditado `denied`, commit durable) · `PERMISSION_DENIED` 403 · `REQUEST_VALIDATION_FAILED` 400 · `UNSUPPORTED_MEDIA_TYPE` 415.



- **No incluido:** comando de reemplazo atómico de rol; `Idempotency-Key` para roles. La gestión de estado `suspend`/`revoke` se define en §13.3.
- **Pendiente (DECISION_REQUIRED, sin cambio en S1-05):** (1) cambios de roles sobre memberships `suspended`/`revoked` (hoy 409 `MEMBERSHIP_NOT_ACTIVE`; lectura permitida); (2) admin sobre membership owner/admin (hoy denegado, derivado de RBAC §16.5); (3) membership activa con 0 roles (hoy permitido retirar su último rol); (4) reactivación y autogestión de memberships: §13.3 documenta `suspend`/`revoke`; el resto sigue DECISION_REQUIRED; (5) reemplazo atómico de rol (no implementado); (6) `Idempotency-Key` en la API (pendiente, igual que S1-04).
## 13.3 Gestión de memberships (S1-06) — contrato backend ↔ PWA
```text
GET  /api/v1/memberships                              tenant route: memberships.read
GET  /api/v1/memberships/:membershipId                tenant route: memberships.read
POST /api/v1/memberships/:membershipId/suspend        tenant route: memberships.manage_staff (+ autoridad sobre el objetivo en el servicio)
POST /api/v1/memberships/:membershipId/revoke         tenant route: memberships.manage_staff (+ autoridad sobre el objetivo en el servicio)
     body: ausente o exactamente {} (application/json)
```
- **Respuesta:** `{ "membership": MembershipDto }` (GET uno, suspend, revoke → 200) y `{ "memberships": MembershipDto[] }` (lista), `cache-control: no-store`. `MembershipDto = { membershipId, status, joinedAt, suspendedAt|null, revokedAt|null, roles: [{ role, assignedAt }] }`. Sin email, nombre ni `user_id`: el runtime no tiene acceso a `users` (ADR-009 §6.3). La lista incluye memberships `active`/`suspended`/`revoked` del tenant, orden `joined_at, id`, tope 200 (sin paginación, igual que §13.1).
- **Transiciones** (ver Estados y Transiciones › Memberships): `suspend` `active → suspended`; `revoke` `active → revoked` y `suspended → revoked` (conserva `suspended_at`). No existe comando de reactivación ni escritura genérica de `status`. Las memberships nunca se borran; los roles se conservan (historial); `users.status` nunca se toca.
- **Autorización** (RBAC §2/§4/§16.4/§16.5; solo permission codes): `memberships.manage_staff` **y** el permiso de asignación de **cada** rol que tiene el objetivo (`owner → roles.assign_owner`, `admin → roles.assign_admin`, `service_advisor|technician → roles.assign_staff`; misma regla que §13.2). Efecto: admin solo gestiona staff (y memberships sin roles); nunca owner/admin. Permisos del actor **releídos de PostgreSQL después de los locks**. Lectura: `memberships.read` (owner, admin).
- **Autogestión:** prohibida (fail-closed, DECISION_REQUIRED): `403 DOMAIN_ACTION_FORBIDDEN`, auditado `denied` `self_membership_modification`, commit durable.
- **Nunca desde el cliente:** tenant (TenantContext), actor (TenantContext), estado destino (lo fija el comando), roles/permisos, claims de Clerk. Cualquier campo en el body → 400; body no JSON → 415.
- **Errores estables** `{ error: { code, message, request_id } }`: `MEMBERSHIP_NOT_FOUND` 404 (id inexistente, malformado o de otro tenant: mismo cuerpo) · `DOMAIN_INVALID_STATE_TRANSITION` 409 (Estados §9) · `LAST_OWNER_REQUIRED` 409 (trigger `m_last_active_owner`; inalcanzable vía API por construcción, backstop) · `DOMAIN_ACTION_FORBIDDEN` 403 (Estados §9; autoridad insuficiente sobre el objetivo o autogestión; auditado `denied`, commit durable) · `PERMISSION_DENIED` 403 · `REQUEST_VALIDATION_FAILED` 400 · `REQUEST_BODY_MALFORMED` 400 · `UNSUPPORTED_MEDIA_TYPE` 415. El cuerpo 409 no incluye `current_state`/`requested_action` (opcional en Estados §9).


- **Efecto en sesiones:** el siguiente request del miembro suspendido/revocado recibe 403 (TenantContext revalida la membership activa en cada request; sin caché).
- **No incluido:** reactivación; autogestión ("salir del taller"); `Idempotency-Key`; motivo libre (`reason`); datos de usuario (nombre/email) en la lista; paginación por cursor.
**DECISION_REQUIRED:** siguen abiertas reactivación, autogestión/salida, nombre/email en lista, motivo, `Idempotency-Key`, efectos colaterales, paginación y privilegio `suspended_at` del worker; ver `docs/S1-06-DOC-CHANGES.md`.
