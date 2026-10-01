# Contrato API — Sesión, memberships y contexto de taller (v1)

- **Estado:** APROBADO / CONGELADO (backend). Cierra TA-01, TA-02, TA-03 y TA-07 de la spec frontend `frontend-auth-context-spec.md` (G5).
- **Fecha:** 2026-10-01. Rama `task/me-context-contract`.
- **Implementación:** `src/api/me.ts`, `src/api/me-context.ts`, `src/api/tenant-request.ts`, `src/tenancy/tenant-selection.ts`, `src/api/errors.ts`, `src/api/app.ts` (CORS).
- **Pruebas:** `tests/api/tenant-context-integration.test.cjs` (`describe('GET /api/v1/me')`, `describe('GET /api/v1/me/context')`, `describe('X-Tenant-Id selection')`), `tests/api/security.test.cjs` (CORS).
- **Fuentes canónicas:** Arquitectura Técnica v1 §13; ADR-006 (Clerk = solo identidad); ADR-009 §3/§7 (TenantContext, bootstrap mínimo); RBAC — Matriz v1 §1/§18; decisiones cerradas de S1-02 (selector `X-Tenant-Id`).

Este documento **prevalece** sobre cualquier tabla "observada" en documentos de frontend. Si el código diverge de él, es un bug del backend.

---

## 1. Resumen

| Necesidad del frontend | Dónde | Alcance |
| --- | --- | --- |
| ¿La sesión Clerk es aceptada por el backend? `users.id` local | `GET /api/v1/me` | Global (identidad) |
| Memberships activas / talleres accesibles (ids) | `GET /api/v1/me` → `memberships[]` | Global (identidad) |
| Qué hace el backend sin selector (0/1/N) | `GET /api/v1/me` → `tenantSelection` | Global (identidad) |
| Taller activo: nombre visible, zona horaria, moneda | `GET /api/v1/me/context` + `X-Tenant-Id` | Tenant |
| Roles (informativos) y **permisos efectivos** con scope | `GET /api/v1/me/context` + `X-Tenant-Id` | Tenant |
| Selección del taller activo | Header `X-Tenant-Id` en **cada** request de tenant | Por request |

Paths **definitivos**: `GET /api/v1/me` y `GET /api/v1/me/context`. No existen otros endpoints de sesión/contexto (`/session`, `/workshops/current`, etc.) ni se planean en v1.

**No existe "taller activo" del lado servidor.** El backend no guarda sesión, preferencia ni taller seleccionado: el taller activo es el valor que el cliente envía en `X-Tenant-Id` en cada request, y el servidor lo revalida cada vez (sección 3).

## 2. Global vs. dependiente del tenant

| Dato | Ámbito | Fuente |
| --- | --- | --- |
| Nombre, email, avatar del usuario | **Clerk (cliente)** | El backend **no** los expone (ADR-006; el runtime no lee `users` salvo vía bootstrap). |
| `user.id` (`users.id`) | Global | `/me`, `/me/context` |
| Lista de memberships activas (`membershipId`, `tenantId`) | Global | `/me` |
| `tenantSelection` | Global | `/me` |
| `workshop.displayName`, `timezone`, `currency` | Tenant | `/me/context` (fila `workshops` bajo RLS) |
| `roles`, `permissions` | Tenant (por membership) | `/me/context` (filas `membership_roles`/`role_permissions` bajo RLS) |

Por qué el nombre del taller no está en `/me`: ADR-009 §7 limita las funciones bootstrap pre-tenant a "identificadores mínimos, nunca listas de datos de negocio". El nombre se obtiene con `/me/context` para cada `tenantId` (ver 5.2). Cambiar esto exige enmendar ADR-009 §7 + migración (fuera de v1).

## 3. Selección de taller — `X-Tenant-Id`

Decisión cerrada de S1-02; es el **único** selector. Nunca se lee taller de claims de Clerk, path, query, body, cookies ni metadata.

- Formato: UUID textual exacto (8-4-4-4-12) de `workshops.id` (= `tenantId` de `/me`). Sin trim, sin llaves, sin `urn:`; nil/max UUID rechazados. Mayúsculas se aceptan y se canonicalizan; el cliente **debe** enviar minúsculas (las respuestas siempre van en minúsculas).
- Un solo valor. Header duplicado o lista separada por comas → 400.
- Sin header: 0 memberships activas → `403 ACTIVE_MEMBERSHIP_REQUIRED`; 1 → se usa esa; N → `409 TENANT_SELECTION_REQUIRED`.
- Con header: debe coincidir con una membership **activa** del usuario **activo**; si no → `403 TENANT_ACCESS_DENIED`. **Nunca hay fallback** a otra membership.
- Recomendación normativa para el cliente: enviar `X-Tenant-Id` **siempre** en rutas de tenant, aun con una sola membership (evita 409 si aparece una segunda y ata cada request a un taller concreto).
- `/me` **ignora** `X-Tenant-Id` (no lo interpreta ni lo valida). No enviarlo ahí.
- Cada request de tenant revalida, dentro de su propia transacción, usuario activo + membership activa + tenant. Suspensión/revocación de la membership o deshabilitación del usuario se aplican en el **siguiente** request, sin caché.

## 4. `GET /api/v1/me/context`

Ruta de tenant normal (S1-02): permiso `workshop.read` (scope `tenant`; lo tienen los 4 roles baseline), una transacción, RLS.

**Request**

- Headers: `Authorization: Bearer <session token de Clerk>` (obligatorio); `X-Tenant-Id: <uuid>` (recomendado siempre, ver 3).
- Sin body. La query string se ignora.

**Respuesta 200** — `cache-control: no-store`

```json
{
  "context": {
    "tenantId": "0199a0b2-...",
    "membershipId": "0199a0b2-...",
    "userId": "0199a0b2-...",
    "workshop": {
      "displayName": "Taller El Pistón",
      "timezone": "America/Bogota",
      "currency": "COP"
    },
    "roles": ["admin", "technician"],
    "permissions": [
      { "code": "customers.read", "scopes": ["tenant"] },
      { "code": "quality_checks.perform", "scopes": ["quality_control"] },
      { "code": "vehicles.read", "scopes": ["tenant"] }
    ]
  }
}
```

```ts
type ResourceScope = 'tenant' | 'assigned' | 'quality_control';
type RoleCode = 'owner' | 'admin' | 'service_advisor' | 'technician';

interface MeContextResponse {
  context: {
    tenantId: string;        // UUID minúsculas = workshops.id = valor de X-Tenant-Id
    membershipId: string;    // UUID de la membership validada en esta request
    userId: string;          // UUID users.id (igual a /me user.id)
    workshop: {
      displayName: string;   // workshops.display_name (≤160)
      timezone: string;      // IANA, p. ej. "America/Bogota"
      currency: string;      // ISO 4217 en mayúsculas, p. ej. "COP"
    };
    roles: RoleCode[];       // informativo; orden canónico owner, admin, service_advisor, technician; puede ser []
    permissions: {
      code: string;          // código estable del catálogo RBAC v1 (src/authz/rbac-matrix.ts)
      scopes: ResourceScope[];
    }[];
  };
}
```

**Formato de permisos (normativo)**

- Solo se listan los permisos **concedidos**; un código ausente = denegado. Nunca hay `false`.
- Orden: por `code`, ascendente por bytes. Sin duplicados.
- `scopes` es exactamente uno de:
  - `["tenant"]` — concedido en todo el taller;
  - subconjunto no vacío y ordenado de `["assigned", "quality_control"]` — concedido solo sobre recursos asignados a la membership y/o en control de calidad. El servidor verifica el recurso concreto en cada operación.
- Unión de roles activos (RBAC §1, sin deny-overrides): si algún rol concede `tenant`, el resultado es `["tenant"]` (tenant domina); si no, la unión de scopes restringidos.
- Fuente: filas `role_permissions` en PostgreSQL leídas en la misma transacción — exactamente lo que autoriza cualquier otra ruta en esa request. **Nunca** de Clerk.
- Es **solo para presentación** (mostrar/ocultar acciones). No es prueba de autorización: el servidor autoriza cada operación. El cliente **nunca** envía permisos, roles ni tenant en body/query.
- Un permiso puede cambiar entre requests (cambio de roles). La lista es una instantánea; ante `403 PERMISSION_DENIED` en una operación, recargar el contexto.

## 5. `GET /api/v1/me` (congelado, sin cambios respecto a `5812632`)

Ruta identity-only: autentica, **no** abre transacción de tenant, **no** lee roles/permisos, **no** consulta el perfil de Clerk, **no** crea usuarios ni memberships.

**Request:** `Authorization: Bearer <token>`. Sin `X-Tenant-Id` (se ignora), sin body, sin query.

**Respuesta 200** — `cache-control: no-store`

```ts
interface MeResponse {
  user: { id: string } | null;
  memberships: { membershipId: string; tenantId: string }[];
  tenantSelection: {
    mode: 'unavailable' | 'automatic' | 'required';
    tenantId: string | null;   // solo con mode 'automatic'
  };
}
```

- `memberships`: memberships **activas** del usuario autenticado (usuario `active` + membership `active`), una por taller, orden estable `(tenantId, membershipId)` ascendente. Sin paginación ni tope (un usuario tiene a lo sumo una membership por taller). Memberships `suspended`/`revoked` **no** aparecen.
- `user`: `null` si y solo si `memberships` está vacío.
- `tenantSelection` (qué haría una ruta de tenant **sin** `X-Tenant-Id`):

| `memberships.length` | `mode` | `tenantId` |
| --- | --- | --- |
| 0 | `unavailable` | `null` |
| 1 | `automatic` | el `tenantId` de esa membership |
| ≥2 | `required` | `null` |

### 5.1 Sin membership / membership inactiva

`/me` responde **200** (no 403) con `{ user: null, memberships: [], tenantSelection: { mode: 'unavailable', tenantId: null } }` en todos estos casos, **indistinguibles por diseño** (anti-enumeración; el bootstrap ADR-009 §7 no los separa):

- identidad Clerk válida sin usuario local;
- usuario local sin memberships;
- usuario `disabled`;
- usuario con memberships solo `suspended` y/o `revoked`.

En una ruta de tenant esos mismos casos producen `403 ACTIVE_MEMBERSHIP_REQUIRED` sin header, o `403 TENANT_ACCESS_DENIED` con header. Si el usuario tiene memberships activas en otros talleres, las inactivas simplemente no aparecen.

`unavailable` no implica un destino (crear taller, aceptar invitación): eso es TA-04, fuera de este contrato.

### 5.2 Flujo de arranque recomendado

1. `GET /api/v1/me`.
2. `unavailable` → estado "sin acceso". `automatic` → `GET /api/v1/me/context` con `X-Tenant-Id: tenantSelection.tenantId`. `required` → selector.
3. Selector: para cada `memberships[i].tenantId`, `GET /api/v1/me/context` con ese `X-Tenant-Id` para obtener `workshop.displayName` (y roles). Una respuesta `403` para un taller (`TENANT_ACCESS_DENIED` por revocación entre llamadas, o `PERMISSION_DENIED` por membership sin roles) excluye ese taller del selector.
4. Taller elegido → guardar `tenantId` en memoria (no en almacenamiento persistente) y enviarlo como `X-Tenant-Id` en todas las rutas de tenant.

## 6. Errores

Envelope único: `{ "error": { "code": string, "message": string, "request_id": string } }`. Clasificar por `status` + `code`, nunca por `message`.

| Status | `code` | `/me` | `/me/context` (y toda ruta de tenant) | Significado / acción |
| --- | --- | --- | --- | --- |
| 401 | `AUTHENTICATION_REQUIRED` | ✓ | ✓ | Token ausente, inválido, expirado o `azp`/`iss` no aceptados. |
| 400 | `TENANT_SELECTION_INVALID` | — | ✓ | `X-Tenant-Id` malformado. Bug del cliente. |
| 403 | `ACTIVE_MEMBERSHIP_REQUIRED` | — | ✓ | Sin header y 0 memberships activas. Revalidar con `/me`. |
| 409 | `TENANT_SELECTION_REQUIRED` | — | ✓ | Sin header y ≥2 memberships activas. Ir al selector. |
| 403 | `TENANT_ACCESS_DENIED` | — | ✓ | Header no corresponde a una membership activa del usuario activo (taller ajeno, inexistente, membership suspendida/revocada, usuario deshabilitado). Cuerpo idéntico en todos los casos. Perder el contexto y revalidar con `/me`. |
| 403 | `PERMISSION_DENIED` | — | ✓ | Membership activa sin el permiso de la ruta. En `/me/context`: membership activa **sin roles**. No es pérdida de membership. |
| 429 | `RATE_LIMIT_EXCEEDED` | ✓ | ✓ | Header `Retry-After` (segundos). |
| 500 | `INTERNAL_ERROR` | ✓ | ✓ | Mensaje genérico; mostrar `request_id`. |

`/me` nunca devuelve 403 por falta de membership, ni `IDENTITY_PROVIDER_UNAVAILABLE`/`IDENTITY_EMAIL_UNVERIFIED` (no consulta el perfil de Clerk).

## 7. Headers

| Header | Dirección | Regla |
| --- | --- | --- |
| `Authorization: Bearer <token>` | request | Obligatorio en `/me`, `/me/context` y toda ruta de tenant. Token de sesión de Clerk (sin plantilla propia y valores `azp`/`iss` por entorno: TA-05, fuera de este contrato). |
| `X-Tenant-Id` | request | Solo rutas de tenant (sección 3). No en `/me`. |
| `Content-Type: application/json` | request | Solo en rutas con body (no aplica a estos dos GET). |
| `Cache-Control: no-store` | response | Ambos endpoints (200). |
| `Retry-After` | response | En 429 (y 503 donde aplique). Expuesto por CORS. |

## 8. Caché

- Ambas respuestas llevan `Cache-Control: no-store`: ningún intermediario ni el navegador debe almacenarlas.
- El cliente no persiste `/me` ni `/me/context` (ni el `tenantId` elegido) en `localStorage`/`sessionStorage`/IndexedDB; solo memoria del proceso.
- Cuándo recargar: inicio de sesión o cambio de identidad; cambio de taller; tras `403 TENANT_ACCESS_DENIED`/`ACTIVE_MEMBERSHIP_REQUIRED` o `409 TENANT_SELECTION_REQUIRED` (revalidar con `/me`); tras `403 PERMISSION_DENIED` en una operación (recargar `/me/context`).
- No hay ETag ni validación condicional en v1.

## 9. CORS

- `CORS_ALLOWED_ORIGINS` (lista separada por comas de orígenes exactos; vacío = ningún origen de navegador permitido). Nunca `*`.
- Orígenes permitidos reciben `Access-Control-Allow-Origin: <origen>` y `Access-Control-Allow-Credentials: true`. El cliente no necesita credenciales de cookie: usar `credentials: 'omit'` y `Authorization`.
- Preflight: `Access-Control-Allow-Headers: Authorization, Content-Type, X-Tenant-Id` (lista **explícita**; otros headers no se permiten). Métodos: `GET, POST, PATCH, PUT, DELETE, OPTIONS`.
- `Access-Control-Expose-Headers: Retry-After` — el cliente puede leer `Retry-After` en 429 cross-origin.
- Un header de request nuevo para navegador (p. ej. `Idempotency-Key` cuando alguna ruta lo use) exige ampliar esta lista en `src/api/app.ts` y en este contrato.
- El origen del frontend también debe estar en `CLERK_AUTHORIZED_PARTIES` (claim `azp`), o la autenticación falla con 401.

## 10. Límites conocidos (no forman parte del contrato)

- `workshops.status` (`trialing`/`active`/`suspended`/`cancelled`) **no** se evalúa en la selección ni se expone: no hay regla de negocio documentada sobre acceso a talleres suspendidos/cancelados (DOC_GAP para producto).
- Una membership activa sin roles es posible (S1-05 permite retirar el último rol no-owner): su `/me/context` responde `403 PERMISSION_DENIED`.
- Rate limit global por IP (300/min por defecto) y además por identidad en rutas que lo configuren.

## 11. Sincronización documental

- Arquitectura Técnica v1 §13.0 (export local) referencia este contrato. Pendiente: replicar §13.0 en Notion.
- Sin cambios de schema ni migraciones. Sin cambios en ADR-009.
