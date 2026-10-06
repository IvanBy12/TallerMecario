# Sprint 3 — Gate E2E móvil (recepción)

**Decisión: `READY_FOR_GATE`**. Sprint 3 no está aprobado: quedan gates externos/documentales. Este archivo registra pruebas y límites; un build o una prueba parcial no aprueba el sprint.

## Alcance vigente — revisión 2026-10-05

El usuario eliminó la firma digital del flujo estándar y autorizó el cambio en frontend y backend. Recepción → checklist/daños → confirmar cierre → orden ya no requiere captura, documento de aceptación ni subida R2. Se conservan consentimiento de servicio, declaración adulta, permisos, aislamiento, firmas históricas y cierre idempotente.

Fuente de la revisión: `docs/decisions/2026-10-05-reception-without-digital-signature.md`; Track A `TallerMecarioB/docs/api/reception-contract.md` §§3, 5.4, 5.8; migración nueva `0024_reception_close_without_signature.sql`. Los snapshots previos de Notion son históricos y no se reescriben.

| Campo | Valor |
| --- | --- |
| Estado del harness | **harness hardened**; política de artefactos y pruebas sintéticas conservadas |
| Rama frontend | `task/s3-e2e-mobile`; cambios sin commit sobre `2594134` |
| Rama backend | `codex/remove-reception-signature`; cambios sin commit sobre `4c456d9` |
| Ambiente de la corrida | localhost:5173 → localhost:3000, Clerk de prueba y PostgreSQL 18 local; backend actualizado y migración 0024 aplicada |
| Dispositivo | Chromium, descriptor Pixel 5, viewport 393×727, `isMobile`, `hasTouch` |
| Proyecto del gate | `mobile-chromium`; sesiones existentes, sin repetir setup |

## Casos y evidencia

PASS previo identifica evidencia de la sesión anterior, no una repetición sobre estos cambios. PASS identifica la corrida real del nuevo flujo del 2026-10-05. NOT_RUN identifica una prueba aún no ejecutada.

| Caso | Spec | Cobertura | Estado |
| --- | --- | --- | --- |
| Setup | `e2e/auth.setup.ts` | Preflight y tres sesiones reales Clerk; 4/4 informado por el usuario, no repetido | PASS previo |
| E2E-01 | `e2e/s3-happy-path.spec.ts` | Taller → cliente/vehículo → consentimiento → recepción → agregar/editar checklist → daño → recarga → cierre sin firma → orden. Verifica signature null y cero requests de aceptación/media/firma | PASS |
| E2E-02 | ídem | Recarga y POST close repetido: misma orden y detalle idéntico, sin firma | PASS |
| E2E-03 | ídem | UI y DTO con estado inicial reception de la orden | PASS |
| E2E-04 | `e2e/s3-rbac.spec.ts` | Técnico sin permisos: acciones ausentes y mutaciones 403, recurso intacto | PASS |
| E2E-05 | `e2e/s3-cross-tenant.spec.ts` | Anti-oráculo, aislamiento y recurso de B intacto | PASS |
| E2E-06 | Retirado | Firma/R2 eliminado del flujo por decisión explícita del usuario; no se ejecuta ni se contabiliza como PASS | RETIRADO |
| Smoke escritorio | `e2e/desktop-smoke.spec.ts` | Sesión real, taller activo, listado y pantalla de nueva recepción en desktop (sólo lectura) | PASS |

Antes de esta revisión, E2E-01 pasó creación, checklist, daño y recarga, pero falló esperando «Firma registrada». El diagnóstico aislado observó upload-session 201, preflight R2 OPTIONS 403 y Chromium `PreflightMissingAllowOriginHeader`. La revisión elimina esa dependencia por decisión de producto; no convierte esa corrida fallida en PASS.

### Historial y límites

E2E-03 observa `serviceOrder.status = reception`. Sprint 3 no ofrece endpoint de historial. La fila inicial NULL → reception, unicidad, auditoría, rollback, locks y RLS se prueban en las suites backend y bases desechables. No inventar GET orders ni lectura SQL desde el frontend.

La recepción y el cierre usan servicios reales, sin interceptar `/api/v1/*`, sin mocks de Clerk ni respuestas fabricadas. El nuevo flujo no invoca R2; los gates externos de media para otras funciones siguen independientes y no se declaran aprobados.

## Ejecución dirigida

La migración 0024 se aplicó correctamente en PostgreSQL local el 2026-10-05 mediante el runner de TallerMecarioB. El backend actualizado se reinició con autorización explícita del usuario, reutilizando la configuración local sólo en memoria, sin imprimir ni guardar credenciales. Su readiness confirmó conexión a la base. No se cambiaron las credenciales ni los storage states.

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e:harness
npm run build
git diff --check
npx playwright test e2e/s3-happy-path.spec.ts --project=mobile-chromium --headed --no-deps
```

El happy path vigente contiene tres pruebas: E2E-01, E2E-02 y E2E-03. E2E-06 fue retirado. `--no-deps` conserva las sesiones reales ya validadas. No repetir setup/OTP salvo necesidad demostrada. E2E-04/05 no cambian.

Variables: `.env.e2e.example` conserva los nombres disponibles; `.env.e2e` local es privado e ignorado. No publicar passwords, OTP, tokens, storage states ni URL firmadas. La placa se deriva de un runId único; no se reutiliza un vehículo que tenga una recepción abierta.

Cada corrida mutante crea datos de prueba propios. No existe API pública de borrado del flujo; no borrar datos con SQL. Las suites backend crean bases locales desechables y verifican su teardown. Esto no es limpieza de los fixtures reales del E2E.

## Seguridad de los artefactos y de las credenciales

**Estrategia anti-secreto (F1).** `fill()`, `type()` y `press()` de Playwright escriben su argumento en el título del paso y en el call log
de los errores, y de ahí pasa a `list`, `json`, `junit` y al reporte HTML. Se verificó empíricamente (control positivo
`e2e-harness-tests/browser/control`) que un `fill(password)` deja el valor en el reporte HTML —comprimido en base64 dentro de `index.html`, por
lo que un `includes()` sobre el archivo no lo vería—. Por eso:

- Correo, contraseña y código de verificación entran con `enterSecret` (`e2e/support/secret-input.ts`): una única acción visible
  (`locator.evaluate`) cuyo título no lleva el valor. Dentro del navegador se enfoca el campo, se asigna con el **setter nativo** de
  `HTMLInputElement.prototype` (el rastreador de React detecta el cambio como con el teclado) y se emiten `input` (InputEvent) y `change`
  con `bubbles`; se comprueba que el valor quedó aplicado y solo se devuelve un código fijo. Esa función captura sus propias excepciones.
- Cualquier excepción del login se sustituye por un `LoginFailure` **nuevo**, con mensaje fijo (paso + nombre de clase de una lista cerrada) y
  **sin `cause`**; el error original (call log, texto de página) nunca se relanza. La página se lleva a `about:blank` antes.
- `trace`, `screenshot` y `video` están en `off` para todas las corridas con credenciales (`e2e/support/artifact-policy.ts`, compartido por la
  configuración real y la del harness). En CI el reporter es solo `list`.
- **El reporte HTML y `test-results/` de una corrida autenticada no se publican** (el workflow no sube artefactos). Aunque el harness demuestra
  que las credenciales no entran, esos archivos contienen además correos, IDs de taller y texto de páginas con PII; es preferible perder el
  artefacto a exponerlo. `e2e/.auth/` (cookies de sesión de Clerk) tampoco se sube nunca.
- El colector legado de firma/R2, conservado y probado por compatibilidad, viene de `e2e/support/network-evidence.ts`: orden, método, ruta con UUID enmascarados, estado HTTP y
  booleanos. De la `uploadUrl` firmada solo se retienen **en memoria** origen y ruta para correlacionar el PUT; nunca query, firma, credencial ni
  URL completa, y `toJSON()` del colector solo expone las entradas sanitizadas.
- Límite conocido: `DEBUG=pw:*` / `PWDEBUG` activan trazas internas de Playwright que no forman parte de la garantía; el workflow no los define
  (lo comprueba `e2e-harness-tests/unit/workflows.test.ts`) y no deben activarse en corridas con credenciales. En local se comprobó que
  `DEBUG=pw:api` no imprime el argumento de `locator.evaluate`.

**Prueba automática (sin credenciales reales).** `npm run test:e2e:harness` lanza Playwright en un proceso hijo con entorno limpio, contra un
formulario local que imita a Clerk, con los marcadores sintéticos `AUDIT_SYNTHETIC_PASSWORD`, `AUDIT_SYNTHETIC_TOKEN`,
`AUDIT_SYNTHETIC_COOKIE` y `AUDIT_SYNTHETIC_SIGNED_QUERY`, fuerza un login correcto y tres fallos (contraseña rechazada, excepción al introducir
la credencial, campo inexistente) y comprueba que ningún marcador aparece en stdout/stderr, JSON, JUnit, HTML (incluido su zip embebido),
adjuntos ni nombres de archivo, en las formas cruda, URL, hex, UTF-16 y base64. El control positivo garantiza que el escáner no es ciego.

## Artefactos de la corrida vigente

| Artefacto | Contenido | Publicable |
| --- | --- | --- |
| Adjunto e2e-01-run | runId, receptionId, vehiclePath y orderNumber | Revisar antes de compartir |
| Adjunto e2e-02-close-replay | Estado 200 y booleanos de replay/inmutabilidad | Sí, sanitizado |
| HTML / test-results | Diagnóstico local autenticado | No |
| e2e/.auth | Cookies y sesiones Clerk existentes | Nunca |

El flujo ya no genera `s3-signature-r2-evidence.json`. No modificar trace/screenshot/video para facilitar debugging.

## Verificación local del cambio

Typecheck, lint y build de ambos repositorios pasaron. Frontend: 531 tests; harness: 191 tests. Backend API: 123 tests; PostgreSQL: 24 tests, con cierre sin firma y guardas restantes; upgrade de migraciones: PASS con evidencia histórica intacta y rerun no-op. Los checks de base de datos se ejecutaron sólo desde TallerMecarioB en bases desechables.

| Check | Resultado |
| --- | --- |
| Corrida real del nuevo flujo sin firma | **PASS**: E2E-01/02/03, 3/3, 8.4 s; mobile-chromium headed, sin setup ni reintentos |
| Gates externos/documentales de Sprint 3 | Pendientes; sin aprobación global |

La corrida real confirmó recepción sin firma antes y después del cierre, cero requests de documento de aceptación/media/firma, misma orden en el replay y detalle inmutable. No se volvió a ejecutar setup/OTP. En la revisión posterior solicitada por el usuario el 2026-10-05, E2E-01/02/03 volvieron a pasar (3/3, 8.1 s). E2E-04/05 y smoke de escritorio se ejecutaron sin editar sus specs y pasaron (3/3, 12.7 s). Typecheck y lint pasaron en ambos repositorios; frontend 531 tests, harness 191, API 123 y PostgreSQL 24 volvieron a pasar. El typecheck inicial del frontend requirió repetir con permisos para escribir tsbuildinfo fuera del writable root; no hubo error de código. El build frontend pasó con el aviso existente de chunk mayor a 500 kB. No se detectaron nuevos defectos en el alcance probado ni se cambió código en esta revisión.

## CI y seguridad

Las pruebas sintéticas del harness protegen la política de artefactos y la ausencia de secretos en reporters. El workflow no publica reportes autenticados ni estados de sesión. Los colectores y adaptadores legados de firma/R2 permanecen probados por compatibilidad, aunque el nuevo happy path no los usa.

## DOC_CONFLICT — recepción offline en Sprint 3

La referencia anterior pedía recepción offline, mientras el roadmap ubica sincronización completa en Sprint 13. Este cambio no implementa ni aprueba recepción sensible offline; no modifica consentimientos ni inventa bundles, expiración o idempotencia.

## Decisión

`READY_FOR_GATE`. El flujo real vigente pasó E2E-01/02/03; E2E-03 mantiene su límite observable y evidencia backend. E2E-06 permanece RETIRADO, nunca PASS. Los resultados de esta tarea no declaran Sprint 3 aprobado.

## Estado Git de esta tarea

Inicial: frontend `task/s3-e2e-mobile` tenía dos cambios deliberados; backend `main` estaba limpio. Se conservaron los exact matches y los tres combobox con valores contractuales.

```text
 M e2e/s3-happy-path.spec.ts
 M e2e/support/reception-flow.ts
```

Final frontend (`git status --short`):

```text
 M docs/quality/s3-mobile-e2e.md
 M e2e-harness-tests/unit/documentation-state.test.ts
 M e2e/s3-happy-path.spec.ts
 M e2e/support/reception-flow.ts
 M src/features/reception/reception-workflow.test.tsx
 M src/features/reception/reception-workflow.tsx
?? docs/decisions/2026-10-05-reception-without-digital-signature.md
```

Final backend (`git status --short`, rama `codex/remove-reception-signature`):

```text
 M docs/api/reception-contract.md
 M drizzle/meta/_journal.json
 M scripts/close-api-mutations.cjs
 M scripts/reception-db-mutations.cjs
 M scripts/test-reception-db.cjs
 M scripts/test-reception-migration-upgrade.cjs
 M scripts/test-reception-mutations.cjs
 M src/receptions/close.ts
 M src/receptions/queries.ts
 M tests/reception-api/close.test.cjs
 M tests/reception-api/contract.test.cjs
 M tests/reception-api/queries.test.cjs
 M tests/reception/reception-db.test.cjs
?? drizzle/0024_reception_close_without_signature.sql
?? drizzle/meta/0024_snapshot.json
```

No se hicieron commits, push, reset, clean ni cambios en archivos privados de configuración o sesión. `git diff --check` pasó en ambos repositorios.
