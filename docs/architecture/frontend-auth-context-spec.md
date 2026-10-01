# Especificación — Autenticación Clerk, ciclo de sesión y contexto de taller (frontend)

- **Tarea:** especificación de la siguiente implementación tras S3-B01. Rol: arquitecto (Claude). Implementa DeepSeek; revisa Codex.
- **Fecha:** 2026-09-30 (America/Bogota). Revisión 3 (con corrección acotada 3.1).
- **Corrección 3.1 (sin ampliar la arquitectura):** (1) prueba 1 de 4.7: los ids del taller anterior desaparecen **siempre**; la identidad desaparece o se conserva según el estado, y AC-A24 cita las transiciones correctas (T9 → `recoverable_error`, T11 → `auth_rejected`, T12 → `fatal_error`); (2) T7 se divide en T7a–T7g con **corte de generación** explícito (revalidación desde `ready` que devuelve `none`, `multiple` sin el par activo, otro taller o otra membership del mismo taller), aborto de las operaciones del contexto descartado y pruebas con respuestas tardías; 6.4 alineado; (3) la espera de un `429` se conserva en `ready.degraded` y en `recoverable_error` (`retryNotBefore`) y se aplica a *Reintentar*; (4) B1/AC-A20a: resultados de aceptación concretos (200 con envelope esperado, o 403/409 con códigos posteriores a la autenticación), 429/5xx/redirección/respuesta inesperada = inconcluso, y control negativo con **bytes de firma JWT realmente alterados**.
- **Revisión 3 — cambios:**
  1. **Estados representables (4.1, 4.2, 4.7):** nuevos estados `fatal_error` (para `contract_violation`/`client_bug`) y `auth_rejected` (401 persistente); el contexto previo ante fallos recuperables se conserva **dentro** de `ready` (`degraded`), nunca fuera de `AuthState`; tabla de transiciones y reglas de **no retención** tras revocación, logout, cambio de identidad, 401 persistente o error fatal; pruebas del reducer.
  2. **Puertos (4.1, 5.3, 6.4):** `WorkshopContextSource.load(attempt)` recibe `{ scope, tokenPolicy }`; el reintento con token fresco es **uno** por operación, usa el **mismo** `scope.signal` y lo orquesta `auth-provider`; el cliente HTTP recibe `tokenPolicy` explícito. El adaptador real sigue siendo G5.
  3. **Transporte (5.3):** validación de la **URL final** (rechazo de `..`, `%2e`, `//`, `\`, `?`, `#`, origen distinto, normalización que altere el path); `redirect: 'manual'` y redirección = violación; cancelación y *timeout* mientras `getToken()` está pendiente **sin** iniciar `fetch`; el token de Clerk se modela como resultado discriminado (`TokenResult`), no como excepción.
  4. **Coherencia G1–G4 (2.3, 4.2, 6.3, 8.1, 8.4):** sin `contextSource`, `loading_identity`, `signed_out` y el cambio de identidad llegan a `signed_in_context_pending`; los códigos del selector pasan a **G5** (la clasificación de `TENANT_*`/`ACTIVE_MEMBERSHIP_REQUIRED` se añade tras TA-01); AC-A20a se separa de G5 con un procedimiento concreto que no consume C-01 ni inventa endpoints (8.2.B).
  5. **Errores de Clerk y 401 (6.1, 6.2):** `ClerkOfflineError` (recuperable, “sin conexión”) se distingue de cualquier otra excepción (`identity_client_error`, sin afirmar red); un 401 persistente **no** se presenta como sesión terminada por Clerk y **no** provoca cierre de sesión automático (política de la aplicación `PROPUESTA`, contrastada con los documentos vigentes).
  6. **Árbol y ubicación (1.1, 5.2):** se incluye `src/vite-env.d.ts`; se fija cuál copia de esta especificación es la vigente.
- **Revisión 2 (histórico):** partición G1–G5; C-01/C-02 `OBSERVADO_BACKEND`; `getToken({ skipCache: true })` verificado; AC por grupo.
- **Estado:** especificación para revisión. **Nada de lo descrito se ha implementado, instalado ni ejecutado.** Todos los AC (sección 8.4) están *Pendiente*.
- **Alcance de esta entrega:** solo este archivo. Sin código, sin dependencias instaladas, sin commit/push/PR/merge, backend solo lectura, sin cambios en `AGENTS.md`, `OPEN-QUESTIONS` ni contratos compartidos.

Convención de estados de contrato usada en todo el documento:

| Estado | Significado |
| --- | --- |
| `VERIFICADO_DOC` | Está en un contrato/documento compartido del frontend (`docs/`). |
| `OBSERVADO_BACKEND` | Existe en código **commiteado** del backend y en sus pruebas, pero **no** está congelado en un contrato compartido. No es autoridad hasta que Track A lo congele. |
| `PROPUESTA` | Decisión de frontend propuesta por este documento. |
| `PENDIENTE_TRACK_A` | Falta el contrato. No se inventa, no se simula como autoridad. |

---

## 1. Estado real y fuentes

### 1.1 Frontend (base de esta especificación)

| Elemento | Hallazgo |
| --- | --- |
| Base | `origin/main` = `16431005b80e6259fe1505be619a024ca78e1226` (merge del PR #1, S3-B01). |
| Aviso | La rama local `main` del checkout principal sigue en `7f470ab` (atrasada). Esta especificación se basó en `origin/main`, no en `main` local. |
| Worktree usado | `C:\Users\leopa\.tallermecario-frontend-worktrees\s3-auth-context-spec`, rama `task/s3-auth-context-spec` desde `origin/main`. Fuera del repositorio y de OneDrive. Los worktrees preexistentes (`s3-b01-bootstrap`) y el código del checkout principal no se tocaron. |
| **Copia vigente de esta especificación** | Hay **dos copias sin versionar**: (a) **vigente/de edición:** `C:\Users\leopa\.tallermecario-frontend-worktrees\s3-auth-context-spec\docs\architecture\frontend-auth-context-spec.md` (rama `task/s3-auth-context-spec`, basada en `origin/main`); (b) **espejo** colocado a petición del usuario en `C:\Users\leopa\OneDrive\Documentos\Proyectos\TallerMecario\docs\architecture\frontend-auth-context-spec.md` (checkout principal, rama `codex/frontend-documentation-base`, que **no** contiene el código de S3-B01). Regla: ante diferencia manda (a); (b) solo se actualiza tras comparar SHA-256 y comprobar que no tiene cambios propios. El hash de cada revisión se informa en la entrega, no se escribe aquí (cambiaría al editar). Ninguna de las dos está en un commit. |
| Código existente | `src/main.tsx`, `src/app/App.tsx` (`App({ envResult })`), `src/shared/config/public-env.ts` (`parsePublicEnv`, solo `VITE_APP_ENV` y `VITE_API_BASE_URL`), `src/vite-env.d.ts` (tipa `ImportMetaEnv` con esas dos variables), `src/test/setup.ts`. **No existen** `src/features/`, cliente HTTP, Clerk, routing ni estado remoto. `apiOrigin` se valida pero no se consume. |
| Toolchain | React 19.3.0 (lockfile), Vite 8, TypeScript 6.0.x, ESLint 10 con límites de capas y `noInlineConfig`, Vitest 5 + jsdom + Testing Library 16 (sin jest-dom, user-event ni msw). Node 22 (`>=22.22.2 <23`). |
| Límites de capas | `features` ⟂ `app`; `shared` ⟂ `app`/`features`; `import()` prohibido en `shared`/`features`. La limitación 7 de S3-B01 (3.2) exige **repetir las sondas de lint al crear la primera feature**: esta tarea la crea (AC-A19). |
| AC-08 | Observación menor de favicon preservada; no se aborda aquí. |

### 1.2 Backend (solo lectura)

- Repositorio: `C:\Users\leopa\OneDrive\Documentos\Proyectos\TallerMecarioB`, rama `fix/s3-production-privacy-v1`, HEAD `8660e09f8e5adb67314ef483d4c547ef15e93fcb` (contenido en `origin/main`).
- El árbol de trabajo del backend tiene cambios sin commit **solo** en `src/privacy/*` y pruebas de privacidad. Las rutas leídas (`src/api`, `src/tenancy`, `src/identity`, `src/onboarding`, `docs`) están limpias: lo leído coincide con HEAD.

| Fuente exacta (backend) | Qué demuestra |
| --- | --- |
| `src/api/me.ts` (commit `5812632` “expose tenant-aware me context”) | `GET /api/v1/me` existe, identity-only. Respuesta `MeResponse`. El propio comentario declara “no canonical DTO exists yet… DOC_DECISION_REQUIRED”. |
| `src/tenancy/tenant-selection.ts` (commit `4e3656b`) | `X-Tenant-Id` (UUID canónico, sin trim, un solo valor) y política 0/1/N membership; selección explícita nunca hace fallback; errores `TENANT_SELECTION_INVALID`, `ACTIVE_MEMBERSHIP_REQUIRED`, `TENANT_SELECTION_REQUIRED`, `TENANT_ACCESS_DENIED`. |
| `src/api/tenant-request.ts` | Ciclo por request en rutas de tenant: identidad → memberships → `X-Tenant-Id` → una transacción → revalidación de membership → RBAC → handler. La membership se **revalida en cada request**. |
| `src/api/app.ts` | Rutas identity-only (`/api/v1/me`, onboarding) vs. rutas de tenant (requieren `config.permission`). Autenticación `authenticate()` → 401 `AUTHENTICATION_REQUIRED`. Rate limit global (429 `RATE_LIMIT_EXCEEDED`). Error 503 `IDENTITY_PROVIDER_UNAVAILABLE` y 403 `IDENTITY_EMAIL_UNVERIFIED` solo en rutas identity-only con `identityProfile: 'required'` (no `/me`). |
| `src/api/errors.ts` | Mapeo estable: 400 `TENANT_SELECTION_INVALID`, 403 `ACTIVE_MEMBERSHIP_REQUIRED`, 409 `TENANT_SELECTION_REQUIRED`, 403 `TENANT_ACCESS_DENIED` (cuerpo único: no-enumeración), 403 `PERMISSION_DENIED`. Errores internos → 500 `INTERNAL_ERROR` saneado. |
| `src/identity/clerk/clerk-identity-provider.ts` | El backend **solo** acepta `Authorization: Bearer <session JWT>`; verificación networkless con `jwtKey`, `authorizedParties` (claim `azp`) y `iss`; las cookies **nunca** se reenvían al SDK. Solo `sub` sale como identidad. |
| `tests/api/tenant-context-integration.test.cjs` (`describe('GET /api/v1/me')`) | Comportamiento: 401 sin token; usuario desconocido/sin membership/deshabilitado/solo inactivas son **indistinguibles** (`user: null`, `memberships: []`, `unavailable`); 1 membership → `automatic`; N → `required`; `/me` no interpreta `X-Tenant-Id`, no abre transacción de tenant, no crea filas; `cache-control: no-store`. |
| `docs/SPRINT-1-FINAL-QUALITY-GATE.md` líneas ~50-55 (backend) | Evidencia registrada por el backend: `/me` 200 en los tres modos; sin membership → 403 `ACTIVE_MEMBERSHIP_REQUIRED` en ruta protegida; N sin header → 409; tenant ajeno/inexistente → 403 `TENANT_ACCESS_DENIED`. |
| `src/memberships/lifecycle-routes.ts` + `docs/api/memberships.md` (frontend) | Membership suspendida/revocada: el **siguiente** request recibe 403 (sin caché). |
| `.env.example` / `src/api/server.ts` (backend) | `CLERK_AUTHORIZED_PARTIES` (orígenes del frontend, sin `*`); `CORS_ALLOWED_ORIGINS` (lista separada por comas, leída en `server.ts`; **no** figura en `.env.example`). |
| `src/onboarding/routes.ts` | `POST /api/v1/onboarding/workshops` existe (identity-only, perfil verificado). **Fuera de alcance** de esta tarea. |

No se ejecutó ninguna prueba ni comando del backend.

### 1.3 Documentos del frontend consultados

`AGENTS.md`; módulos `docs/agents/{architecture,authentication,tenant-rbac,api,ui,quality-workflow,git-worktree}-rules.md`; `docs/architecture/authentication-and-workshop.md`; `docs/decisions/ADR-006-identity.md`; `docs/OPEN-QUESTIONS.md` (FE-DOC-09); `docs/api/conventions-and-errors.md` (§6.7, §9, §13); `docs/api/memberships.md`; `docs/security/frontend-security.md`; `docs/domain/roles-and-permissions.md` (búsqueda dirigida: A/Q, “permisos efectivos = unión de roles”); `docs/architecture/frontend-bootstrap-spec.md` (estructura, límites y formato de AC). No leídos: `docs/api/membership-invitations.md` (invitaciones fuera de alcance; solo se cita su dependencia en 2.2/9), reglas de PWA, media y recepción.

### 1.4 Qué está aprobado, qué existe y qué falta

| Tema | Aprobado en `docs/` | Existe en backend | Falta |
| --- | --- | --- | --- |
| Clerk solo como IdP; sin Organizations/roles/metadata como autoridad (ADR-006) | Sí | Adaptador Clerk conforme | — |
| 401 sesión inválida; 403 sin membership; 403 sin permiso | Sí (ADR-006 §13, Security §5) | Sí | — |
| Bootstrap/contexto (`/me`) y selector (`X-Tenant-Id`) | **No** (FE-DOC-09 abierto) | **Sí, `OBSERVADO_BACKEND`** | Congelar contrato en `docs/` (TA-01) |
| Permisos efectivos del miembro para presentación | No (“shape de permissions” sin congelar) | **No hay endpoint que los devuelva** (`/me` no trae roles/permisos; las rutas de roles exigen `memberships.read`) | Contrato nuevo (TA-02) |
| Nombre visible del taller por membership | No | `/me` solo devuelve ids | Contrato (TA-03) |
| Estado “sin membership” → onboarding | Ambiguo (“403/estado de onboarding”) | `/me`: 200 `unavailable`; ruta de tenant: 403 `ACTIVE_MEMBERSHIP_REQUIRED` | Decisión de producto sobre el destino (TA-06) |

---

## 2. Alcance

### 2.1 Dentro

1. Integración mínima de **Clerk** (`@clerk/react`): proveedor, inicio de sesión embebido, cierre de sesión, lectura de estado de sesión y obtención de token mediante API soportada.
2. **Cliente HTTP mínimo** acotado a esta integración (sección 5.3): solo `GET` JSON, `Authorization: Bearer` por request, `X-Tenant-Id` explícito, normalización de errores, cancelación.
3. **Contexto de taller** del lado cliente: consumo del bootstrap (`GET /api/v1/me`, `OBSERVADO_BACKEND`), máquina de estados, taller activo en memoria, invalidación y protección frente a respuestas tardías.
4. Estados de UX de la sección 4.
5. Extensión de `parsePublicEnv` con la clave publicable de Clerk.

### 2.2 Fuera (dependencias separadas)

| Tema | Tratamiento |
| --- | --- |
| Invitaciones (aceptación por fragmento `#token=`) | Dependencia separada. Interacción a vigilar: `<SignIn />` usa routing por **hash** (sección 5.2); la tarea de invitaciones debe leer y borrar el fragmento con `history.replaceState` **antes** de montar `<SignIn />`. |
| Creación de talleres / onboarding operativo (`POST /api/v1/onboarding/workshops`) | Dependencia separada. El estado “sin acceso” de esta tarea **no** ofrece crear taller. |
| Permisos de presentación (`can(...)`, ocultar acciones por permiso) | **Bloqueado por TA-02.** No se crea ninguna abstracción de permisos hasta que exista el DTO. |
| Selector de taller utilizable (nombres) | **Bloqueado por TA-03** (sección 4.4). |
| Preferencia local de taller | Fuera: no se persiste nada en esta tarea (D-A08). |
| Recepción, media, PWA, service worker, IndexedDB, sincronización, colas | Fuera. |
| Routing, estado remoto global, formularios, Zod, i18n de Clerk | Fuera (D-A02, D-A03). |
| Mutaciones HTTP (POST/PATCH/DELETE) | Fuera: no hay contrato de idempotencia general; el transporte de esta tarea es de solo lectura. |

### 2.3 Partición de la implementación: qué es independiente de TA-01 y qué lo exige

TA-01 (congelar el contrato de contexto del backend) bloquea **únicamente** la integración con ese contrato. Todo lo demás puede implementarse y validarse sin él.

| Grupo | Contenido | Depende de TA-01 |
| --- | --- | --- |
| **G1 — Clerk e identidad** (independiente) | Dependencia `@clerk/react`; `VITE_CLERK_PUBLISHABLE_KEY` en `parsePublicEnv` y `src/vite-env.d.ts`; `ClerkProvider`; `<SignIn />`; cierre de sesión; puerto `AuthSessionPort` (`loading`/`signed_out`/`signed_in`, token como `TokenResult`); obtención de token con `getToken()` y `getToken({ skipCache: true })`; distinción `ClerkOfflineError` / error inesperado; expiración y cambio de identidad reportados por Clerk; aislamiento de Clerk en un solo archivo y su regla de lint. | **No.** Solo usa APIs de Clerk y el contrato de identidad de ADR-006 (Bearer, 401). |
| **G2 — Transporte y errores** (independiente) | `shared/api`: cliente `GET` genérico con validación de URL final, `redirect: 'manual'`, cancelación/timeout incluyendo la espera de `getToken()`; envelope de error `VERIFICADO_DOC` (C-03); clasificación por status y por los códigos que están en documentos compartidos (`PERMISSION_DENIED`, `DOMAIN_ACTION_FORBIDDEN`, `ROLE_ASSIGNMENT_NOT_ALLOWED`, `SELF_ROLE_MODIFICATION_FORBIDDEN`) más la clasificación puramente por status (`401`, `429`, `5xx`, 400/403/409 con código desconocido). Se prueba con rutas y parsers **de prueba** inyectados, **no** con `/api/v1/me`. | **No.** |
| **G3 — Máquina de contexto** (independiente en su parte pura) | `ContextScope`, generaciones, `AbortController`, reintento único con token fresco (`withSingleFreshRetry`), protección de respuestas tardías, reducer puro y su tabla de transiciones (4.7). Trabaja con un **tipo de dominio interno** (`WorkshopContextSnapshot`, ver 4.1) que **no es un DTO**, y con un `WorkshopContextSource` **falso en pruebas**. | **No** mientras la entrada sea ese tipo de dominio. |
| **G4 — Estados de sesión sin contexto** (independiente) | Renderizado de `config_error`, `loading_identity`, `signed_out`, `signed_in_context_pending`, `session_expired`, `auth_rejected`, `recoverable_error`, `fatal_error` (4.2). Sin `contextSource`, `loading_identity`, `signed_out` y el cambio de identidad terminan en `signed_in_context_pending`. | **No.** |
| **G5 — Integración con el contrato de contexto** (**exige TA-01**) | Parser de C-01 (`me-contract.ts`), adaptador concreto de `WorkshopContextSource` (`me-context-source.ts`) que llama `GET /api/v1/me`, mapeo DTO → `WorkshopContextSnapshot`, uso real de `X-Tenant-Id`, **clasificación de los códigos del selector** (`TENANT_SELECTION_INVALID`, `ACTIVE_MEMBERSHIP_REQUIRED`, `TENANT_SELECTION_REQUIRED`, `TENANT_ACCESS_DENIED`, `IDENTITY_EMAIL_UNVERIFIED`) añadida a `api-failure.ts`, revalidación 4.5 contra C-01 y los estados `loading_context`/`no_access`/`workshop_selection_required`/`ready` alimentados por el backend. AC-A07 (parte G5), A08, A09b, A14 (parte G5), A15, A20. | **Sí.** No se crea ni se rotula como “listo” hasta que el contrato esté congelado. |

Antes de TA-01 los códigos del selector **no** se tratan como contrato: una respuesta `400`/`403`/`409` con esos códigos se clasifica solo por status (`bad_request`, `forbidden_unknown`, `conflict`) y no cambia el contexto.

Consecuencia operativa: **G1–G4 se entregan sin TA-01**. Mientras G5 no exista (no hay `contextSource`), toda sesión iniciada —ya sea desde `loading_identity`, desde `signed_out` o por cambio de identidad— llega a `signed_in_context_pending` (4.2): el usuario ve que está autenticado y que el acceso a talleres aún no está integrado. Ese estado **no** concede acceso ni contexto y **no** llama al backend.

---

## 3. Contrato de integración

### 3.1 Tabla de contratos

| # | Método / path | Autenticación | Selector de taller | Request | Respuesta | Errores | Procedencia | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-01 | `GET /api/v1/me` | `Authorization: Bearer <session token de Clerk>` | **Ninguno.** El backend no interpreta `X-Tenant-Id` aquí; no se envía. | Sin body ni query. | `200` `{ user: { id: string } \| null, memberships: { membershipId: string, tenantId: string }[], tenantSelection: { mode: 'unavailable' \| 'automatic' \| 'required', tenantId: string \| null } }`; `cache-control: no-store`. | `401 AUTHENTICATION_REQUIRED`; `429 RATE_LIMIT_EXCEEDED` (header `retry-after`); `5xx` envelope genérico. **No** devuelve 403 por falta de membership: devuelve 200 `unavailable`. | Backend `src/api/me.ts`@`5812632`; prueba `GET /api/v1/me`; quality gate backend líneas ~50-55. | **`OBSERVADO_BACKEND`. No es contrato aprobado.** Parser, adaptador y pruebas contra él = G5, **bloqueado por TA-01** |
| C-02 | Cualquier ruta de tenant (p. ej. `GET /api/v1/memberships`) | Bearer | Header `X-Tenant-Id: <tenantId UUID canónico en minúsculas>`; sin header: 0 membership → 403, 1 → automático, N → 409. Con header explícito nunca hay fallback. | Según la ruta. | Según la ruta. | `400 TENANT_SELECTION_INVALID`; `403 ACTIVE_MEMBERSHIP_REQUIRED`; `409 TENANT_SELECTION_REQUIRED`; `403 TENANT_ACCESS_DENIED` (cuerpo único); `403 PERMISSION_DENIED`; `401`; `429`. | Backend `tenant-selection.ts`, `tenant-request.ts`, `errors.ts`; `docs/api/memberships.md` (403 al siguiente request tras suspensión/revocación). | **`OBSERVADO_BACKEND`. No es contrato aprobado.** Su uso real = G5, bloqueado por TA-01 |
| C-03 | Envelope de error | — | — | — | `{ "error": { "code": string, "message": string, "request_id": string } }` | — | `docs/api/conventions-and-errors.md` §6.7; backend `errors.ts`/`app.ts`. | `VERIFICADO_DOC` |
| C-04 | Contexto autoritativo del taller activo: roles (informativos) y **permisos efectivos** con scope (`tenant` / `assigned` / `quality_control`) | Bearer | Header `X-Tenant-Id` | — | — | — | No existe contrato ni endpoint. | **`PENDIENTE_TRACK_A`** (TA-02) |
| C-05 | Nombre visible del taller por membership (para el selector) | Bearer | — | — | — | — | `/me` solo trae ids. | **`PENDIENTE_TRACK_A`** (TA-03) |
| C-06 | Cierre de sesión | Solo Clerk (`signOut`). No hay llamada al backend. | — | — | — | — | ADR-006 (el backend no guarda sesión propia). | `VERIFICADO_DOC` (por exclusión; sin endpoint) |
| C-07 | Obtención del token | API soportada de Clerk (`useAuth().getToken()`), por request. | — | — | — | — | Documentación oficial de Clerk (sección 6.1). | `VERIFICADO_DOC` (ADR-006) + fuente externa |

Reglas de uso:

- **Estado único de C-01/C-02: `OBSERVADO_BACKEND` hasta que TA-01 se resuelva.** No existe un estado “aprobado/listo para implementar” para ellos. Alcance permitido **antes** de TA-01: ninguno sobre el DTO. No se escribe `me-contract.ts`, no se crea un adaptador que llame `GET /api/v1/me`, no se escriben fixtures con la forma de `MeResponse`, y no se envía `X-Tenant-Id` en ninguna integración real. Lo único permitido es el puerto `WorkshopContextSource` y el tipo de dominio interno `WorkshopContextSnapshot` (4.1), que son decisiones de frontend (`PROPUESTA`) y no copian el DTO.
- **Después de TA-01:** el texto congelado en `docs/api/` **prevalece** sobre las tablas de este documento. Si difiere de lo observado (campos, códigos, semántica), se sigue lo congelado y se actualizan G5 y los AC afectados; no se asume que el backend actual sea el contrato.
- El frontend **no** deriva el taller de claims de Clerk, de la ruta ni de `localStorage`.
- Un `403` sin código estable reconocido se trata como `forbidden_unknown`: ni onboarding ni cambio de contexto.

### 3.2 Clasificación de errores (normativa para `shared/api`)

Se clasifica por **status + `error.code`**, nunca por texto del mensaje. Un `code` solo se acepta si cumple `^[A-Z][A-Z0-9_]{0,79}$` (el backend emite ese formato); si no, se trata como `null`. El `message` del servidor **nunca** se renderiza (copy propio). `request_id` se conserva si es una cadena acotada (≤ 64 caracteres).

**Forma de `ApiFailure`** (campos comunes `requestId: string | null`, `status: number | null`, `code: string | null`; `retryAfterSeconds: number | null` solo en `rate_limited`):

```ts
export type ApiFailureKind =
  // identidad / token (no hubo request o el servidor rechazó la credencial)
  | 'no_session' | 'token_offline' | 'token_error' | 'unauthenticated'
  // denegaciones por operación
  | 'permission_denied' | 'action_forbidden' | 'forbidden_unknown'
  // recuperables
  | 'network' | 'timeout' | 'rate_limited' | 'server_error'
  // no recuperables por el usuario
  | 'client_bug' | 'bad_request' | 'unexpected_status' | 'unexpected_redirect' | 'contract_violation'
  // silenciosa
  | 'aborted';
```

**Clasificación G2 (independiente de TA-01):**

| Condición | `ApiFailure.kind` | Efecto en `AuthState` (4.7) |
| --- | --- | --- |
| `getToken()` → `{ kind: 'no_session' }` (Clerk no tiene sesión) | `no_session` | Sesión terminada **según Clerk** → `session_expired`. No hay request. |
| `getToken()` → `{ kind: 'offline' }` (`ClerkOfflineError`) | `token_offline` | Recuperable, razón `offline`. No hay request. |
| `getToken()` → `{ kind: 'error' }` (cualquier otra excepción) | `token_error` | Recuperable, razón `identity_client_error`. **No** se afirma que sea un fallo de red. No hay request. |
| `401` (cualquier code, esperado `AUTHENTICATION_REQUIRED`) | `unauthenticated` | Un único reintento con token fresco (6.2). Si persiste → `auth_rejected`. **No** implica que Clerk terminó la sesión (puede ser `azp`/`iss`, R-A06). |
| `403 PERMISSION_DENIED` | `permission_denied` | **No** cambia `AuthState`. Mensaje local de la operación. **No** onboarding. |
| `403 DOMAIN_ACTION_FORBIDDEN`, `ROLE_ASSIGNMENT_NOT_ALLOWED`, `SELF_ROLE_MODIFICATION_FORBIDDEN` | `action_forbidden` | Denegación de dominio de una operación; no cambia `AuthState`. (Códigos de `docs/api/memberships.md`; se clasifican para no caer en `forbidden_unknown`.) |
| `403` con otro code o sin code | `forbidden_unknown` | Mensaje genérico; no cambia `AuthState` por sí mismo. Si ocurre al cargar contexto (G5) → `fatal_error` (`contract_violation`). |
| `429` (esperado `RATE_LIMIT_EXCEEDED`) | `rate_limited` | Recuperable. Espera: `retry-after` si es legible (tope 120 s); si no, **5 s** fijos (ver TA-07). La espera se conserva como `retryNotBefore` en `recoverable_error` **y** en `ready.degraded` (4.1) y aplica a *Reintentar* en ambos. |
| `5xx` (incluye `503`, `INTERNAL_ERROR`) | `server_error` | Recuperable manualmente; muestra `request_id`. |
| `400` (cualquier code) | `bad_request` | `fatal_error` (`client_bug`): una `GET` de esta tarea no debería producir 400. |
| Otro `4xx` (404, 409, 405, 413, 415, 422…) sin tratamiento específico | `unexpected_status` | `fatal_error` (`contract_violation`): fuera del contrato de lectura. |
| Redirección (`3xx`, `response.type === 'opaqueredirect'` o `response.redirected === true`) | `unexpected_redirect` | `fatal_error` (`contract_violation`). Ver 5.3 (`redirect: 'manual'`). |
| `2xx` cuyo cuerpo no cumple el parser | `contract_violation` | `fatal_error` (`contract_violation`); **no** concede acceso. |
| Petición local inválida (path o `tenantId` rechazados por 5.3) | `client_bug` | `fatal_error` (`client_bug`). No se llama a `getToken()` ni a `fetch`. |
| `fetch` rechaza (sin respuesta) | `network` | Recuperable, razón `network`. |
| Tiempo agotado (10 s propuesto, cubre `getToken()` + `fetch`) | `timeout` | Recuperable, razón `timeout`. |
| Cancelación propia (`AbortSignal`) | `aborted` | **Silenciosa**; nunca llega a la UI ni al reducer. |

**Se añaden en G5 (tras TA-01)** a la misma tabla, conforme al texto congelado (valores observados, no autoridad):

| Condición (observada) | Kind | Efecto |
| --- | --- | --- |
| `403 ACTIVE_MEMBERSHIP_REQUIRED` en ruta de tenant | `membership_required` | `access_lost` (4.5). |
| `403 TENANT_ACCESS_DENIED` | `tenant_access_denied` | `access_lost` (4.5); membership revocada/suspendida/inexistente (indistinguible por diseño). |
| `409 TENANT_SELECTION_REQUIRED` | `selection_required` | Revalidar con C-01 y ir a 4.4. |
| `400 TENANT_SELECTION_INVALID` | `client_bug` | `fatal_error` (`client_bug`). |
| `403 IDENTITY_EMAIL_UNVERIFIED` | `identity_email_unverified` | Solo rutas identity-only con perfil (fuera de alcance). |

`request_id` se muestra en `recoverable_error`, `auth_rejected` y `fatal_error`.

---

## 4. Estados y UX

### 4.1 Tipos normativos

```ts
// src/features/auth/workshop-context.ts (forma; nombres ajustables según 8.3)
export type IdentityKey = string; // userId:sessionId de Clerk, solo en memoria
export type ContextNotice = 'workshop_access_revoked' | 'workshop_changed';
export type RecoverableReason =
  | 'offline'                // ClerkOfflineError
  | 'network'                // fetch rechazó
  | 'timeout'
  | 'rate_limited'
  | 'server_error'
  | 'identity_client_error'; // cualquier otra excepción de getToken(): causa desconocida, NO se afirma red

export interface DegradedInfo {
  readonly reason: RecoverableReason;
  readonly requestId: string | null;
  /** Epoch ms antes del cual *Reintentar* está deshabilitado; `null` = sin espera. Solo `rate_limited` lo fija (ver abajo). */
  readonly retryNotBefore: number | null;
}

export interface MembershipRef { readonly tenantId: string; readonly membershipId: string }

export type AuthState =
  | { kind: 'config_error'; issues: readonly PublicEnvIssue[] | 'missing_auth_config' }
  | { kind: 'loading_identity' }
  | { kind: 'signed_out' }
  | { kind: 'signed_in_context_pending'; identity: IdentityKey }          // sin contextSource (G5 ausente)
  | { kind: 'loading_context'; identity: IdentityKey; notice: ContextNotice | null }   // G5
  | { kind: 'no_access'; identity: IdentityKey; notice: ContextNotice | null }         // G5
  | { kind: 'workshop_selection_required'; identity: IdentityKey; memberships: readonly MembershipRef[]; notice: ContextNotice | null } // G5
  | { kind: 'ready'; identity: IdentityKey; tenantId: string; membershipId: string; notice: ContextNotice | null; degraded: DegradedInfo | null } // G5; sin permisos: TA-02
  | { kind: 'session_expired' }                                           // Clerk terminó la sesión
  | { kind: 'auth_rejected'; identity: IdentityKey; requestId: string | null }          // 401 persistente
  | { kind: 'recoverable_error'; identity: IdentityKey; reason: RecoverableReason; requestId: string | null; retryNotBefore: number | null }
  | { kind: 'fatal_error'; identity: IdentityKey; reason: 'contract_violation' | 'client_bug'; requestId: string | null };

/**
 * Espera de reintento (misma regla para `ready.degraded` y `recoverable_error`):
 * solo para `rate_limited`: retryNotBefore = at + 1000 × min(failure.retryAfterSeconds ?? 5, 120),
 * donde `at` es la marca de tiempo (ms, Date.now() del proveedor) que lleva la acción `context_failed`.
 * Si `Retry-After` no es legible (p. ej. CORS, TA-07) o no es un número finito ≥ 0 → 5 s.
 * Cualquier otra razón → retryNotBefore = null. El reducer no lee relojes: recibe `at`.
 */

/** Estado del reducer. `generation` es un contador, no contexto de taller. */
export interface AuthStore { readonly generation: number; readonly auth: AuthState }
```

**Invariante de retención (normativo):** los identificadores de taller (`tenantId`, `membershipId`, `memberships`) solo pueden existir en `workshop_selection_required` y `ready`. Ningún otro estado los contiene, y **no** existe ningún campo, variable de módulo, ref ni almacenamiento fuera de `AuthStore` que los conserve (6.4). Única excepción: el `ContextScope` de una **operación en vuelo** vive en la closure de esa operación (copia de lo que había en `AuthStore` al crearla), se aborta y se descarta al cerrar su generación, y nunca se guarda en un `ref`, módulo ni almacenamiento. El único modo de “conservar el contexto previo” ante un fallo recuperable es `ready.degraded`: el contexto no se copia, simplemente no se descarta.

Entrada de dominio **interna** del reducer (PROPUESTA de frontend; no es un DTO ni copia nombres del backend; el mapeo DTO → dominio pertenece a G5) y puertos:

```ts
export type WorkshopContextSnapshot =
  | { readonly kind: 'none' }
  | { readonly kind: 'single'; readonly membership: MembershipRef }
  | { readonly kind: 'multiple'; readonly memberships: readonly MembershipRef[] };

// `TokenPolicy` ('cached' | 'fresh'; 'fresh' ⇒ getToken({ skipCache: true })) y `ApiResult`
// se definen en `@/shared/api/http-client` (5.3); features/auth los importa.

/** Una invocación de la fuente. `scope.signal` cubre la espera de getToken() Y el fetch. */
export interface ContextLoadAttempt {
  readonly scope: ContextScope;
  readonly tokenPolicy: TokenPolicy;
}

// Puerto de G5. Hasta TA-01 no existe implementación concreta (solo dobles de prueba).
export interface WorkshopContextSource {
  load(attempt: ContextLoadAttempt): Promise<ApiResult<WorkshopContextSnapshot>>;
}
```

Contrato del puerto `WorkshopContextSource` (normativo; el adaptador real se escribe en G5):

1. Usa `attempt.scope.signal` para **toda** la operación (token + red). No crea otra señal que la sustituya.
2. Pasa `attempt.tokenPolicy` sin modificarlo al cliente HTTP (`'fresh'` ⇒ `getToken({ skipCache: true })`).
3. **No reintenta por su cuenta.** No decide si hay reintento: lo hace el proveedor.
4. **No lanza**: toda falla se devuelve como `ApiResult` (`ApiFailure`). Si la señal está abortada devuelve `aborted`.

Orquestación del reintento (la implementa `auth-provider`, función pura sobre promesas; se exporta desde `workshop-context.ts` para probarla y para futuras features):

```ts
export async function withSingleFreshRetry<T>(
  scope: ContextScope,
  run: (attempt: ContextLoadAttempt) => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  const first = await run({ scope, tokenPolicy: 'cached' });
  if (first.ok || first.failure.kind !== 'unauthenticated' || scope.signal.aborted) return first;
  return run({ scope, tokenPolicy: 'fresh' }); // única segunda llamada; su resultado se devuelve tal cual
}
```

Propiedades exigidas: (a) **como máximo dos** invocaciones de `run` por operación y nunca una tercera; (b) la segunda usa **el mismo** `scope` (misma `signal` y generación), así que cancelar la generación cancela la operación completa; (c) solo se reintenta ante `unauthenticated` (401 del servidor), **no** ante `no_session`, `token_*`, `network`, `timeout`, 5xx ni 403; (d) si la señal se abortó entre ambas llamadas, no hay segunda llamada; (e) el resultado de la operación se confirma contra la generación **después** del `await` final (6.4).

`ready` significa: *“la instantánea de contexto listó esta membership y no hay evidencia posterior en contra”*. **No es prueba de autorización**: el servidor revalida en cada request. `ready` no expone permisos ni roles hasta TA-02.

### 4.2 Tabla de estados

Estados de **G1/G4** (independientes de TA-01): `config_error`, `loading_identity`, `signed_out`, `signed_in_context_pending`, `session_expired`, `auth_rejected`, `recoverable_error`, `fatal_error`. Estados de **G5** (alimentados por el contrato de contexto; exigen TA-01): `loading_context`, `no_access`, `workshop_selection_required`, `ready` y los avisos de 4.5. El reducer (G3) los cubre con `WorkshopContextSnapshot`, pero no se integran con el backend hasta TA-01.

Salidas marcadas “(sin fuente)” / “(con fuente)” se refieren a la ausencia/presencia de `contextSource` en `AuthContextProvider`.

| Estado | Disparo | UI | Salidas |
| --- | --- | --- | --- |
| `config_error` | Falta `VITE_CLERK_PUBLISHABLE_KEY` o `VITE_API_BASE_URL`, o valores inválidos | Pantalla de configuración (reutiliza el patrón de `ConfigIssues`): nombra variable y motivo, nunca el valor. | Ninguna (requiere redeploy). |
| `loading_identity` | `isLoaded === false` de Clerk | Indicador accesible (`role="status"`, “Cargando sesión…”). No renderiza contenido protegido ni `<SignIn />`. | → `signed_out` si no hay sesión; → `signed_in_context_pending` (sin fuente) o `loading_context` (con fuente) si hay sesión. |
| `signed_out` | `isLoaded && !isSignedIn`, o el usuario pidió cerrar sesión | `<SignIn />` embebido de Clerk (routing hash). Todo dato de contexto anterior ya fue descartado. | → `signed_in_context_pending` (sin fuente) / `loading_context` (con fuente) al iniciar sesión. |
| `signed_in_context_pending` | Sesión activa y **no** hay `contextSource` (G5 pendiente de TA-01) | “Sesión iniciada. El acceso a talleres aún no está integrado.” + *Cerrar sesión*. **No llama al backend** ni muestra datos de taller. | → `session_expired`, `signed_out`; → `loading_context` solo si más tarde se cablea G5 (otra versión de la app). |
| `loading_context` | **(G5)** Sesión activa; cargando el contexto | Indicador accesible “Verificando acceso al taller…”. | → `ready` / `no_access` / `workshop_selection_required` / `recoverable_error` / `auth_rejected` / `fatal_error` / `session_expired`. |
| `no_access` | **(G5)** El contexto indica sin membership activa | Mensaje neutro: “Tu cuenta no tiene acceso activo a un taller.” Acciones: *Reintentar* (revalida), *Cerrar sesión*. **Sin** CTA de crear taller ni de aceptar invitación. No distingue “sin usuario local / deshabilitado / sin membership” porque el backend no puede distinguirlos. | → `loading_context` (reintentar). |
| `workshop_selection_required` | **(G5)** El contexto indica varias memberships | Ver 4.4. | → `ready` al elegir. |
| `ready` | **(G5)** Una membership o selección hecha | Shell autenticado mínimo: identificador no sensible del taller activo (sin PII), *Cerrar sesión*. Si `degraded !== null`: aviso `role="status"` (“No se pudo verificar tu acceso. Reintenta.”) + *Reintentar*, **sin** ocultar el shell. *Reintentar* permanece **deshabilitado** hasta `degraded.retryNotBefore` (si no es `null`) y se habilita solo cuando `Date.now() >= retryNotBefore` (la misma espera que en `recoverable_error`). | Cambio de taller, revocación (→ `loading_context`), expiración, errores fatales. |
| `session_expired` | **Clerk** informa que ya no hay sesión (snapshot `signed_out` sin que el usuario la cerrara) o `getToken()` → `no_session` | “Tu sesión terminó.” Acción: *Iniciar sesión* (→ `signed_out`). Se limpian contexto y requests. | → `signed_out`. |
| `auth_rejected` | `401` persistente tras el único reintento con token fresco | “El servidor no aceptó tu sesión.” Acciones: *Reintentar* (acción del usuario; vuelve a cargar con token en caché por defecto) y *Cerrar sesión*. Muestra `request_id`. **No** cierra la sesión automáticamente (6.2). | → (con fuente) `loading_context`; (sin fuente) `signed_in_context_pending`; → `signed_out`. |
| `recoverable_error` | Fallo recuperable (`offline`, `network`, `timeout`, `rate_limited`, `server_error`, `identity_client_error`) **sin** contexto previo que conservar | Mensaje específico por razón (para `identity_client_error`: “Error al preparar tu sesión”, sin hablar de red) + *Reintentar*; `request_id` si existe; *Reintentar* permanece **deshabilitado** hasta `retryNotBefore` (`rate_limited`: `Retry-After` o 5 s; otras razones: sin espera). | → (con fuente) `loading_context`; (sin fuente) `signed_in_context_pending`. |
| `fatal_error` | `contract_violation` o `client_bug` | “Ocurrió un error inesperado.” + `request_id` si existe. Acciones: *Cerrar sesión* y *Recargar la página*. **Sin** botón de reintento (no es recuperable por el usuario). | → `signed_out`; recarga de página reinicia la app. |

### 4.3 “Autenticado sin acceso” vs. denegaciones 403

- **Sin acceso** (4.2 `no_access`) se decide **solo** por el contexto (G5: modo sin membership) o por `access_lost` por `ACTIVE_MEMBERSHIP_REQUIRED` seguido de una revalidación que confirme ausencia de membership. Es el único camino que lleva al mensaje de “sin taller”.
- `403 PERMISSION_DENIED` / `action_forbidden` son denegaciones **por operación** dentro de un contexto válido: se muestran junto a la acción, no sustituyen la pantalla ni se tratan como onboarding.
- `403 TENANT_ACCESS_DENIED` (G5) **no** es “falta de permiso”: indica que la membership del taller ya no es válida → 4.5.
- `forbidden_unknown` nunca cambia `AuthState` por sí mismo.

### 4.4 Selección de taller

- Modo de un solo taller: sin selector; el `tenantId` viene del contexto.
- Varias memberships: **hace falta un selector**, pero el contexto observado solo da ids → **bloqueado por TA-03**. Hasta entonces `workshop_selection_required` se renderiza como pantalla informativa **no seleccionable** (“Tu cuenta tiene acceso a varios talleres. La selección de taller aún no está disponible.”) con *Cerrar sesión*. Está prohibido mostrar UUIDs como etiquetas, o “Taller 1/2” por orden (el orden no es un contrato).
- Cuando TA-03 exista: el selector es un grupo de radio accesible (nombre del taller); la elección crea el `tenantId` activo **en memoria**, y toda request de tenant lo envía explícitamente (D-A06). La elección no es autorización: el primer request de tenant la valida.
- El `tenantId` elegido solo se acepta si pertenece a `memberships` de la última instantánea; si no, el reducer lo ignora.

### 4.5 Membership revocada o taller cambiado (G5)

Ante `membership_required` o `tenant_access_denied` en cualquier request de tenant (evento `access_lost`):

1. **Invalidar el contexto** (6.4): generación + 1, abortar requests, y **descartar** `tenantId`/`membershipId` (el nuevo estado no los contiene).
2. Pasar a `loading_context` con `notice: 'workshop_access_revoked'` y revalidar **una vez** (misma operación con `withSingleFreshRetry`).
3. Resultado: ninguna membership → `no_access`; una membership → `ready`; varias → `workshop_selection_required`. En los tres casos el estado lleva `notice: 'workshop_access_revoked'` (el aviso viaja desde `loading_context`). Como el taller anterior **no** se conserva, no se puede comparar “taller anterior vs. nuevo”: `workshop_changed` solo se produce en T7d (`ready` → `ready` con `tenantId` distinto, sin invalidación previa).
4. **Anti-bucle sin retener contexto:** si llega otro `access_lost` mientras el estado actual lleva `notice === 'workshop_access_revoked'` (o sea, justo tras una revalidación por revocación), el reducer **falla cerrado** a `no_access` con ese aviso, sin nueva revalidación automática. *Reintentar* (acción del usuario) o descartar el aviso reinicia el ciclo.
5. El aviso es visible (no solo color), descartable y no persiste.

### 4.6 Accesibilidad y copy

Semántica HTML (`main`, encabezados), `role="status"` para cargas y avisos no bloqueantes, `role="alert"` para errores, foco gestionado al cambiar de estado (foco al encabezado de la pantalla), botones operables con teclado, estados no solo por color, responsive móvil/tablet/escritorio sin scroll horizontal, copy en español consistente con `lang="es"`. Los componentes de Clerk quedan en inglés (D-A09; decisión abierta AC-A21). Reintentos automáticos: ninguno salvo el reintento único con token fresco de 4.1; el usuario reintenta con botón.

### 4.7 Transiciones del reducer (normativas) y pruebas

El reducer es **puro**: `(store, action) → store`. Se crea con `createAuthReducer({ hasContextSource: boolean })`. Una acción con `generation` distinta de `store.generation` **se ignora** (se devuelve el mismo objeto `store`). `identity(auth)` = la `identity` del estado si la tiene. Las acciones `context_failed` y `retry_requested` llevan una marca de tiempo `at` (ms, `Date.now()` del proveedor); el reducer no lee relojes.

**Corte de generación (definición normativa).** Una transición *corta* cuando incrementa `generation` (`generation+1`). Un corte implica, en este orden: (1) el nuevo `AuthState` se construye **sin** los datos del contexto descartado (4.1); (2) el proveedor, mediante un efecto ligado a `store.generation`, **aborta** el `AbortController` de la generación anterior —cancelando todas las operaciones que seguían en vuelo con ese contexto— y crea el siguiente; (3) las respuestas de operaciones de la generación anterior que lleguen después se descartan (acción obsoleta en el reducer y comprobación de generación del proveedor, 6.4); (4) no se inicia ninguna operación nueva hasta que exista el controlador de la nueva generación. La operación cuyo resultado provoca el corte ya terminó, así que no se aborta a sí misma. Una transición **sin corte** conserva `generation` y **no** aborta nada.

| # | Acción | Condición | Resultado |
| --- | --- | --- | --- |
| T1 | `session_changed(signed_in, X)` | `identity(auth)` ausente o ≠ `X` | `generation+1`; `auth` = `hasContextSource ? loading_context{X, notice:null} : signed_in_context_pending{X}`. **Nada** del estado anterior sobrevive. |
| T2 | `session_changed(signed_in, X)` | `identity(auth) === X` | Sin cambios. |
| T3 | `session_changed(signed_out)` | `auth` tiene `identity` (cualquier estado con sesión) | `generation+1`; `auth = session_expired` (Clerk terminó la sesión sin petición del usuario). |
| T4 | `session_changed(signed_out)` | `auth` = `loading_identity`/`signed_out`/`config_error`/`session_expired` | `auth = signed_out` (salvo `config_error`, que se conserva). |
| T5 | `session_changed(loading)` | `auth` sin `identity` | `auth = loading_identity`. Con `identity`: se ignora. |
| T6 | `sign_out_requested` | cualquier estado con sesión | `generation+1`; `auth = signed_out` **antes** de llamar a Clerk (6.3). |
| T6b | `sign_out_failed(identity, failure, at)` (la `identity` viene del `snapshot` vivo del puerto, no de un estado previo) | tras T6 y `signOut()` rechazó | `auth = recoverable_error{identity, reason, requestId, retryNotBefore}` (la sesión de Clerk sigue viva; el contexto ya se descartó en T6). Sin corte. |
| T7a | `context_loaded(snapshot)` | `loading_context` | `none` → `no_access`; `single` → `ready{degraded:null}`; `multiple` → `workshop_selection_required`. El `notice` de `loading_context` pasa al estado resultante. **Sin corte** (no hay contexto previo que descartar). |
| T7b | `context_loaded(single, M)` | `ready` y `M.tenantId` = `tenantId` activo **y** `M.membershipId` = `membershipId` activo | **Sin corte:** misma `generation`; `degraded = null`. |
| T7c | `context_loaded(multiple, L)` | `ready` y `L` **contiene** el par activo (`tenantId`, `membershipId`) | **Sin corte** (la selección explícita sigue siendo válida; un usuario multi-taller no vuelve al selector en cada revalidación): misma `generation`; `degraded = null`. |
| T7d | `context_loaded(single, M)` | `ready` y `M.tenantId` ≠ `tenantId` activo | **Corte:** `generation+1`; `ready{tenantId:M.tenantId, membershipId:M.membershipId, notice:'workshop_changed', degraded:null}`. |
| T7e | `context_loaded(single, M)` | `ready`, `M.tenantId` = `tenantId` activo y `M.membershipId` ≠ `membershipId` activo | **Corte** (otra membership = otro contexto de autorización): `generation+1`; `ready{…M…, notice:null, degraded:null}`. |
| T7f | `context_loaded(multiple, L)` | `ready` y `L` **no** contiene el par activo | **Corte:** `generation+1`; `workshop_selection_required{memberships:L, notice:'workshop_access_revoked'}`. |
| T7g | `context_loaded(none)` | `ready` | **Corte:** `generation+1`; `no_access{notice:'workshop_access_revoked'}`. |
| T8 | `context_failed(f, at)` con `f.kind` ∈ {`token_offline`, `token_error`, `network`, `timeout`, `rate_limited`, `server_error`} | `auth` = `ready` | `ready` **conserva** `tenantId`/`membershipId`/`identity`; `degraded = {reason, requestId, retryNotBefore}` (regla de espera de 4.1); misma generación, **sin corte**. |
| T9 | ídem T8 | `auth` ≠ `ready` | `recoverable_error{identity, reason, requestId, retryNotBefore}`; **sin** ids de taller. |
| T10 | `context_failed(no_session)` | cualquier estado con sesión | `generation+1`; `auth = session_expired`. |
| T11 | `context_failed(unauthenticated)` (ya reintentado) | cualquier estado con sesión | `generation+1`; `auth = auth_rejected{identity, requestId}`; contexto **descartado**. |
| T12 | `context_failed(f)` con `f.kind` ∈ {`client_bug`, `bad_request`, `unexpected_status`, `unexpected_redirect`, `contract_violation`, `forbidden_unknown`, `action_forbidden`} al **cargar contexto** | cualquier estado con sesión | `generation+1`; `auth = fatal_error{identity, reason, requestId}` (`client_bug`/`bad_request` → `client_bug`; resto → `contract_violation`); contexto **descartado**. `403 PERMISSION_DENIED` válido al resolver contexto produce `no_access{identity, notice:null, reason:permission_denied, requestId}` con `generation+1`. |
| T13 | `context_failed(aborted)` | — | Se ignora. |
| T14 | `access_lost` (G5) | `notice !== 'workshop_access_revoked'` | `generation+1`; `auth = loading_context{identity, notice:'workshop_access_revoked'}`; contexto **descartado**. |
| T15 | `access_lost` (G5) | `notice === 'workshop_access_revoked'` | `generation+1`; `auth = no_access{identity, notice:'workshop_access_revoked'}`. |
| T16 | `tenant_selected(tenantId)` (G5/TA-03) | `workshop_selection_required` y `tenantId` ∈ `memberships` | `generation+1`; `auth = loading_context{identity, tenantId, notice:null}`; se resuelve `GET /api/v1/me/context` antes de alcanzar `ready`; si no pertenece: se ignora. |
| T17 | `retry_requested(at)` | `recoverable_error`, `no_access`, `auth_rejected`; si el estado tiene `retryNotBefore` no nulo y `at < retryNotBefore`, la acción **se ignora** | **Corte:** `generation+1`; `auth = hasContextSource ? loading_context{identity, notice:null} : signed_in_context_pending{identity}`. |
| T18 | `retry_requested(at)` | `ready` con `degraded`; si `degraded.retryNotBefore` es no nulo y `at < retryNotBefore`, la acción **se ignora** y el proveedor **no** revalida | Sin cambio de estado ni de generación: el proveedor revalida bajo el `scope` vigente; el resultado llega por T7a–T7g/T8/T11/T12. |
| T19 | `notice_dismissed` | estado con `notice` | `notice = null`. |

**Pruebas del reducer (AC-A24/A25/A32/A33, sin Clerk ni red; fixtures de dominio con identificadores **sentinela**):**

1. **No retención de taller (siempre) y de identidad (según el estado):** partiendo de `ready{identity:'id-A', tenantId:'T-A', membershipId:'M-A'}` (y, en un segundo caso, de `workshop_selection_required` con memberships sentinela `T-A/M-A` y `T-B/M-B`), aplicar cada acción de abajo y serializar el nuevo `AuthStore`:
   - **Taller — siempre:** el resultado **no contiene** `'T-A'`, `'M-A'` ni ningún id de las memberships previas, **en todas** las acciones de esta lista. (Las únicas apariciones de ids son los de la **entrada** de la acción, p. ej. el snapshot nuevo de T7d/T7e/T7f, nunca los del contexto descartado.)
   - **Identidad — desaparece** (no contiene `'id-A'`): `sign_out_requested` (T6 → `signed_out`), `session_changed(signed_out)` (T3 → `session_expired`), `context_failed(no_session)` (T10 → `session_expired`) y `session_changed(signed_in,'id-B')` (T1 → contiene `'id-B'`, nunca `'id-A'`).
   - **Identidad — se conserva legítimamente** (contiene `'id-A'`, y **solo** en el campo `identity`): `context_failed(unauthenticated)` (T11 → `auth_rejected`), `context_failed(contract_violation)` (T12 → `fatal_error`), `access_lost` (T14 → `loading_context`), `access_lost` con aviso previo (T15 → `no_access`), `context_failed(token_offline)` desde `loading_context` (T9 → `recoverable_error`) y `sign_out_failed('id-A', …)` (T6b → `recoverable_error`; la identidad procede de la acción, que la toma del `snapshot` vivo). T15 y T9 se alcanzan **encadenando** desde `ready`: `ready` → `access_lost` (→ `loading_context`, sin `'T-A'`/`'M-A'`) → `access_lost` (T15) o `context_failed(token_offline)` (T9); T6b se alcanza con `ready` → `sign_out_requested` (T6) → `sign_out_failed`.
2. **Retención solo degradada:** `ready` + `context_failed(network)` ⇒ `ready` con los mismos `tenantId`/`membershipId`, `degraded` no nulo y misma `generation`; `loading_context` + `context_failed(network)` ⇒ `recoverable_error` sin ids de taller.
3. **Degradado se limpia sin corte:** `ready.degraded` + T7b (`single` con el mismo par) o T7c (`multiple` que contiene el par activo) ⇒ `degraded: null`, misma `generation` y ninguna señal abortada. Los casos con corte (T7d–T7g) se prueban en 10.
4. **Generación obsoleta:** cada acción con `generation` antigua devuelve el mismo objeto (`===`).
5. **Fatales:** cada `kind` de T12 produce `fatal_error` con el `requestId` recibido y **sin** ids de taller; no existe transición a `ready` desde `fatal_error`/`auth_rejected`/`session_expired` salvo pasando por `signed_out` o T17.
6. **Anti-bucle:** `access_lost` con `notice:'workshop_access_revoked'` ⇒ `no_access` (T15), nunca un segundo `loading_context`.
7. **Sin fuente (G4):** con `hasContextSource:false`, T1, T17 y la salida de `auth_rejected` producen `signed_in_context_pending` y **ninguna** acción lleva a `loading_context`.
8. **`sign_out_failed` (T6b):** el resultado no contiene contexto del taller y conserva la identidad en vivo.
9. **`withSingleFreshRetry`** (4.1): (a) `unauthenticated` → exactamente dos llamadas, la segunda con `tokenPolicy:'fresh'` y el **mismo** `scope`; (b) otro fallo o éxito → una sola llamada; (c) `unauthenticated` dos veces → dos llamadas y se devuelve el segundo fallo (nunca una tercera); (d) `scope.signal` abortada entre ambas → una sola llamada; (e) abortar el `scope` durante la segunda llamada → el resultado se descarta (verificado con el proveedor, AC-A11).
10. **Cortes de T7 y respuestas tardías (reducer + proveedor, promesas diferidas; AC-A32).** Partiendo de `ready{T-A/M-A}` en la generación `g`, con una operación **en vuelo** `O1` (p. ej. otra `GET` de prueba bajo el `scope` de `g`) y una revalidación `R`:
    - *Con corte* (T7d `single` con otro taller; T7e `single` del mismo taller con otra membership; T7f `multiple` sin el par activo; T7g `none`): (a) al resolver `R`, `store.generation === g+1` y `auth` según la fila, sin `'T-A'`/`'M-A'` salvo los ids nuevos de la entrada en T7d/T7e; (b) la `signal` de `O1` queda `aborted === true` **antes** de que `O1` se resuelva; `O1` resuelta después con datos de `T-A` ⇒ el estado **no cambia** (mismo objeto) y nada de `T-A` se muestra; (c) otra revalidación `R'` de la generación `g` que se resuelva **después** del corte con `single(T-A/M-A)` ⇒ ignorada (no resucita `ready` de `T-A`); (d) el controlador de `g+1` es distinto y **no** está abortado, y las operaciones nuevas usan su `signal`.
    - *Sin corte* (T7b, T7c): `generation === g`, la `signal` de `O1` **no** está abortada y `O1` puede completarse y aplicarse.
11. **Espera de `429` en `ready.degraded` y en `recoverable_error` (AC-A33; reducer + `auth-gate` con temporizadores simulados).** (a) `ready` + `context_failed(rate_limited, retryAfterSeconds:7, at:1000)` ⇒ `degraded.retryNotBefore === 8000`; sin `Retry-After` legible ⇒ `6000`; `retryAfterSeconds:9999` ⇒ `1000 + 120000`; cualquier razón distinta de `rate_limited` ⇒ `retryNotBefore === null`. (b) `retry_requested(at:7999)` en `ready.degraded` ⇒ ignorada (mismo objeto) y la fuente falsa **no** recibe llamada; `retry_requested(at:8000)` ⇒ procede (la fuente falsa recibe una llamada). (c) UI: *Reintentar* está `disabled` antes de `8000` y se habilita al avanzar el reloj hasta `8000`; mismo comportamiento en `recoverable_error` con `rate_limited`; sin espera en el resto de razones. (d) un nuevo `rate_limited` tras reintentar fija un `retryNotBefore` nuevo (no se acumula con el anterior).

---

## 5. Arquitectura mínima

### 5.1 Decisiones

| ID | Decisión | Justificación |
| --- | --- | --- |
| D-A01 | **Una sola dependencia nueva: `@clerk/react`** (sección 7). | Es el SDK soportado de Clerk para React; implementar sesión/token a mano violaría “APIs soportadas”. |
| D-A02 | **Sin librería de routing.** La app tiene una superficie; el estado de autenticación decide qué se renderiza. `<SignIn />` usa su routing por **hash**, que es el valor por defecto de Clerk en SDKs sin router (documentación oficial) y no requiere router de aplicación. | Regla de arquitectura: routing solo con especificación aprobada. Aún no hay pantallas. **Revisar** cuando exista la 2.ª pantalla o el flujo de invitaciones (que tendrá su especificación). |
| D-A03 | **Sin librería de estado remoto/global ni Zod.** Estado propio con `useReducer` + contexto de React; parsers escritos a mano para C-01. | Una consulta, un contexto. Una librería sería especulativa. |
| D-A04 | **Clerk solo se importa en un archivo** (`src/features/auth/clerk-session.tsx`). El resto del código depende de un **puerto** (`AuthSessionPort`). | Reproduce la regla ADR-006 (“el dominio no importa Clerk”) y permite pruebas locales sin Clerk. Se refuerza con lint (8.1 paso 1). |
| D-A05 | **Transporte mínimo en `shared/api`**, solo lectura (5.3). | `api-rules`: cliente compartido, sin `fetch` en componentes. Solo lo que esta integración necesita. |
| D-A06 | **`X-Tenant-Id` explícito siempre** en rutas de tenant, aun con una sola membership. | Evita 409 si aparece una 2.ª membership; con header explícito el backend no hace fallback (si se revoca → 403, no se cruza a otro taller en silencio); además ata cada request a un contexto concreto. |
| D-A07 | **Token por request y sin caché propia:** `getToken()` en cada request; nunca en estado de React, módulo, storage ni logs. | “No guardes bearer tokens mediante almacenamiento propio”. |
| D-A08 | **El taller activo vive solo en memoria.** Sin `localStorage`/`sessionStorage`/IndexedDB para taller, identidad ni token en esta tarea. | Sin persistencia no hay riesgo de aislamiento por identidad/taller; un usuario multi-taller elige de nuevo tras recargar (aceptable). Regla futura si se persiste: la preferencia se particiona por identidad, se trata como pista no autoritativa y se **revalida** con C-01 antes de usarla (si no coincide con `memberships`, se descarta). |
| D-A09 | **Sin `@clerk/localizations`.** Los componentes de Clerk se muestran en inglés. | Evita una dependencia más; la traducción de la UI de Clerk es mejora opcional posterior. Decisión reversible; ver AC-A21 y sección 9 (TA-08). |
| D-A10 | **`credentials: 'omit'`** y `cache: 'no-store'` en `fetch`. | La autenticación es Bearer; las cookies no se usan y el backend nunca las lee. Respeta `no-store`. |
| D-A11 | **Sin reintentos de mutaciones** (no existen mutaciones). Reintento único para `GET` solo tras 401, con token fresco y el mismo `scope` (4.1, 6.2). | `api-rules`: reintentar solo si el contrato lo hace seguro; los GET lo son. |
| D-A12 | **401 persistente ⇒ `auth_rejected`, sin `signOut()` automático** (`PROPUESTA`; 6.2.4). | Un 401 no prueba que Clerk terminó la sesión (puede ser `azp`/`iss`); ningún documento vigente exige cerrar sesión; evita bucles por mala configuración. Reversible por decisión explícita (TA-09). |
| D-A13 | **El token es un resultado (`TokenResult`), no una excepción**; `ClerkOfflineError` ⇒ `offline`, cualquier otra excepción ⇒ `error` (5.3, 6.1). | Una excepción no demuestra un fallo de red; el cliente HTTP queda sin importar Clerk. |
| D-A14 | **`path` con lista blanca estricta, validación de URL final y `redirect: 'manual'`** (5.3). | `startsWith('/api/v1/')` no impide `..`; una redirección nunca debe seguirse con el token. |
| D-A15 | **El contexto previo solo se conserva como `ready.degraded`**; fuera de `AuthStore` no se guarda (4.1, 4.7). | Evita estados imposibles de representar y cualquier retención tras revocación, logout o cambio de identidad. |

### 5.2 Árbol de archivos

`(nuevo)` / `(modifica)`. No se crean carpetas vacías ni barrels.

```text
src/
├── main.tsx                                   (modifica: solo si hace falta pasar env a App; sin lógica nueva)
├── vite-env.d.ts                              (modifica: añadir `readonly VITE_CLERK_PUBLISHABLE_KEY?: string;` a ImportMetaEnv; sin ello `PublicEnvSource` no compila)
├── app/
│   ├── App.tsx                                (modifica: compone <AuthProvider> y <AuthGate>)
│   └── App.test.tsx                           (modifica: casos de config_error y estados)
├── shared/
│   ├── config/
│   │   ├── public-env.ts                      (modifica: VITE_CLERK_PUBLISHABLE_KEY; ampliar PublicEnvSource, PublicEnvVariable, PublicEnvIssueReason)
│   │   └── public-env.test.ts                 (modifica)
│   └── api/
│       ├── api-failure.ts                     (nuevo: ApiFailure, classifyFailure, parseErrorEnvelope; tabla G2 de 3.2)
│       ├── api-failure.test.ts                (nuevo)
│       ├── http-client.ts                     (nuevo: createApiClient solo GET, TokenResult, TokenPolicy, ApiResult, validación de URL)
│       └── http-client.test.ts                (nuevo)
└── features/
    └── auth/                                  (primera feature; sondas de lint 8.2)
        ├── session-port.ts                    (nuevo: AuthSessionPort, SessionSnapshot)
        ├── clerk-session.tsx                  (nuevo: ÚNICO import de @clerk/*; ClerkProvider + adaptador del puerto; traduce excepciones de getToken a TokenResult)
        ├── me-contract.ts                     (G5 — NO CREAR antes de TA-01: tipo del DTO + parser estricto del texto congelado)
        ├── me-contract.test.ts                (G5 — NO CREAR antes de TA-01)
        ├── me-context-source.ts               (G5 — NO CREAR antes de TA-01: implementa WorkshopContextSource con GET del contrato congelado y añade a api-failure.ts los códigos del selector)
        ├── workshop-context.ts                (nuevo: AuthState/AuthStore, createAuthReducer, ContextScope, withSingleFreshRetry, WorkshopContextSnapshot, WorkshopContextSource como interfaz)
        ├── workshop-context.test.ts           (nuevo: tabla 4.7)
        ├── auth-provider.tsx                  (nuevo: AuthContextProvider(port, apiClient, contextSource?) + AuthProvider (Clerk+contexto) + useAuthContext)
        ├── auth-provider.test.tsx             (nuevo)
        ├── auth-gate.tsx                      (nuevo: renderiza estados de 4.2)
        └── auth-gate.test.tsx                 (nuevo)
.env.example                                   (modifica: VITE_CLERK_PUBLISHABLE_KEY, aditivo)
eslint.config.js                               (modifica: restricción de @clerk/*, 8.1 paso 1)
package.json / package-lock.json               (modifica: solo @clerk/react)
README.md                                      (modifica: sección breve de auth; aditivo)
```

Notas:

- `AuthContextProvider` recibe `contextSource?: WorkshopContextSource` (opcional). Sin él, el reducer se crea con `hasContextSource: false` y una sesión iniciada queda en `signed_in_context_pending` (2.3, 4.2). G5 solo añade `me-context-source.ts` y lo pasa desde `App`.
- `AuthProvider` (Clerk + contexto) y `AuthContextProvider` (recibe `port` y `apiClient` por props) se separan **solo** para poder probar sin Clerk; no hay más capas.
- `workshop-context.ts` puede dividirse en dos archivos (tipos/reducer vs. `ContextScope`/`withSingleFreshRetry`) si supera un tamaño razonable; es una desviación permitida (8.3). No se añaden más archivos fuera de este árbol.
- `shared/api` no importa `features`; recibe `getToken`, `tenantId` y `tokenPolicy` por parámetro. `features/auth` importa `@/shared/*` con alias y rutas relativas internas. `app` es el único que compone.

### 5.3 Transporte acotado (`shared/api`)

Solo lo necesario:

```ts
// src/shared/api/http-client.ts (forma; los nombres de campos son obligatorios, el cuerpo es libre)
export type TokenPolicy = 'cached' | 'fresh'; // 'fresh' ⇒ getToken({ skipCache: true })

/** Resultado de pedir el token. Nunca se usa una excepción para el flujo normal. */
export type TokenResult =
  | { readonly kind: 'token'; readonly token: string }
  | { readonly kind: 'no_session' }  // Clerk: sin sesión (getToken → null)
  | { readonly kind: 'offline' }     // ClerkOfflineError
  | { readonly kind: 'error' };      // cualquier otra excepción (causa desconocida)

export interface ApiClientDeps {
  readonly apiOrigin: string;   // PublicEnv.apiOrigin (ya normalizado: esquema + host + puerto, ruta "/")
  /** Del puerto. Sin caché propia. Si lanza, el cliente lo trata como { kind: 'error' }. */
  readonly getToken: (options?: { readonly skipCache?: boolean }) => Promise<TokenResult>;
  readonly fetchImpl?: typeof fetch; // inyectable para pruebas locales
  readonly timeoutMs?: number;       // por defecto 10_000; cubre getToken() + fetch + lectura del cuerpo
}

export interface GetRequest {
  readonly path: string;            // lista blanca estricta (abajo); sin query ni fragmento
  readonly tenantId?: string;       // UUID canónico en minúsculas; se envía como X-Tenant-Id (uso real: G5)
  readonly signal: AbortSignal;     // obligatorio: cancelación por contexto
  readonly tokenPolicy: TokenPolicy; // explícito en cada request; lo decide el proveedor (4.1)
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

export interface ApiClient {
  getJson<T>(request: GetRequest, parse: (body: unknown) => T | null): Promise<ApiResult<T>>;
}
```

**Validación de la petición (antes de pedir token y antes de red).** Cualquier incumplimiento → `{ ok:false, failure:{ kind:'client_bug' } }` **sin** llamar a `getToken()` ni a `fetch`:

1. `path` es una cadena de ≤ 512 caracteres que cumple la **lista blanca** `^/api/v1/[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$`: solo segmentos de letras, dígitos, `_` y `-` separados por `/`. Esto excluye por construcción `.`/`..`, `%` (incluidos `%2e`, `%2f`, `%5c`), `\`, `?`, `#`, espacios y controles, `//`, barra final y segmentos vacíos. El prefijo distingue mayúsculas (`/API/V1/…` se rechaza). Comprobar solo `startsWith('/api/v1/')` **no** es válido (`/api/v1/../../../otra-ruta` se normaliza a `/otra-ruta`).
2. **Validación de la URL final** (defensa en profundidad, aunque la lista blanca ya la garantice): `const url = new URL(path, apiOrigin)` debe cumplir `url.origin === apiOrigin`, `url.pathname === path` (la normalización no alteró nada) y `url.pathname.startsWith('/api/v1/')`, `url.search === ''`, `url.hash === ''`, `url.username === ''` y `url.password === ''`. Si `new URL` lanza → `client_bug`.
3. `tenantId`, si existe, debe cumplir `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (no se normaliza en silencio: una mayúscula o un espacio es `client_bug`).

**Algoritmo (ordenado, normativo):**

1. Validar (arriba). 2. Si `signal.aborted` → `aborted` (sin `getToken`, sin `fetch`).
3. Crear un `AbortController` interno `c`: la `signal` externa lo aborta con causa `aborted`; un temporizador de `timeoutMs` lo aborta con causa `timeout`. Todo `listener` y temporizador se retira en un único `finally`.
4. Pedir el token: `Promise.race([ getTokenSafe(policy), abortPromise(c.signal) ])`, donde `getTokenSafe` convierte excepciones en `{ kind: 'error' }` y `policy === 'fresh'` llama a `getToken({ skipCache: true })`. **Clerk no permite cancelar `getToken()`**: si `c` se aborta mientras está pendiente, el cliente deja de esperar, devuelve `aborted`/`timeout` y **descarta** el resultado tardío (con un `.catch` vacío para evitar rechazos no manejados).
5. **Tras** el `await` del paso 4, **antes** de `fetch`: si `c.signal.aborted` → devolver `aborted`/`timeout` **sin** llamar a `fetch`, aunque el token ya haya llegado. Un `TokenResult` distinto de `token` → falla `no_session`/`token_offline`/`token_error` (sin `fetch`).
6. `fetchImpl(url, { method: 'GET', headers, credentials: 'omit', cache: 'no-store', redirect: 'manual', signal: c.signal })` con `headers` = `Authorization: Bearer <token>`, `Accept: application/json` y, solo si hay `tenantId`, `X-Tenant-Id`. Ningún otro header.
7. `fetch` rechaza: si `c.signal.aborted` → `aborted`/`timeout`; si no → `network`.
8. **Redirecciones:** como `redirect: 'manual'`, una redirección llega como respuesta opaca (`response.type === 'opaqueredirect'`) o con status `3xx`; también se trata así `response.redirected === true`. Cualquiera → `unexpected_redirect`. El contrato de lectura no contiene redirecciones; el cliente **nunca** las sigue (no hay reenvío del token a otro path/origen). `redirect: 'error'` no se usa porque su fallo es indistinguible de `network`.
9. Clasificar por status (3.2), leer el cuerpo bajo la misma señal; `parse` devuelve `null` → `contract_violation`.
10. Si `c.signal.aborted` al terminar → `aborted`/`timeout` (el resultado se descarta aunque haya llegado).

Además: no registra URL, headers ni cuerpo; no loguea el token ni lo incluye en objetos de error ni en el estado; sin interceptores; **sin reintentos internos** (el reintento único con token fresco lo orquesta el proveedor, 4.1); sin POST/PATCH/DELETE.

**Pruebas del cliente (AC-A26/A27/A28, con `fetchImpl` y `getToken` espiables y promesas diferidas controlables a mano):**

- *Rutas rechazadas (cada una: `getToken` y `fetch` **no** llamados, resultado `client_bug`):* `/api/v1/../../../otra-ruta`, `/api/v1/..`, `/api/v1/%2e%2e/x`, `/api/v1/%2E%2E%2fx`, `/api/v1/x/../y`, `/api/v1/./x`, `/api/v1/x\..\y`, `//otro.host/api/v1/x`, `https://otro.host/api/v1/x`, `/api/v1/x?y=1`, `/api/v1/x#z`, `/api/v1/x/`, `/api/v1//x`, `/API/V1/x`, `/api/v1/`, `/api/v1`, `/otra-ruta`, cadena con espacio/`\n`/carácter nulo, longitud > 512. *Aceptadas:* `/api/v1/prueba/abc-123_x`. Para toda aceptada, `url.origin === apiOrigin` y `pathname` idéntico al `path`.
- *`tenantId`:* UUID canónico minúsculas → header `X-Tenant-Id` presente; mayúsculas, con espacios, con llaves o vacío → `client_bug` sin red.
- *Opciones de `fetch`:* se verifica `credentials: 'omit'`, `cache: 'no-store'`, `redirect: 'manual'`, `method: 'GET'` y el conjunto **exacto** de headers.
- *Redirección:* respuesta con `type: 'opaqueredirect'`; con status `302`; con `redirected: true` ⇒ `unexpected_redirect`, sin segunda llamada a `fetch`.
- *Cancelación (la clave: ningún `fetch` tras cancelar):* (a) `signal` ya abortada ⇒ `aborted`, `getToken` y `fetch` sin llamar; (b) abortar mientras `getToken()` está pendiente y resolverlo **después** ⇒ `aborted` y **`fetch` nunca invocado**; (c) abortar mientras `getToken()` pendiente y luego rechazarlo ⇒ `aborted`, sin `fetch` y sin rechazo no manejado; (d) *timeout* mientras `getToken()` pendiente ⇒ `timeout`, sin `fetch`; (e) abortar durante `fetch` ⇒ la `signal` pasada a `fetch` queda abortada y el resultado es `aborted`; (f) abortar tras recibir la respuesta pero antes del `parse` ⇒ `aborted`, sin invocar `parse`.
- *Token:* `getToken` → `no_session` ⇒ `no_session`; `offline` ⇒ `token_offline`; `error` ⇒ `token_error`; `getToken` que **lanza** ⇒ `token_error`; en todos, sin `fetch`. `tokenPolicy:'fresh'` ⇒ `getToken` recibe `{ skipCache: true }`; `'cached'` ⇒ sin `skipCache`.

---

## 6. Ciclo de sesión y taller

### 6.1 Token

- Fuente: `useAuth()` de `@clerk/react` → `getToken()`. Documentación oficial consultada el 2026-09-30: `https://clerk.com/docs/react/reference/hooks/use-auth.md` (devuelve `isLoaded`, `isSignedIn`, `userId`, `sessionId`, `getToken()`, `signOut()`; `getToken()` devuelve el token de sesión o de una plantilla JWT).
- Se usa el **token de sesión por defecto** (sin plantilla JWT), porque el backend verifica `azp`/`iss` del token de sesión. **No** se usan Organizations, `orgId`, `orgRole`, `has()`, `sessionClaims` ni `actor` como autoridad.
- `clerk-session.tsx` expone el puerto. El token nunca viaja como excepción ni como estado: es un resultado discriminado (`TokenResult`, 5.3).

```ts
export type SessionSnapshot =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; identity: IdentityKey };

export interface AuthSessionPort {
  readonly snapshot: SessionSnapshot;
  getToken(options?: { readonly skipCache?: boolean }): Promise<TokenResult>; // nunca lanza
  signOut(): Promise<void>;                                                    // puede rechazar → T6b
}
```

- **Traducción de errores de Clerk (solo en `clerk-session.tsx`, el único archivo que importa `@clerk/*`):**

```ts
import { ClerkOfflineError } from '@clerk/react/errors';

async function toTokenResult(getToken: GetToken, options?: GetTokenOptions): Promise<TokenResult> {
  try {
    const token = await getToken(options);
    return token === null ? { kind: 'no_session' } : { kind: 'token', token };
  } catch (error) {
    return ClerkOfflineError.is(error) ? { kind: 'offline' } : { kind: 'error' };
  }
}
```

  Regla: **solo** `ClerkOfflineError` (código `clerk_offline`: navegador sin red tras agotar reintentos) se considera “sin conexión” (`offline` ⇒ razón recuperable `offline`). **Cualquier otra excepción** —`ClerkRuntimeError` (p. ej. Clerk no cargó a tiempo), errores inesperados, un `TypeError` de programación— es `error` ⇒ razón `identity_client_error`: causa desconocida, copy sin mencionar la red, sin mostrar el mensaje de la excepción y sin registrarlo. Una excepción **no** demuestra un fallo de red ni una sesión terminada.
- **Verificado (2026-09-30)** en el tarball publicado de `@clerk/react@6.17.4`: `package.json` exporta el subpath `./errors` y `dist/errors.d.mts` reexporta `ClerkOfflineError` (con `static is(error: unknown): error is ClerkOfflineError`, definido en `@clerk/shared@4.37.1`), `ClerkRuntimeError` e `isClerkRuntimeError`. Si el tipo instalado no lo permitiera, se detiene y se reporta; **no** se cae a comprobar el texto del mensaje.
- **`getToken` — duda técnica cerrada (verificado el 2026-09-30).**
  - *Documentación oficial* (`https://clerk.com/docs/react/reference/objects/session`): `getToken(options?: GetTokenOptions): Promise<null | string>`; opciones `organizationId?`, `template?` y **`skipCache?: boolean`** (“omitir la caché y forzar una llamada al servidor, incluso dentro del TTL”). Solo se generan tokens si el usuario ha iniciado sesión.
  - *Tipos del paquete elegido*, inspeccionados en los tarballs publicados (`npm pack`, extraídos en un directorio temporal; **no** se instaló nada en el proyecto): `@clerk/shared@4.37.1` (dependencia `^4.37.1` de `@clerk/react@6.17.4`), `dist/types/session.d.ts`: `type GetTokenOptions = { organizationId?: string; skipCache?: boolean; template?: string }` (≈ línea 442) y `type GetToken = (options?: GetTokenOptions) => Promise<string | null>` (≈ línea 459); `dist/types/hooks.d.ts`: `UseAuthReturn.getToken: GetToken` (≈ línea 69); `@clerk/react@6.17.4`, `dist/useAuth-CRZPnSNQ.d.mts`: `declare const useAuth: (options?: UseAuthOptions) => UseAuthReturn` (≈ línea 182). Por tanto **`useAuth().getToken({ skipCache: true })` está tipado y soportado en la versión elegida.**
  - *Vigencia:* la documentación indica un **TTL de un minuto por token** (con reintentos ante fallos transitorios). Eso es la duración del **token**, no de la **sesión**. La app **no** introduce expiración propia: no decodifica el JWT, no lee `exp`, no programa temporizadores ni cachea tokens; solo llama a `getToken()` en cada request y deja que Clerk gestione caché y renovación. La terminación de la **sesión** la determina Clerk (estado `isSignedIn`, o `getToken()` → `null`).
  - *Pendientes de sesión:* `useAuth(options?)` acepta `treatPendingAsSignedOut` (por defecto `true`): una sesión *pendiente* (tareas de sesión como `reset-password`, `setup-mfa`, `choose-organization`) se trata como no autenticada. Esta tarea mantiene el valor por defecto y no implementa tareas de sesión; `<SignIn />` las gestiona.
  - *Re-verificación en implementación:* `npm run typecheck` con la dependencia instalada debe aceptar `getToken({ skipCache: true })` y `import { ClerkOfflineError } from '@clerk/react/errors'` (AC-A10, AC-A30). Si el tipo instalado difiriera, se detiene y se reporta.

### 6.2 Expiración de sesión y 401

1. **Clerk** informa de que ya no hay sesión (snapshot `signed_out` sin que el usuario la cerrara) → T3 `session_expired`, sin llamar al backend. También `getToken()` → `no_session` → T10 `session_expired`. **Solo estos dos casos** afirman que la sesión terminó, porque proceden de Clerk.
2. El backend responde `401` mientras Clerk sigue `signed_in`: `withSingleFreshRetry` (4.1) repite **una vez** la misma operación con `getToken({ skipCache: true })`, bajo el **mismo** `scope` (misma `signal`, misma generación). Si vuelve a ser `401` → T11 `auth_rejected`.
3. **Un `401` persistente no prueba que Clerk terminó la sesión.** Puede deberse a una sesión inválida, pero también a `azp` o `iss` mal configurados en el backend (R-A06), a la clave de verificación del backend, a una desincronización de reloj o a una instancia Clerk distinta. El frontend no puede distinguirlas (el backend no lo expone, y “el frontend nunca decide si una sesión es válida”, Security §5). Por eso el estado es `auth_rejected` (“El servidor no aceptó tu sesión”), no `session_expired`.
4. **Política de la aplicación (`PROPUESTA`): no hay cierre de sesión automático ante 401 persistente.** El usuario decide: *Reintentar* o *Cerrar sesión*. Contraste con los documentos vigentes: `docs/security/frontend-security.md` §5 (“Sesión inválida/expirada → 401”; el frontend no decide validez), §8 (“Logout/revocación debe invalidar acceso conforme al proveedor y backend”: es del proveedor/backend, no una reacción local a un 401) y ADR-006 §13 (“Token inválido/expirado devuelve 401”: el 401 habla del token); `docs/agents/tenant-rbac-rules.md` (“Keep session/permission rejection visible and recoverable”). **Ningún documento vigente exige** `signOut()` ante un 401. Un cierre automático, además, convertiría un error de configuración (`azp`) en un bucle de login/logout. Si el dueño de producto quiere cierre automático, es una decisión explícita (sección 9, TA-09) y no se implementa por defecto.
5. `getToken()` que devuelve `{ kind: 'offline' }` o `{ kind: 'error' }` → recuperable (razones `offline` / `identity_client_error`), **no** `session_expired` ni `auth_rejected`. Un fallo del token no significa que el backend lo rechazó.
6. El reintento nunca se aplica a rutas con efectos (no existen en esta tarea). La app **no** impone límites de duración de sesión ni de token (6.1).
7. Todo lo anterior pertenece a G1–G4 (no depende de TA-01); se prueba con rutas de prueba inyectadas.

### 6.3 Logout y cambio de identidad

- *Cerrar sesión* (T6): **primero** se descarta el contexto local (`generation+1`, abortar la generación, `auth = signed_out`) y **después** se llama a `port.signOut()`. Si `signOut()` rechaza, T6b lleva a `recoverable_error` (la sesión de Clerk sigue viva; el contexto ya se descartó).
- **Cambio de identidad** (otro `userId` o nuevo `sessionId`, incluso en otra pestaña): se trata como logout + login (T1): contexto invalidado y nueva `IdentityKey`. El estado siguiente es `signed_in_context_pending` (sin `contextSource`) o `loading_context` (con ella). **Nunca** se reutiliza nada del usuario anterior (prueba de no retención, 4.7).
- Si la sesión desaparece sin que el usuario lo pida (otra pestaña cerró sesión, Clerk la terminó) → T3 `session_expired`.
- Multi-pestaña: el estado de Clerk es la fuente; la app solo reacciona al `SessionSnapshot`.
- Esta tarea no persiste nada, así que “limpiar al cerrar sesión” = descartar estado en memoria y abortar requests. AC-A13 verifica que no se escribió en ningún storage. (Cuando existan borradores/colas offline, su manejo en logout requiere `pwa-offline-rules` y especificación propia.)

### 6.4 Invalidación, cancelación y respuestas tardías

Definición normativa de `ContextScope`:

```ts
interface ContextScope {
  readonly generation: number;          // entero que solo crece
  readonly identity: IdentityKey | null;
  readonly tenantId: string | null;
  readonly signal: AbortSignal;         // controlador propio de esta generación
}
```

- Existe **un** `AbortController` por generación. El proveedor guarda en un `ref` **solo** `{ generation, controller }`; `identity` y `tenantId` del `ContextScope` se copian de `AuthStore` al **crear** cada scope y viven únicamente en la closure de la operación (invariante de retención, 4.1).
- Una **operación** es una llamada a `withSingleFreshRetry` (que puede hacer dos intentos) bajo **un único** scope. Todos sus intentos, la espera de `getToken()` y el `fetch` reciben `scope.signal`: cancelar la generación cancela la operación completa, también entre el primer intento y el reintento.
- **Eventos que cierran la generación** (corte, definición en 4.7: abortar el controlador y crear otro): T1 (cambio de `identity`), T3, T6 (logout), T7d–T7g (revalidación desde `ready` que cambia de taller, cambia de membership, devuelve `multiple` sin el par activo o devuelve `none`), T10, T11, T12, T14/T15 (`access_lost`), T16 (elección de taller), T17 (reintento del usuario), desmontaje del proveedor. **No** cierran la generación: T2, T4, T5, T6b, T7a, T7b, T7c, T8, T9, T13, T18, T19. El proveedor ejecuta el aborto como efecto de todo cambio de `store.generation`; el reducer es la única fuente de ese cambio.
- **Protección contra respuestas tardías:** el resultado de una operación se confirma con `if (scope.generation !== currentGeneration()) return;` **después** del último `await` de la operación y **justo antes** de despachar al reducer. No se comprueba antes de un `await` y se despacha después. Las respuestas `aborted` se descartan en silencio.
- El reducer ignora acciones cuya `generation` no coincide con la actual (defensa en profundidad; prueba pura 4 de 4.7).
- No hay caché remota en esta tarea. Cualquier caché futura debe colgar de `ContextScope` y reiniciarse con cada nueva generación.
- StrictMode: los efectos deben ser idempotentes (doble montaje en desarrollo no debe duplicar estado ni dejar controladores sin abortar).

### 6.5 Cambio de taller

Solo desde `workshop_selection_required` (T16) y, cuando TA-03 exista, desde un selector en `ready` que reinicie la carga: nueva generación → todas las pantallas dependientes vuelven a cargar desde cero. No se reetiqueta ninguna operación pendiente a otro taller (no existen operaciones pendientes en esta tarea).

### 6.6 Membership revocada

Cubierta en 4.5 (T14/T15) y en la tabla 3.2 (códigos añadidos en G5). El servidor revalida la membership en cada request; el cliente solo reacciona a `403` clasificado. No se intenta “adivinar” revocaciones por temporizador.

---

## 7. Dependencias y configuración

### 7.1 Dependencia nueva

Verificado el 2026-09-30 con `npm view` (registro npm, solo lectura). **No** se instaló nada.

| Paquete | Rango propuesto | Tipo | `engines.node` | Peers | Dependencias directas | Justificación |
| --- | --- | --- | --- | --- | --- | --- |
| `@clerk/react` | `~6.17.4` | dependencies | `>=20.9.0` (cumple Node 22) | `react` y `react-dom`: `^18.0.0 \|\| ~19.0.3 \|\| ~19.1.4 \|\| ~19.2.3 \|\| ~19.3.0-0` | `tslib 2.8.1`, `@clerk/shared ^4.37.1` | SDK oficial para React. `dist-tags.latest = 6.17.4`. |

Hallazgos que condicionan la implementación:

1. **El peer de React es `~19.3.0-0`.** El lockfile usa `react@19.3.0` (cumple; `latest` de React hoy es 19.3.0). Cuando salga React 19.4.x el peer **no** se cumplirá: no se debe usar `--force`/`--legacy-peer-deps`; se espera a una versión de `@clerk/react` compatible (riesgo R-A01).
2. **`6.17.4` se publicó el 2026-09-30T21:34Z**, es decir, horas antes de esta especificación (y existen canaries posteriores). DeepSeek debe **re-verificar** al implementar: `npm view @clerk/react@6.17.4 deprecated version peerDependencies engines`, que no esté deprecada y que `npm audit --audit-level=critical` pase. Si hay una `6.17.x` posterior estable, puede usarse **dentro de `~6.17`** sin consultar; un salto de minor/major requiere nueva aprobación (R-A02).
3. **No usar `@clerk/clerk-react`** (nombre legado, `5.61.3`) ni `@clerk/localizations` (D-A09).
4. Compatibilidad con Vite 8 / TS 6 / ESLint 10 **no está demostrada** por metadatos: la demuestran `typecheck`, `lint`, `test` y `build` (AC-A17).
5. Si el SDK exige tipos adicionales o un peer no previsto: detener y reportar; no ampliar la lista.

Total tras la tarea: 3 `dependencies` (`react`, `react-dom`, `@clerk/react`) y las mismas 14 `devDependencies`. Cualquier otro paquete incumple AC-A17.

### 7.2 Variables públicas

| Variable | Obligatoriedad | Regla |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` (**nueva**) | Obligatoria para que la autenticación funcione. Si falta/ inválida → `config_error` (no hay fallo en el arranque ni en el import). | Clave **publicable** (público por diseño). Formato esperado `pk_test_…` / `pk_live_…` (prefijo verificado en `parsePublicEnv`; el valor nunca se muestra). Regla propuesta: `VITE_APP_ENV=production` exige `pk_live_`; `local` y `staging` aceptan ambos prefijos (**verificar contra la instancia Clerk real**; si difiere, ajustar y reportar). Razón de issue nueva: `invalid_publishable_key`. Debe declararse también en `ImportMetaEnv` de `src/vite-env.d.ts` (5.2) y añadirse a `PublicEnvVariable`/`PublicEnvSource`. |
| `VITE_API_BASE_URL` (existente) | Ahora **obligatoria** para la autenticación (pasa de “reservada” a “consumida”). | Sin cambios de validación (origen http(s), https fuera de local). |
| `VITE_APP_ENV` (existente) | Igual. | Igual. |

- Se pasa la clave **explícitamente** a `<ClerkProvider publishableKey={…}>` desde `parsePublicEnv`, en lugar de dejar que el SDK lea `import.meta.env` por su cuenta (control único y validado).
- `.env.example`: añadir `VITE_CLERK_PUBLISHABLE_KEY=` con comentario “clave PUBLICABLE, nunca la secret key”. Sin valores reales.
- Prohibido en el frontend: `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, webhook signing secret o cualquier secreto (Security §1). El secret scan de CI (gitleaks) sigue activo.

### 7.3 Requisitos de la instancia Clerk (no se incluyen valores)

1. **Instancias separadas** por entorno (development/staging/production), cada una con su clave publicable y su propio `CLERK_AUTHORIZED_PARTIES`/`CORS_ALLOWED_ORIGINS` en el backend correspondiente.
2. Los **orígenes del frontend** deben figurar en `CLERK_AUTHORIZED_PARTIES` del backend (claim `azp`, orígenes sin `*`): en local `http://localhost:5173` (dev) y `http://localhost:4173` (preview), por D-13 de S3-B01 (puertos fijos); más los orígenes de staging y producción. Si falta uno, el backend responde 401 aunque el login de Clerk funcione.
3. `CORS_ALLOWED_ORIGINS` del backend debe incluir los mismos orígenes (en `server.ts`; falta en `.env.example`, TA-07). Las requests con `Authorization` y `X-Tenant-Id` son *no simples*: dependen del preflight. El comportamiento por defecto de `@fastify/cors` (reflejar `Access-Control-Request-Headers`) debe confirmarse en la prueba de integración (AC-A22), no se asume.
4. Token de sesión **por defecto**; **sin** plantillas JWT; **sin** Organizations; email verificado exigido (el backend lo exige en rutas con perfil).
5. **Decisión de producto abierta (TA-06):** si el registro público (sign-up) está habilitado. Si lo está, cualquier persona puede crear identidad y caerá en `no_access` (el JIT del backend nunca crea membership). La spec funciona en ambos casos.
6. Dominios/URLs de la instancia: el SDK carga recursos desde el Frontend API de Clerk. `index.html` hoy no tiene CSP; cualquier CSP futura debe permitir esos orígenes (vigilar al endurecer cabeceras; no es parte de esta tarea).
7. Privacidad: Clerk recibe solo datos de identidad y sesión. Antes de producción: DPA, subencargados y transferencia internacional (ADR-006 §13) — bloqueo de salida a producción, no de esta implementación.

---

## 8. Implementación, pruebas y aceptación

### 8.1 Secuencia para DeepSeek

Trabajar en un worktree nuevo fuera del repositorio (`C:\Users\leopa\.tallermecario-frontend-worktrees\<tarea>`), con Node 22. Antes de empezar: confirmar que esta especificación está aprobada y leer 5–7. Cada paso termina con `typecheck`, `lint` y `test` en verde antes del siguiente.

0. **Precondiciones.** Node 22.22.2+; árbol limpio; `git fetch` y rama desde `origin/main`.
1. **Dependencia y lint.** `npm install @clerk/react@~6.17.4` (sin flags). Verificar peers/auditoría (7.1). En `eslint.config.js` añadir restricción para que `@clerk/*` solo se importe desde `src/features/auth/clerk-session.tsx` (**cuidado**: en flat config un bloque posterior *reemplaza* las opciones de `no-restricted-imports` de los mismos archivos; el bloque nuevo debe **componer** los patrones existentes — ver 3.2 de S3-B01 y `importRules`). Repetir **las sondas de lint de S3-B01 7.5 aplicadas a la primera feature** (AC-A19).
2. **Entorno (G1).** Extender `parsePublicEnv` (+ pruebas) con `VITE_CLERK_PUBLISHABLE_KEY`; **añadir la variable a `ImportMetaEnv` en `src/vite-env.d.ts`** (`PublicEnvSource` la toma de ahí; sin ese cambio `tsc` falla); `.env.example` (7.2). `PublicEnv.clerkPublishableKey: string | null`. Sin leer secretos.
3. **`shared/api` (G2).** `api-failure.ts` + pruebas (tabla G2 de 3.2: **sin** los códigos del selector, que llegan en G5; incluye 403 sin code, 400/409/otros 4xx, redirección). `http-client.ts` con validación de petición/URL final, `redirect: 'manual'`, `TokenResult`, `TokenPolicy` y cancelación/timeout que cubra la espera de `getToken()` (5.3) + pruebas con `fetchImpl` y `getToken` espiables y promesas diferidas, **rutas y parsers de prueba**, nunca `/api/v1/me`.
4. **Dominio puro (G3).** `session-port.ts`; `workshop-context.ts` (`AuthState`/`AuthStore`, `createAuthReducer`, `ContextScope`, `withSingleFreshRetry`, `WorkshopContextSnapshot`, `ContextLoadAttempt`, `WorkshopContextSource` como **interfaz**) + las pruebas puras de la tabla 4.7 con fixtures de **dominio** (`{ kind: 'none' | 'single' | 'multiple' }`) e identificadores sentinela, no con la forma del DTO.
5. **Clerk real y sesión (G1/G4).** `clerk-session.tsx` (`ClerkProvider` + puente al puerto + `toTokenResult` con `ClerkOfflineError`); `auth-provider.tsx` (puerto + cliente + reducer + `ContextScope` + `withSingleFreshRetry`; **sin** `contextSource`); `auth-gate.tsx` (estados de 4.2, incluidos `signed_in_context_pending`, `auth_rejected` y `fatal_error`); composición en `App`. Pruebas con **puerto falso**, `fetchImpl` falso y un `WorkshopContextSource` **falso de prueba** solo para ejercitar el proveedor (no es el adaptador de G5). **Este paso no depende de TA-01.**
6. **Verificación de G1–G4.** `npm run typecheck`, `lint`, `test`, `build`, `npm audit --audit-level=critical`. Registrar salidas reales. **Punto de parada normal de esta entrega si TA-01 no está resuelto:** reportar G1–G4 entregado y G5 `BLOQUEADO_TRACK_A`.
7. **Integración real de identidad (AC-A20a) — independiente de G5.** Requiere G1 (paso 5), una instancia Clerk de desarrollo y un backend local/staging con el origen del frontend en `CLERK_AUTHORIZED_PARTIES` (TA-05). Se ejecuta con el procedimiento 8.2.B1, que **no** consume C-01, **no** usa `X-Tenant-Id` y **no** añade código al repositorio. Si falta alguna precondición: “no ejecutado”.
8. **G5 — solo con TA-01 resuelto** (texto de contrato congelado en `docs/api/` y confirmado por Track A). Si no lo está, **no se ejecuta ni se esboza**: sin `me-contract.ts`, sin `me-context-source.ts`, sin fixtures con la forma de `MeResponse`, sin `X-Tenant-Id` real, sin códigos del selector en `api-failure.ts`. Cuando lo esté: (a) `me-contract.ts` con el **tipo y parser derivados del texto congelado** (estricto; incoherencia → `contract_violation`); (b) `me-context-source.ts` que implementa `WorkshopContextSource` respetando su contrato (4.1: usa `attempt.scope.signal`, traslada `attempt.tokenPolicy`, no reintenta, no lanza) y mapea DTO → `WorkshopContextSnapshot`; (c) añadir a `api-failure.ts` los códigos del selector congelados (3.2, tabla G5) con sus pruebas (AC-A09b); (d) pasarlo desde `App`, con lo que el reducer se crea con `hasContextSource: true`; (e) fixtures citando el texto congelado. Si lo congelado difiere de las tablas de este documento, **prevalece lo congelado** (3.1) y se reporta.
9. **Integración real del contexto (AC-A20) y CORS (AC-A22)** — solo con G5 y backend disponible (8.2.B2/B3); si no, “no ejecutado”.
10. **Entrega.** Informe con archivos, resultados reales, desviaciones, lo no ejecutado y dependencias abiertas. Sin push/PR/merge salvo autorización explícita.

### 8.2 Estrategia de pruebas

**A. Dobles locales (obligatorias, en CI, sin secretos ni red):**

| Frontera | Doble | Qué se prueba (comportamiento, no implementación) |
| --- | --- | --- |
| Clerk → app | `AuthSessionPort` falso controlable (snapshot mutable, `getToken` espiable que devuelve `TokenResult`, `signOut` que puede rechazar) | Estados `loading_identity`, `signed_out`, `signed_in`; expiración (T3); cambio de `identity` (T1); logout invalida contexto (T6/T6b); `getToken` se invoca **por request** y su valor jamás aparece en DOM, estado ni almacenamiento. **Sin `contextSource`:** `loading_identity` → `signed_in_context_pending`, `signed_out` → `signed_in_context_pending` y cambio de identidad → `signed_in_context_pending`, **sin** ninguna llamada de red. |
| Adaptador Clerk | Doble de `getToken` de Clerk que devuelve `null`, un token, lanza `ClerkOfflineError` y lanza `Error`/`TypeError`/`ClerkRuntimeError` | `toTokenResult`: `null` → `no_session`; token → `token`; `ClerkOfflineError` → `offline`; cualquier otra excepción → `error` (nunca `offline`); el mensaje de la excepción no llega a estado, DOM ni consola. |
| app → backend | `fetchImpl` falso con respuestas diferidas controlables (promesas resolubles a mano) | **G2 (sin TA-01):** 5.3 completa (URL final, opciones de `fetch`, redirecciones, cancelación sin `fetch`), clasificación G2 de 3.2, `Retry-After`, red/timeout, envelope inválido, `tokenPolicy`. Rutas y parsers de prueba. **G5 (tras TA-01):** C-01 en sus modos según el contrato congelado. |
| Proveedor + fuente falsa | `WorkshopContextSource` **falso de prueba** que registra cada `ContextLoadAttempt` y devuelve resultados programados | Primer intento con `tokenPolicy:'cached'`; ante `unauthenticated`, **un** segundo intento con `'fresh'` y el **mismo** `scope.signal`; dos `unauthenticated` ⇒ `auth_rejected` y `signOut` **no** llamado; cancelar la generación entre ambos intentos o durante el segundo ⇒ resultado descartado; `no_session` ⇒ `session_expired`; `token_error` ⇒ `recoverable_error` (`identity_client_error`). |
| Reducer | Fixtures de dominio con sentinelas | Tabla 4.7 completa: no retención (taller siempre; identidad según estado), retención solo degradada, cortes de T7 con respuestas tardías, espera de `429`, generación obsoleta, fatales, anti-bucle, modo sin fuente. |
| Concurrencia | Promesas diferidas | Una respuesta de la identidad/taller anterior resuelve **después** del cambio y **no** modifica el estado; respuesta tardía tras logout; respuesta tardía tras elegir otro taller; abort silencioso; doble montaje de StrictMode. |
| Contrato (**G5, solo tras TA-01**) | Fixtures que citan el texto congelado | El parser acepta todas las formas del contrato congelado y rechaza incoherencias definidas por él. **Antes de TA-01 no existen estas pruebas ni fixtures con la forma de `MeResponse`.** |
| Storage | Espías sobre `localStorage`, `sessionStorage`, `indexedDB` | Ninguna escritura de token, identidad ni taller en todo el flujo. |

Restricciones de pruebas: sin dependencias nuevas (no msw, no jest-dom, no user-event); `vitest`/`@testing-library` solo en `*.test.*`; `restoreMocks` ya activo; datos sintéticos.

**B. Integración real (manual / staging; no cuenta como PASS de CI):**

**B1 — Aceptación del token por el backend (AC-A20a). Independiente de G5 y de TA-01.** Demuestra que el token de sesión de Clerk que emite la app es aceptado por la autenticación del backend (firma, `azp`, `iss`), sin consumir C-01 ni inventar endpoints.

- *Precondiciones:* G1 construido y ejecutándose desde un origen real (p. ej. `http://localhost:5173`); instancia Clerk de **desarrollo** con una identidad **sintética** de email verificado; backend local/staging cuyo `CLERK_AUTHORIZED_PARTIES` incluye ese origen (TA-05).
- *Sonda:* `GET /api/v1/memberships` (ruta de tenant **ya documentada** en `docs/api/memberships.md` §13.3 y **distinta** de C-01), usada **solo** como sonda de autenticación. No se envía `X-Tenant-Id` y no se añade al código de la app ni a ninguna fixture. Del cuerpo solo se comprueba la **forma mínima** exigida por 8.2.B1 para decidir el resultado (envelope de error o la clave `memberships`); no se consumen sus datos.
- *Procedimiento:* con la app autenticada, obtener un token de sesión y enviar `Authorization: Bearer <token>` a la sonda desde una herramienta desechable **fuera del repositorio** (consola del navegador o un script en `C:\Users\leopa\.tallermecario-frontend-audits\<tarea>`). Si obtener el token sin tocar el repositorio no es posible, se reporta “no ejecutado”: no se añade código de depuración a `src`.
- *Fundamento:* en el backend la autenticación se ejecuta **antes** del descubrimiento de membership, de la selección de taller y de la autorización (`src/api/tenant-request.ts`, hook `onRequest`; `OBSERVADO_BACKEND`). Solo los resultados que **nacen de etapas posteriores a la autenticación** demuestran que esta pasó. Sin `X-Tenant-Id` el backend produce (observado): 0 memberships → `403 ACTIVE_MEMBERSHIP_REQUIRED`; 1 membership sin `memberships.read` → `403 PERMISSION_DENIED`; 1 con permiso → `200`; N → `409 TENANT_SELECTION_REQUIRED`.
- *Resultado **concluyente: aceptado*** (el token pasó la autenticación; solo estos tres):
  1. `200` con cuerpo JSON que es un objeto con la clave `memberships` de tipo arreglo (forma documentada en `docs/api/memberships.md` §13.3; no se inspeccionan los elementos).
  2. `403` con envelope `{ error: { code, message, request_id } }` y `code` ∈ {`ACTIVE_MEMBERSHIP_REQUIRED`, `PERMISSION_DENIED`}.
  3. `409` con envelope y `code` = `TENANT_SELECTION_REQUIRED`.

  (Los códigos son `OBSERVADO_BACKEND`; si TA-05/TA-01 los congela distinto, prevalece lo congelado.) Un `403` sin ese envelope o con otro `code` **no** cuenta (podría provenir de un proxy/WAF/CORS).
- *Resultado **concluyente: rechazado*** : `401` con envelope (`AUTHENTICATION_REQUIRED`) usando el token válido recién emitido ⇒ A20a **no pasa** (revisar `azp`/`iss`/clave/reloj, TA-05).
- *Resultado **inconcluso*** (**no acredita aceptación**; se repite o se reporta como no ejecutado): `429`; cualquier `5xx` (incluido `500 INTERNAL_ERROR`); redirección (`3xx` o respuesta opaca); `400`, `404`, `405`, `415` u otro status; `403`/`409` sin envelope o con `code` fuera de la lista; `200` sin la forma indicada; fallo de red/CORS/preflight (ese caso se trata en B3). Un resultado inconcluso nunca convierte A20a en Pasa.
- *Controles negativos* (ambos deben dar **`401` con envelope** `AUTHENTICATION_REQUIRED`; si no, el control es inconcluso y A20a no pasa):
  1. La misma petición **sin** cabecera `Authorization`.
  2. La misma petición con un JWT cuya **firma se alteró de verdad a nivel de bytes**: separar el JWT en `header.payload.firma`; decodificar la firma desde base64url a bytes; **invertir los bits** (XOR `0xFF`) de al menos tres bytes en posiciones distintas (primero, central y último); volver a codificar en base64url sin relleno; conservar intactos `header` y `payload`. **Comprobar** que los bytes decodificados de la firma nueva difieren de los originales (≥ 3 bytes distintos) y que el JWT sigue teniendo tres segmentos. **No** basta con cambiar el último carácter de la firma codificada: sus bits sobrantes pueden no alterar ningún byte decodificado y el token seguiría siendo válido. La operación se hace con la herramienta desechable de arriba, nunca dentro del repositorio.
- *Evidencia:* fecha, método y path de la sonda, status HTTP, `error.code` (si hay envelope), presencia del envelope o de la clave `memberships`, y, para el control 2, el número de bytes alterados. **Nunca** el token (ni parcial), el `sub`, el `request_id` ni PII. Si Track A prefiere otra sonda de autenticación pura, la define en TA-05; este documento no inventa una.

**B2 — Contexto (AC-A20). Exige G5 y TA-01.** Login Clerk de desarrollo y el contrato de contexto congelado con 0/1/N memberships; revocar una membership y observar el efecto en el siguiente request; token inválido/expirado.

**B3 — CORS (AC-A22).** Preflight con `Authorization` (y `X-Tenant-Id` cuando G5 lo use) desde los orígenes autorizados; lectura de `Retry-After` o backoff fijo.

Evidencia siempre sin tokens ni PII reales; solo ids sintéticos. Hasta ejecutarse: **Pendiente**.

**Nota:** una prueba local con dobles **no** demuestra que Clerk emita el token esperado ni que el backend lo acepte; lo hace solo B1.

### 8.3 Desviaciones permitidas

Permitidas (se reportan): nombres internos de funciones/tipos; unir archivos pequeños de un mismo propósito (p. ej. `auth-gate.tsx` con sus subcomponentes) o dividir `workshop-context.ts` en dos; mecanismo exacto del lint de `@clerk/*` si el resultado (solo `clerk-session.tsx` puede importarlo) se demuestra con sondas; pequeñas variaciones de copy en español; ajustar `timeoutMs`; orden interno de `ContextScope`.

**No** permitidas sin nueva aprobación: otras dependencias; routing; persistencia de taller/identidad/token; implementar G5 antes de TA-01, o `/me`/headers/DTOs distintos de lo congelado, o inventar C-04/C-05; introducir una expiración propia de sesión/token (decodificar `exp`, temporizadores, caché de token); **cierre de sesión automático ante 401** (6.2.4); validar `path` solo con `startsWith`; seguir redirecciones; permisos de presentación; mutaciones HTTP; llamar a `getToken` con plantilla JWT; usar claims/Organizations de Clerk como autoridad; `--force`/`--legacy-peer-deps`; `eslint-disable`; suprimir diagnósticos; mostrar UUIDs como selector; tratar todo 403 como onboarding; clasificar toda excepción de Clerk como fallo de red; guardar token fuera de Clerk; añadir código de depuración a `src` para la sonda B1.

### 8.4 Criterios de aceptación

Todos **Pendiente**. Ninguno se declara PASS sin ejecución y evidencia.

| ID | Criterio | Verificación | Estado |
| --- | --- | --- | --- |
| AC-A01 | Dependencias: `package.json` añade **solo** `@clerk/react` (`~6.17.x`); sin `--force`/legacy; peers satisfechos con React 19.3.x; `npm audit --audit-level=critical` pasa. | Diff de `package.json`/lock; salida de `npm ls`/`audit`. | Pendiente |
| AC-A02 | `parsePublicEnv` valida `VITE_CLERK_PUBLISHABLE_KEY` (ausente/inválida/prefijo vs. entorno) sin exponer el valor; nuevas razones cubiertas por pruebas; `src/vite-env.d.ts` declara la variable y `npm run typecheck` compila. | `npm test`; `npm run typecheck`. | Pendiente |
| AC-A03 | Sin clave o sin `apiOrigin` → estado `config_error`; no se monta Clerk ni se hace red. | Prueba de `App`/`auth-gate`. | Pendiente |
| AC-A04 | Solo `src/features/auth/clerk-session.tsx` importa `@clerk/*` (incluido `@clerk/react/errors`); las sondas de lint lo demuestran (positiva y negativa). | `npm run lint` + sondas registradas. | Pendiente |
| AC-A05 | `loading_identity` no muestra contenido protegido ni `<SignIn />`; `signed_out` muestra `<SignIn />`. | Prueba con puerto falso. | Pendiente |
| AC-A06 | El token se obtiene por request con `getToken()`; no aparece en estado React, DOM, logs ni almacenamiento. | Pruebas con espías de storage y de consola. | Pendiente |
| AC-A06b | **(G1/G4)** Sin `contextSource`, **todas** las rutas de entrada a una sesión iniciada —desde `loading_identity`, desde `signed_out` y por cambio de identidad— terminan en `signed_in_context_pending`; no se llama al backend y no se muestran datos ni acceso a taller. | Prueba con puerto falso y `fetchImpl` espía (cero llamadas). | Pendiente |
| AC-A07 | **(G2)** El cliente envía solo `Authorization` y `Accept` (más `X-Tenant-Id` únicamente si recibe un `tenantId` válido), con `credentials: 'omit'`, `cache: 'no-store'`, `redirect: 'manual'` y `method: 'GET'`. **(G5, tras TA-01)** además: `GET` del contexto congelado sin `X-Tenant-Id` si así lo congela el contrato. | Prueba del cliente con ruta de prueba; la parte G5 con el contrato congelado. | Pendiente |
| AC-A08 | **(G5, exige TA-01)** Modo sin membership → `no_access` sin CTA de crear taller/invitación; un solo taller → `ready` con ese `tenantId`; varios → pantalla informativa no seleccionable (sin UUIDs). Las condiciones de modo salen del contrato congelado. | Pruebas con fixtures que citan el texto congelado. | Pendiente |
| AC-A09a | **(G2)** Clasificación de 3.2 (tabla G2) independiente del selector: `no_session`, `token_offline`, `token_error`, `401`, `PERMISSION_DENIED`, `action_forbidden`, `forbidden_unknown`, `429` con/sin `retry-after`, `5xx`, `400`, otro `4xx`, redirección, red, timeout, abort silencioso, envelope inválido, `2xx` que no cumple el parser. Antes de TA-01 un `403/409/400` con códigos del selector se clasifica **solo por status**. | `api-failure.test.ts`, `http-client.test.ts`. | Pendiente |
| AC-A09b | **(G5, exige TA-01)** Se añaden a `api-failure.ts` los códigos del selector conforme al contrato congelado (`membership_required`, `tenant_access_denied` → `access_lost`; `selection_required`; `TENANT_SELECTION_INVALID` → `client_bug`) con sus efectos y pruebas de proveedor. | Pruebas de proveedor. | Pendiente |
| AC-A10 | **(G1/G2)** `getToken({ skipCache: true })` compila con los tipos instalados de `@clerk/react` (`typecheck`). Sin expiración propia (no se decodifica `exp`, sin temporizadores ni caché de token). `getToken` → `no_session` ⇒ `session_expired`; `offline`/`error` ⇒ `recoverable_error` (no `session_expired`). | `npm run typecheck`; pruebas con puerto falso; revisión de código. | Pendiente |
| AC-A11 | Cambio de identidad, logout y cambio de taller cierran la generación; una respuesta tardía del contexto anterior **no** altera el estado ni el taller activo, incluida una respuesta que llega durante el reintento con token fresco y las que llegan tras un corte de T7 (AC-A32). | Pruebas con promesas diferidas. | Pendiente |
| AC-A12 | Doble montaje en `StrictMode` no duplica requests vivas ni deja controladores sin abortar. | Prueba de proveedor. | Pendiente |
| AC-A13 | No hay escrituras en `localStorage`, `sessionStorage` ni `indexedDB` para token, identidad o taller. | Pruebas con espías. | Pendiente |
| AC-A14 | **(G2 + G5)** El cliente valida `tenantId` como UUID canónico en minúsculas antes de enviar `X-Tenant-Id` (G2, prueba directa; mayúsculas/espacios ⇒ `client_bug` sin red). Que un `tenantId` fuera de las memberships de la última instantánea nunca se use: reducer (T16, G3); el uso real del header contra el backend es G5, exige TA-01. | Pruebas del cliente y del reducer. | Pendiente |
| AC-A15 | **(G5, exige TA-01)** Membership revocada → `access_lost` (T14) con una única revalidación contra el contrato congelado, aviso visible y sin bucle (T15). El reducer con una fuente falsa puede probarse antes (G3). | Prueba de proveedor. | Pendiente |
| AC-A16 | Estados accesibles (incluidos `auth_rejected`, `fatal_error`, `ready.degraded`): `role="status"`/`"alert"`, foco, uso por teclado, sin depender solo de color, sin scroll horizontal a ancho móvil. | Pruebas de Testing Library + revisión manual. | Pendiente |
| AC-A17 | `typecheck`, `lint` (`--max-warnings 0`), `test` y `build` pasan en Node 22 sin `eslint-disable` ni supresiones; sin otras dependencias. | Salidas reales. | Pendiente |
| AC-A18 | Ningún secreto/clave privada ni PII real en bundle, fixtures, logs ni `.env.example`. | Revisión + gitleaks en CI. | Pendiente |
| AC-A19 | Las sondas de lint de capas se repiten con la primera feature (`features` ⟂ `app`, `shared` ⟂ `features`, sin `import()` en `features`/`shared`, relativas que salen de la feature). | Registro de sondas. | Pendiente |
| AC-A20a | **(Independiente de G5/TA-01)** Aceptación real del token: procedimiento 8.2.B1 con `GET /api/v1/memberships` como sonda de autenticación. **Pasa** solo con un resultado concluyente de aceptación (`200` con clave `memberships`; `403` con envelope y `code` `ACTIVE_MEMBERSHIP_REQUIRED` o `PERMISSION_DENIED`; `409` con envelope y `TENANT_SELECTION_REQUIRED`) **y** `401` con envelope en los dos controles negativos (sin `Authorization`; firma JWT alterada a nivel de bytes, con verificación de que cambiaron). `429`, `5xx`, redirección o cualquier respuesta inesperada = **inconcluso**, no acredita aceptación. No consume C-01, no usa `X-Tenant-Id`, no añade código al repositorio. Requiere TA-05. | Evidencia (status, `error.code`, forma, nº de bytes alterados) sin tokens ni PII. | Pendiente |
| AC-A20 | **(G5, exige TA-01)** Integración real del **contexto** (8.2.B2): login Clerk de desarrollo y el contrato congelado con 0/1/N memberships. | Evidencia sin PII. | Pendiente (bloqueado hasta TA-01) |
| AC-A21 | **Idioma de los componentes de Clerk (decisión abierta).** Se acepta el inglés por defecto (sin dependencia) **o** se aprueba `@clerk/localizations` (nueva dependencia, versión a verificar al aprobar; ver TA-08 y 9.4). Hasta decidir, la implementación **no** instala la localización. | Decisión registrada del usuario/producto. | Pendiente |
| AC-A22 | Preflight CORS con `Authorization` y `X-Tenant-Id` desde los orígenes autorizados; `retry-after` legible o backoff fijo (8.2.B3). | Prueba manual contra backend. | Pendiente |
| AC-A23 | Permisos de presentación: **no aplica** hasta TA-02; ningún `can()`, ocultamiento por rol ni comparación de nombres de rol existe en el código. | Revisión de código. | Pendiente |
| AC-A24 | **Estados no recuperables representables:** `fatal_error` (`contract_violation`/`client_bug`) existe en `AuthState`, se renderiza sin botón de reintento (con *Cerrar sesión* y *Recargar la página*) y **solo** la transición T12 de 4.7 lo produce (según 3.2). Las otras dos clases se prueban por separado: T9 produce `recoverable_error` (fallo recuperable sin contexto que conservar) y T11 produce `auth_rejected` (401 persistente tras el único reintento); ninguna de las dos produce `fatal_error`. | Pruebas del reducer y de `auth-gate`. | Pendiente |
| AC-A25 | **Retención de contexto coherente (4.1/4.7):** `ready` + fallo recuperable ⇒ `ready.degraded` con contexto intacto; `loading_context` + fallo recuperable ⇒ `recoverable_error` sin ids de taller; tras revocación, logout, cambio de identidad, `auth_rejected`, `session_expired`, `fatal_error` y los cortes de T7 el nuevo `AuthStore` **no contiene ningún id del taller ni de las memberships previas** (búsqueda en el estado serializado, prueba 1 de 4.7). La **identidad** se trata aparte: desaparece tras logout, `session_expired` y cambio de identidad, y se conserva —solo en el campo `identity`— en `auth_rejected`, `fatal_error`, `recoverable_error` y `loading_context`/`no_access` posteriores a `access_lost`, porque la sesión autenticada sigue vigente. No existe campo, ref ni módulo que retenga ids de taller fuera de `AuthStore` salvo la closure de la operación en vuelo. | Pruebas del reducer + revisión de código. | Pendiente |
| AC-A26 | **Validación de URL:** las rutas rechazadas y aceptadas listadas en 5.3 se comportan como se indica (rechazo ⇒ `client_bug` sin `getToken` ni `fetch`); `/api/v1/../../../otra-ruta` y variantes codificadas no llegan a `fetch`; `url.origin`/`pathname` verificados. | `http-client.test.ts`. | Pendiente |
| AC-A27 | **Cancelación sin red:** abortar o vencer el *timeout* mientras `getToken()` está pendiente ⇒ **`fetch` nunca se invoca** aunque el token llegue después; sin rechazos no manejados; abortar durante `fetch` ⇒ `signal` abortada; abortar antes de `parse` ⇒ `parse` no se invoca. | `http-client.test.ts` con promesas diferidas. | Pendiente |
| AC-A28 | **Redirecciones:** `opaqueredirect`, `3xx` y `redirected: true` ⇒ `unexpected_redirect` ⇒ `fatal_error` (`contract_violation`); nunca se sigue la redirección ni se reenvía el token. | `http-client.test.ts`. | Pendiente |
| AC-A29 | **401 persistente:** tras el único reintento con token fresco ⇒ `auth_rejected` (no `session_expired`); `signOut()` **no** se invoca automáticamente; la UI ofrece *Reintentar* y *Cerrar sesión* y muestra `request_id`. | Pruebas de proveedor con fuente falsa y puerto falso. | Pendiente |
| AC-A30 | **Errores de Clerk:** `toTokenResult` distingue `ClerkOfflineError` (`offline`) de cualquier otra excepción (`error`), sin afirmar red; `import { ClerkOfflineError } from '@clerk/react/errors'` compila con la versión instalada. | Pruebas con doble de `getToken` + `npm run typecheck`. | Pendiente |
| AC-A31 | **Puerto `WorkshopContextSource`:** el proveedor invoca la fuente con `{ scope, tokenPolicy }`; el reintento es **uno** por operación con `'fresh'` y el **mismo** `scope.signal`; cancelar la generación cancela la operación completa (ambos intentos). El adaptador real **no** existe antes de TA-01. | Pruebas de `withSingleFreshRetry` y de proveedor con fuente falsa. | Pendiente |
| AC-A32 | **Cortes de T7 (G3, con fuente falsa; no exige TA-01):** una revalidación desde `ready` que devuelve `none` (T7g), `multiple` sin el par activo (T7f), otro taller (T7d) u otra membership del mismo taller (T7e) incrementa `generation`, **aborta** la `signal` de las operaciones en vuelo del contexto descartado y descarta sus respuestas tardías (incluidas las de otra revalidación de la misma generación). Sin corte (T7b, T7c): misma `generation`, nada abortado. Alineado con 6.4. | Prueba 10 de 4.7: reducer + proveedor con promesas diferidas. | Pendiente |
| AC-A33 | **Espera de `429` (G3/G4):** `ready.degraded` y `recoverable_error` conservan `retryNotBefore` (`Retry-After` con tope 120 s, o 5 s si no es legible; `null` en otras razones); *Reintentar* permanece deshabilitado hasta esa marca y el reducer ignora `retry_requested` anterior a ella; el proveedor no revalida en ese caso. | Prueba 11 de 4.7: reducer + `auth-gate` con temporizadores simulados. | Pendiente |

---

## 9. Dependencias, bloqueos y conflictos

### 9.1 Bloqueos Track A

| ID | Bloqueo | Responsable | Evidencia necesaria para resolverlo | Qué bloquea |
| --- | --- | --- | --- | --- |
| **TA-01** | **Congelar el contrato de bootstrap y selector.** Confirmar/congelar en `docs/api/` y actualizar FE-DOC-09: `GET /api/v1/me` (respuesta exacta de C-01, semántica de `user: null`, de `mode` y de `tenantId`), orden/estabilidad de `memberships`, `cache-control: no-store`, ausencia de paginación/tope; `X-Tenant-Id` como único selector (formato UUID canónico, sin trim, valor único), y la tabla de errores de C-02 (status + code). Aclarar si `/me` seguirá devolviendo 200 `unavailable` (no 403) sin membership. | Track A (backend) + dueño de contratos compartidos | Texto de contrato aprobado en `docs/` (no solo código) y referencia al commit; confirmación de que `5812632` es el contrato vigente. | **Solo G5** (2.3): parser, adaptador de `WorkshopContextSource`, uso real del contexto/`X-Tenant-Id`, códigos del selector en `api-failure.ts`; AC-A07 (parte G5), A08, A09b, A14 (parte G5), A15, A20. **No bloquea G1–G4** ni AC-A20a (Clerk, sesión, token, transporte, máquina de contexto, `signed_in_context_pending`). |
| **TA-02** | **Contexto autoritativo y permisos efectivos del taller activo.** Congelar un endpoint de tenant (path y método a decidir por Track A; **no se propone ni inventa aquí**) que devuelva para la membership validada: `membershipId`, `tenantId`, roles (informativos), y **permisos efectivos como códigos estables del catálogo RBAC** con su scope (`tenant` / `assigned` / `quality_control`), `requestId` opcional, `cache-control: no-store`; semántica de unión de roles; y garantía de que el cliente nunca envía permisos. Debe indicar si el payload es el único medio para presentación (el servidor sigue autorizando cada operación). | Track A (backend) | Contrato en `docs/api/` + prueba de integración del backend (incluyendo membership revocada → 403 y multi-rol). | Todo el trabajo de permisos de presentación; AC-A23; `ready` con capacidades. |
| **TA-03** | **Nombre visible del taller por membership** para el selector (p. ej., `displayName`) y, si se desea, un identificador no sensible de ubicación principal. Debe decirse si se amplía C-01 o se ofrece otro contrato; sin PII innecesaria. | Track A (backend) | Contrato congelado + prueba. | Selector utilizable (4.4). Hasta entonces `workshop_selection_required` no es seleccionable. |
| **TA-04** | **Política de “sin membership” → destino.** Decidir el flujo tras `no_access` (aceptar invitación, crear taller, contactar administrador) y qué endpoints lo soportan. | Dueño de producto + Track A | Decisión aprobada y contratos de invitación/onboarding (fuera de esta tarea). | CTA en `no_access` (hoy: ninguno). |
| **TA-05** | **Congelar el comportamiento del token de sesión**: confirmar que el backend aceptará el token de sesión **por defecto** (sin plantilla), la lista exacta de orígenes `azp` por entorno y el `iss`. | Track A (backend) / quien administre las instancias Clerk | Valores por entorno documentados (sin secretos) y prueba de verificación con el origen real del frontend. Opcional: que Track A designe una **sonda de autenticación pura** documentada; mientras tanto B1 usa `GET /api/v1/memberships` (8.2). | **AC-A20a** (precondición de la verificación real de identidad; no depende de TA-01) y AC-A20. |
| **TA-06** | **Registro público de Clerk**: habilitado o solo por invitación. | Dueño de producto | Decisión registrada. | Copy y flujo de `no_access`; no bloquea la implementación. |
| **TA-07** | **CORS y cabeceras**: documentar `CORS_ALLOWED_ORIGINS` en `.env.example`; confirmar que se aceptan `Authorization` y `X-Tenant-Id` en preflight; evaluar exponer `Retry-After` (`Access-Control-Expose-Headers`) para que el cliente lo lea. Sin esto el cliente usa backoff fijo de 5 s en 429. | Track A (backend) | Prueba de preflight y de lectura de `Retry-After` desde un origen autorizado. | AC-A22 (no bloquea el resto). |
| **TA-08** | **Localización de la UI de Clerk** (opcional): aprobar `@clerk/localizations` si se quiere español. | Dueño de producto / arquitectura | Aprobación de dependencia. | AC-A21 (decisión abierta); mejora de UX; no bloquea. |
| **TA-09** | **Política ante 401 persistente**: confirmar “sin cierre de sesión automático” (D-A12) o pedir cierre automático (decisión de producto, con la excepción documentada frente a Security §5/§8). | Dueño de producto / arquitectura | Decisión registrada. | Comportamiento de `auth_rejected`; no bloquea (por defecto, sin cierre automático). |

### 9.2 DOC_CONFLICT

**DOC_CONFLICT-1 — Existencia de `/me` y `X-Tenant-Id`.**
- Fuente: `docs/OPEN-QUESTIONS.md` FE-DOC-09; `docs/agents/api-rules.md`, `authentication-rules.md`, `docs/architecture/authentication-and-workshop.md` (“Falta congelar el contrato… No inventar /me, headers de tenant ni shape de permissions”).
- Contrato vigente: no aprobado; “no inventar”.
- Evidencia en conflicto: el backend implementa y prueba `GET /api/v1/me` y `X-Tenant-Id` (commits `5812632`, `4e3656b`; `docs/SPRINT-1-FINAL-QUALITY-GATE.md` del backend), aunque `me.ts` declara “DOC_DECISION_REQUIRED”.
- Resolución propuesta: Track A congela C-01/C-02 en `docs/api/` y el dueño de FE-DOC-09 actualiza el estado. **Este documento no edita esos contratos.** Hasta entonces C-01/C-02 son `OBSERVADO_BACKEND`.
- Impacto frontend: G1–G4 listos; G5 y AC-A20 esperan TA-01 (2.3). Backend: confirmar o corregir el contrato observado.

**DOC_CONFLICT-2 — Ambigüedad “403/estado de onboarding” para falta de membership.**
- Fuente: ADR-006 §7/§14; `docs/security/frontend-security.md` §5.
- Contrato vigente: usuario sin membership → “403/onboarding”.
- Evidencia: `/me` responde **200** `unavailable`; las rutas de tenant responden **403 `ACTIVE_MEMBERSHIP_REQUIRED`**; además existen otros 403 (`PERMISSION_DENIED`, `TENANT_ACCESS_DENIED`) que **no** significan onboarding.
- Resolución propuesta: esta especificación (3.2, 4.3) trata “sin acceso” solo por C-01 o por `ACTIVE_MEMBERSHIP_REQUIRED` + revalidación; Track A confirma en TA-01. Impacto frontend: ya cubierto; backend: confirmación documental.

**DOC_CONFLICT-3 — Permisos de presentación sin fuente.**
- Fuente: `docs/agents/tenant-rbac-rules.md` (“Use the approved context DTO and stable permission codes”).
- Evidencia: no existe DTO aprobado ni endpoint que devuelva permisos efectivos del miembro (solo catálogos y rutas de administración con `memberships.read`).
- Resolución: TA-02. Impacto frontend: sin permisos de presentación; backend: contrato nuevo.

### 9.3 Riesgos

| ID | Riesgo | Mitigación |
| --- | --- | --- |
| R-A01 | Peer de React `~19.3.0-0` de `@clerk/react`: un salto a React 19.4 romperá la instalación. | No forzar; esperar versión de `@clerk/react` compatible; reportar. |
| R-A02 | `@clerk/react 6.17.4` es de horas antes de esta spec. | Re-verificar al implementar (7.1 punto 2); `~6.17`; `npm audit`. |
| R-A03 | `/me` es una instantánea: puede quedar obsoleta (membership revocada, nuevo taller). | `ready` no es autorización; revalidación por 403 (4.5); el servidor decide en cada request. |
| R-A04 | Fragmento de invitación vs. routing por hash de `<SignIn />`. | Dependencia registrada en 2.2; resolver en la especificación de invitaciones. |
| R-A05 | Sin selector utilizable, un usuario multi-taller queda bloqueado en la pantalla informativa. | TA-03; es el costo explícito de no inventar etiquetas. |
| R-A06 | Instancia Clerk mal configurada (`azp`/`iss`) produce 401 aunque el login funcione; el frontend no puede distinguirlo de una sesión inválida. | Estado `auth_rejected` (no `session_expired`), sin cierre automático (6.2); verificación real AC-A20a (8.2.B1) y TA-05. |
| R-A07 | Compatibilidad de `@clerk/react` con Vite 8/TS 6/ESLint 10 no verificada por metadatos. | AC-A17 la demuestra; si falla, detener y reportar. |

### 9.4 Decisiones pendientes (no son bloqueos técnicos de Track A)

| ID | Decisión | Quién decide | Opciones | Por defecto mientras no se decida |
| --- | --- | --- | --- | --- |
| AC-A21 / TA-08 | **Idioma de los componentes de Clerk** (`<SignIn />`) | Dueño de producto / arquitectura | (a) aceptar inglés; (b) aprobar `@clerk/localizations` (nueva dependencia; verificar versión, peers y Node 22 al aprobar; añadir a la tabla 7.1) | Inglés, sin dependencia. La implementación **no** instala la localización. |
| TA-06 | Registro público de Clerk habilitado o solo por invitación | Dueño de producto | Habilitado / por invitación | No bloquea; `no_access` funciona en ambos casos. |
| TA-09 | Cierre de sesión automático ante 401 persistente | Dueño de producto / arquitectura | Sin cierre automático (D-A12) / con cierre automático | Sin cierre automático. |
| 7.2 | Regla de prefijo de clave publicable por entorno (`pk_live_` en producción) | Quien administre la instancia Clerk | Confirmar o ajustar | Regla propuesta de 7.2; reportar si la instancia real difiere. |
| 1.1 | Ubicación vigente de esta especificación | Resuelta en esta revisión | Worktree vigente; espejo en checkout principal | Ver 1.1. Si se quiere versionar, requiere commit autorizado (no incluido). |

---

## 10. Estado de verificación de este documento

- No se ejecutó `npm install`, `typecheck`, `lint`, `test` ni `build`, ni ninguna prueba/comando del backend.
- Consultas externas realizadas: `npm view` (registro npm) para `@clerk/react`, `@clerk/clerk-react`, `@clerk/shared`, `@clerk/localizations` y `react`; documentación oficial de Clerk (`useAuth`, `ClerkProvider`, `SignIn`) vía `clerk.com/docs/react/...` (2026-09-30). La opción `skipCache` quedó **confirmada** contra la documentación oficial de `Session.getToken` y contra los tipos de los tarballs publicados de `@clerk/shared@4.37.1` y `@clerk/react@6.17.4` (6.1); no se instaló nada en el proyecto y los tarballs se extrajeron en un directorio temporal del job. La compilación con la dependencia realmente instalada sigue pendiente (AC-A10).
- Revisión 3: se contrastó además el subpath `./errors` de `@clerk/react@6.17.4` (`package.json` y `dist/errors.d.mts`; `ClerkOfflineError`, `ClerkRuntimeError`, `isClerkRuntimeError`) en un tarball publicado extraído en un directorio temporal del job (borrado después). Las dos copias de este documento se compararon por SHA-256 antes de editar (idénticas, ambas sin versionar).
- Corrección 3.1: solo edición del documento; no se ejecutó código ni se consultó de nuevo ninguna fuente externa. Las reglas de la sonda B1 se apoyan en el orden de middleware ya leído del backend (`src/api/tenant-request.ts`, `src/api/errors.ts`) y no se han ejecutado.
- Los algoritmos de 5.3, el reducer de 4.7 y `withSingleFreshRetry` son **especificación**: no se escribió ni ejecutó código; la verificación está en los AC (todos **Pendiente**).
- Todos los AC de 8.4 permanecen **Pendiente**.
