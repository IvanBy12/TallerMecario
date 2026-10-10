# S4-F07-B — Reception post-create media orchestration

2026-10-09, America/Bogota. Frontend only, branch
`task/s4-f07-b-media-orchestration`, base
`c61e9eeec281bec667c2b246d022c2795b493275`. Head is the single local implementation
commit containing this report (`git rev-parse HEAD`); its SHA is included in the
handoff. No push, PR, backend modification, remote E2E or Sprint 4 PASS declaration.

## Production composition and authority

`ReceptionProvider` composes F07-A's `createReceptionOperationalMediaExecutor` and
`createReceptionOperationalMediaApi` with the verified ApiClient, tenantId and
session AbortSignal. `NewReceptionPage` uses that capability by default. A typed
injected capability remains available for synthetic tests, with an optional UUID
source. `UploadExecutor<ReceptionOperationalMediaInput>` remains the unchanged
F04 generic abstraction; there is no fake undefined input, second media client or
DTO reconstruction in the UI. Storage uses F01's direct signed PUT with issued
headers, credentials omitted and no bearer token.

Contract authority remains the approved task and F07-A's published reference,
backend `56c6e056934d271ada3c7ace667cdd2dbe809da3` / B04 Phase B.
DOC_CONFLICT: the older `reception-and-media-contract-status.md` PENDIENTE snapshot
and R0 readiness D6/D8/D10 describe absent attach/list/purpose contracts. F07-A
already reconciles those against Phase B. Resolution: retain historical sources
and consume the approved adapter. Frontend impact: real post-create composition
is now possible. Backend impact: none; no shared contract changes.

## Ownership, creation and mapping

PhotoPicker/usePhotoSelection and VideoPicker/useVideoSelection retain the
accepted original Files and own previews/metadata resources. Neither Files nor
object URLs move into NewReceptionPage. ReceptionMedia stays mounted across the
successful reception POST, receiving the real receptionId without changing its
selection key. Preview URLs never enter operational input or parent state.

Before creation, selection is local only: upload controls are absent and the
upload start guard rejects a null input. No upload-session POST, PUT, completion
or attach runs. The page cannot submit during asynchronous video metadata
validation, including a forced form submit.

The existing reception action ref prevents simultaneous submits. A separate
created-ID ref latches successful creation before navigation/render; subsequent
form submits cannot call create again. Form/vehicle/owner/adult/selection editing
locks after success. Media failures never replay reception POST, delete the
reception or turn the successful creation into a failed form.

| Accepted File | Operational mapping |
| --- | --- |
| Photo | mediaType `photo`, MIME = File.type, expectedSizeBytes = File.size |
| Walk-around video | mediaType `video360`, MIME = File.type, expectedSizeBytes = File.size |

Both receive the created receptionId. File.lastModified is unused; capturedAt
is omitted. Initial eligible service_provision consent remains the existing
boundary; no consent IDs or client purpose authority enter media requests.

Each accepted local selection receives a secure `crypto.randomUUID()` outside
render via the picker notification. The UUID and a monotonic zero-based sortOrder
are stored as transient selection metadata. Equivalent rerenders and legitimate
F04 safe-local restart preserve both. Repeated identical Files remain separate
selections; removal/replacement/reselection receives a new UUID and order.
Removed metadata is pruned. No keys, Files, Blobs or queue are persisted.

## Upload, association and partial success

Per item: local → F04 preparing/uploading/completing → active/unassociated →
associating → associated, or failed/uncertain association. F04 owns progress,
cancellation, ambiguous completion and restart classification. The shared ceiling
remains two explicitly started concurrent uploads, with no queue or automatic
batch dispatch.

A parsed active result triggers one normal attach through F07-A. The body contains
only mediaAssetId and the stable sortOrder; canonical purpose `intake_evidence`
comes from the backend. F07-A validates returned media identity and sortOrder.
Only successful association calls picker release and shows “Evidencia guardada”.
Active alone never releases the File or claims it is saved in the reception.

Failed/network/invalid association results retain active media identity and local
selection in memory. There is no automatic POST retry. An explicit association
retry sends the same receptionId/mediaAssetId/sortOrder; it never creates another
session, PUTs again, completes again or recreates the reception. Concurrent clicks
are guarded, and Retry-After follows the existing reception action mechanism.

PUT 403/412/network and ambiguous/malformed completion retain F04 recovery, with
no blind restart or attach. The reception remains created, and local evidence
remains visible for truthful partial-success decisions.

## Navigation and invalidation

No-media and explicit pre-create discard are the fast paths: one create then
navigation, with zero media requests. A failed create retains eligible local
Files; existing owner/consent rejection rules still clear invalid local captures.

With intended evidence, creation displays “Recepción creada. Ahora puedes
completar la carga de la evidencia.” and stays on the page. Each unresolved item
keeps its own status. A deliberate “Continuar a la recepción sin completar esta
evidencia” action warns that remaining local Files will be released and navigates
to the created reception. When every item is canonically associated, the page
offers the normal continuation without a pending warning. Clearing a capability
or aborting a session is never interpreted as all evidence being saved.

Pending selections install an unload warning and confirm ordinary link departures;
same-page anchors, downloads and opening another tab do not prompt. Explicit
continuation/unmount releases previews and cancels active work. Local recovery is
lost on departure/reload; there is no new media persistence or offline replay.

Identity, tenant and normalized semantic permission changes remount the existing
reception session, aborting requests and clearing sensitive draft/local state.
Equivalent permission/client-object refreshes retain its verified runtime snapshot,
Files, acknowledgements, post-create state and running tasks. Direct signal abort
also clears Files when the consumer stays mounted. Upload and association have
per-item abort boundaries; late results cannot confirm evidence in a new context.
Before-create eligibility invalidation is preserved. No signature capture is enabled.

## Verification

Node v22.23.3 / npm 10.9.9, pinned existing dependencies, no new package.

| Gate | Final result |
| --- | --- |
| Focused page/media orchestration + modified pickers, 5 test files | PASS 211/211 |
| New F07-B orchestration file alone | 27 behavioral tests, included above |
| npm run typecheck | PASS |
| npm run lint | PASS, zero warnings |
| npm test -- src/features/reception | PASS 420/420, 10 files |
| npm test -- src/shared/media | PASS 332/332, 10 files |
| npm test | PASS 1183/1183, 47 files |
| npm run test:e2e:harness | PASS 191/191, 11 files; local synthetic only |
| npm run build | PASS; existing >500 kB chunk warning |
| git diff --check | PASS; staged whitespace and final status checked at commit |

Focused command includes `reception-media-orchestration.test.tsx`,
`reception-media.test.tsx`, `reception-pages.test.tsx`, `photo-picker.test.tsx` and
`video-picker.test.tsx`. Coverage exercises the actual F07-A runtime with synthetic
API/storage responses, original File identity, zero media calls before successful
create, all mappings, delayed active/attach, explicit equivalent association retry,
create/upload/complete/association failure boundaries, partial success, invalidation,
equivalent refresh, unmount, UUID lifetimes, stable orders and bounded concurrency.
Existing F01–F07-A tests remain in full regression; F05 expectations were updated
for the approved post-create lock and association release boundary.

Initial lint exposed hook callback/type-style violations, corrected without rule
suppression. Initial focused failures exposed obsolete F05 expectations and test
fixture assumptions; revised tests retain behavioral checks for the new contract.
The first harness run in the sandbox failed 3/191 due to `listen EPERM 127.0.0.1`.
The same gate passed outside the sandbox, without code/test weakening. The
whitespace check caught one trailing space, removed before final verification.

## Remaining F07-C / final-gate work

Real browser R2/CORS proof remains unexecuted: private bucket policy for the exact
frontend origin, OPTIONS/PUT with signed headers, expiry, conditional 412 and
negative-origin behavior. Provisioned Clerk/backend/PostgreSQL/R2 environment,
valid binary fixtures and sanitized remote operational E2E evidence remain required.
Remote reception gallery/read/download UX, authorized playback and real recovery
reconciliation remain later work. Broader backend retention/holds/purge/scan,
lifecycle/RBAC and duration-policy gates still need their independent evidence.
Local tests/build/harness do not certify deployment, browser CORS or Sprint 4 PASS.

S4-F07-B: READY_FOR_REVIEW


## Follow-up verification — 2026-10-10 (America/Bogota)

Correction request: base `c61e9eeec281bec667c2b246d022c2795b493275`, initial
and final HEAD `d3ecbf25ffecd7f46a9aeb35d31ae5b890b8096f`. The specified
worktree exists on `task/s4-f07-b-media-orchestration` and was initially clean.

The exact MEDIUM/LOW findings and Verdict could not be recovered from the
implementation chat, its local session records, repository evidence or Git notes.
The two subsequent user excerpts contain reviewed base/head and the implementation
handoff, respectively, without finding descriptions. Neither severity is treated
as a known or closed finding. The changed page/context/media/upload/capability,
pickers and tests were inspected independently against the approved task and F07-A.
No new reproducible defect was established by the executed checks; this does not
prove the absent findings are invalid. No production correction, regression test
or correction commit was created; only this verification note was added.

Node v22.23.3. The worktree initially lacked dependencies (`vitest: command not
found`); `npm ci --no-audit --no-fund` installed the existing lockfile without
tracked dependency changes. Actual gates: typecheck PASS; lint PASS (zero warnings);
reception PASS 420/420 (10 files); shared media PASS 332/332 (10 files); full tests
PASS 1183/1183 (47 files); local synthetic harness PASS 191/191 (11 files), without
an environmental failure on this run; build PASS (existing >500 kB chunk warning);
`git diff --check` PASS. No omitted/skipped tests were reported by these gates.

Remaining blocker: obtain the complete Findings/Verdict and reproduce each
original finding before claiming closure or readiness for independent re-review.
Real browser/R2/CORS and remote E2E remain F07-C work; no Sprint 4 PASS is declared.
Final worktree has only this uncommitted documentation change. No push or PR.

S4-F07-B FIXES: BLOCKED


## FIX-01 — confirmed Recovery Review finding (2026-10-10, America/Bogota)

Scope: the confirmed MEDIUM navigation/session-action finding only. Base
`c61e9eeec281bec667c2b246d022c2795b493275`; initial implementation HEAD
`d3ecbf25ffecd7f46a9aeb35d31ae5b890b8096f`; same existing worktree and branch
`task/s4-f07-b-media-orchestration`. The pre-existing uncommitted follow-up
verification note above is preserved verbatim and included in the correction
commit. The unavailable MEDIUM/LOW findings from the older review are still
unrecovered; no claim is made that FIX-01 closes them.

### Reproduction and root cause

The original page intercepted document link clicks and beforeunload only. Browser
POP and programmatic router transitions never passed through that click handler;
AppShell invoked onChangeWorkshop/onSignOut directly. After creating a reception
with an unresolved photo, Back unmounted the page without asking and released
the original File/preview. The same lifecycle could discard an in-flight PUT or
attach. Explicit detail continuation also bypassed the link handler.

Before changing production code, three regression cases used a real
createMemoryRouter and the production page/shell: Back with a local photo after
creation, change workshop, and sign out. All three FAILED waiting for the missing
exit dialog (3 failed; the filter intentionally did not execute 27 existing
cases). After the correction those cases pass within the expanded regression
matrix. This baseline is a router transition, not a simulated link interception;
Chromium history verification below additionally exercises actual browser POP.

### Router and shell integration

React Router **7.18.4**, React 19.3.0, Node v22.23.3, existing lockfile. The installed
useBlocker implementation requires a data-router context. An added compatibility
test actually renders it inside BrowserRouter and asserts the runtime error;
TypeScript importability is not treated as compatibility evidence. Official
references: [mode availability](https://reactrouter.com/7.18.4/start/modes) and
[useBlocker](https://reactrouter.com/7.18.4/api/hooks/useBlocker).

App now creates/disposes one browser data-router root with a single `*` route.
Its existing public/auth route table and AppRoutes descendants remain declarative,
with no loaders, route-table migration, new dependencies or history monkey-patch.
The router is initialized in a lifecycle effect and disposed on cleanup, including
Strict Mode's probe. AppRoutes and AuthenticatedRoot retain their business ownership.

VoluntaryExitProvider owns one supported useBlocker and one registration shared
by router exits and AppShell's voluntary actions. NewReceptionPage registers only
its message, session signal and a release callback; the shell owns no Files,
recepciones or upload state. A native modal dialog provides one confirmation,
Escape cancellation and focus restoration. Reject resets the blocker without
canceling work or executing the callback. Accept synchronously unmounts the
existing media boundary before proceeding/calling the requested action once;
its existing cleanup aborts PUT/attach and releases local previews. There is no
reception/media mutation in the guard. Explicit pre-create discard already
accepts local release and does not prompt again.

Protection follows unresolved local selection or video processing, not upload
activeCount. Selected Files remain present through preparing, uploading,
completing, active/unassociated, associating, failed/ambiguous results, until
canonical association releases them. Associated-only and empty states navigate
freely. The pre-/post-create messages accurately describe whether reception
creation succeeded. Same-page anchors and new-tab/download behavior remain normal;
full-document exits retain the browser's beforeunload warning.

External session invalidation, identity/tenant changes and semantic permission
revocation still remount/abort through the original auth/reception boundary.
Guard cleanup cancels a stale dialog/blocked intent immediately and never invokes
the voluntary callback. Equivalent context refresh preserves Files and operations.
All existing mapping, idempotency, order, concurrency and association tests remain
passing; there is no offline persistence or backend change.

### Regression evidence and final gates

86 new orchestration cases exercise actual memory-router Back/Forward, push/replace,
all eight pending stages, shell accept/reject in local/PUT/attach, forced changes
with an open dialog, equivalent refresh, no pending/all associated, Strict Mode,
Escape, beforeunload, late results and exact mutation counts. Two App cases prove
the installed router incompatibility and disposal of history/unload listeners.

22 new Chromium cases run production AppRoutes, AppShell, NewReceptionPage,
ReceptionProvider and the same single-root data-router/coordinator integration.
The isolated Vite fixture uses synthetic in-memory HTTP/storage responses only;
it never contacts Clerk/backend/R2. Browser goBack/goForward exercise real
indexed history, including repeated rejection followed by another attempt;
programmatic exits, PUT/attach cancellation, original preview preservation,
shell actions, external session invalidation and rejected reload are verified.
This is local browser evidence, not remote operational E2E or an R2/CORS gate.

| Executed gate | Final result |
| --- | --- |
| Focused App + orchestration tests | PASS 118/118, 2 files |
| Focused Chromium FIX-01 spec | PASS 22/22 |
| npm run typecheck | PASS |
| npm run lint | PASS, zero warnings |
| npm test -- src/features/reception | PASS 506/506, 10 files |
| npm test -- src/shared/media | PASS 332/332, 10 files |
| npm test | PASS 1271/1271, 47 files |
| npm run test:e2e:harness | PASS 191/191, 11 files; includes new Chromium cases |
| npm run build | PASS; existing >500 kB chunk warning |
| git diff --check | PASS, including staged changes before commit |
| git status --short | Scoped changes inspected; final committed status in handoff |

Final gates execute all cases without skipped tests. The harness deliberately
expects its three original secure failure controls and one insecure control to
fail; no new FIX-01 failure is accepted. The focused command is
`npm test -- src/app/App.test.tsx src/features/reception/reception-media-orchestration.test.tsx`.
The browser spec is also executable directly with HARNESS_OUT_DIR set to an OS
temporary directory, HARNESS_SUITE=secure, and the existing Playwright harness config.

Intermediate issues were corrected, not hidden: jsdom's dialog visibility stub
needed a DOM-existence guard for node-environment suites; the first browser fixture
used non-image bytes and was replaced with a valid synthetic PNG; Playwright
reload waited for a load event after a deliberately rejected beforeunload, so the
final case triggers the real browser reload and checks the dialog plus retained
URL/preview instead. Final type/lint and relevant regression/harness gates were
rerun after these fixes.

### Changed files and local handoff

- Production: src/app/App.tsx; src/app/shell/app-shell.tsx;
  src/features/reception/new-reception-page.tsx;
  src/shared/navigation/voluntary-exit.tsx.
- Tests/support: src/app/App.test.tsx; src/app/dashboard-route.test.tsx;
  src/features/reception/reception-media-orchestration.test.tsx;
  src/features/reception/reception-media.test.tsx; src/test/render-reception.tsx;
  src/test/data-memory-router.tsx; src/test/setup.ts.
- Browser harness: e2e-harness-tests/tsconfig.json;
  e2e-harness-tests/browser/fixtures/navigation.html;
  e2e-harness-tests/browser/fixtures/navigation.tsx;
  e2e-harness-tests/browser/secure/desktop-fix01-navigation.spec.ts.
- Evidence: docs/quality/s4-f07-b-reception-media-orchestration.md.

A single local child commit of the initial HEAD contains the fix and this evidence:
`fix(reception): guard pending media on navigation and session actions`.
The final commit SHA and clean git status are supplied in the handoff. No push,
PR or backend changes.

Remaining risks: browser/OS handling of full-document unload cannot guarantee
recovery after process termination; Files intentionally remain memory-only.
Provisioned remote Clerk/backend/R2/CORS and F07-C evidence remain outstanding.
Other engines beyond the local Chromium harness are not certified. The old
unavailable review findings remain open for recovery; FIX-01 closes only the
confirmed Recovery Review finding. No Sprint 4 PASS is declared.

S4-F07-B FIX-01: READY_FOR_RE_REVIEW


## Cierre documental y auditoría de aceptación F07-B — 2026-10-10

### Fuente, alcance y responsables

Auditoría documental: **Codex**, revisión independiente en esta conversación,
2026-10-10, America/Bogota. Se reutilizan las ejecuciones comprobadas del
re-review de FIX-01 del mismo día; no se vuelven a ejecutar suites por este
cambio exclusivamente documental.

Fuente canónica consultada directamente en Notion mediante la sesión existente
de Safari: [Quality Gates — Reglas y Pruebas por Sprint](https://app.notion.com/p/3df6ab0a330d818486e9dd6f06b5f573?pvs=204),
§1 (gate transversal), §2 (registro mínimo), §7 (Sprint 4), §21 (PASS/FAIL) y
§22 (secuencia de aprobación). La interfaz indicó «Última edición: 5 oct»;
no se infiere una hora de edición. El extracto local
[frontend-relevant-gates.md](frontend-relevant-gates.md), exportado el
2026-09-30, se conserva como snapshot histórico y no sustituye esa consulta.
No se modifica Notion ni se introduce un gate de sprint nuevo.

| Registro requerido | Evidencia / valor |
| --- | --- |
| Proyecto y rama | Frontend TallerMecario; `task/s4-f07-b-media-orchestration` |
| Base revisada | `c61e9eeec281bec667c2b246d022c2795b493275` |
| Implementación original | `d3ecbf25ffecd7f46a9aeb35d31ae5b890b8096f` |
| Corrección FIX-01 | `2b58d5a02cba6b89da5ff103cf83f1a9b395aa1d` |
| Fecha de corrección en Git | `2026-10-10T11:04:25-05:00`; autor Git: Ivan Patiño; mensaje `fix(reception): guard pending media on navigation and session actions` |
| Responsable de verificación | Codex; Recovery Review, re-review independiente FIX-01 y esta auditoría documental. El autor Git no se presenta como agente implementador ni aprobador del gate |
| Ambiente de verificación | Local macOS/Darwin 27; Node v22.23.3, npm 10.9.9; dependencias del lockfile; jsdom/Vitest y Chromium/Playwright |
| Servicios usados por pruebas | HTTP, storage y puerto Clerk sintéticos; ningún Clerk/backend/PostgreSQL/R2 remoto certificado |
| Diferencia de entorno | Gates que requieren cachés/dist o servidores en loopback se ejecutaron con el procedimiento autorizado fuera de la restricción sandbox; reportes de navegador en directorio temporal del sistema |
| Defecto confirmado | MEDIUM: salidas por historial, navegación programática y acciones voluntarias del shell podían descartar evidencia local sin confirmación |
| Resultado del re-review | `S4-F07-B FIX-01 RE-REVIEW: NO FINDINGS`; cero defectos accionables demostrados abiertos en el alcance revisado |
| Decisión de esta auditoría | `READY_FOR_PR` para la revisión/integración incremental de F07-B; no declara Quality Gate de Sprint 4 `PASSED`, despliegue ni release |

Los apartados anteriores son registros históricos: `READY_FOR_REVIEW`,
`S4-F07-B FIXES: BLOCKED` y `READY_FOR_RE_REVIEW` describen sus momentos y
alcances originales. Se conservan íntegros. Esta sección añade la decisión
actual para F07-B después del re-review; no convierte los findings históricos
sin descripción en defectos corregidos ni altera los resultados anteriores.

### Registro de evidencia independiente

- **E01 — Implementación y revisión:** diff original → FIX-01, 16 archivos,
  +679/-39; interacción base → HEAD, 24 archivos, +1472/-183. Revisados
  `App.tsx`, `AppShell`, `NewReceptionPage` y todo `voluntary-exit.tsx`, junto
  con AuthenticatedRoot, AuthProvider, ReceptionProvider y rutas recepción/CRM.
  HEAD y rama exactos, árbol limpio al iniciar/finalizar el re-review y
  `git diff c61e9eeec281bec667c2b246d022c2795b493275..HEAD --check` PASS.
- **E02 — Orquestación productiva con transportes sintéticos:**
  [reception-media-orchestration.test.tsx](../../src/features/reception/reception-media-orchestration.test.tsx),
  bloques `F07-B production post-create orchestration`, `FIX-01 real router
  and shell regressions` y `F07-B deterministic selection keys and bounded
  explicit dispatch`; ejecutados dentro de recepción 506/506 y suite 1271/1271.
- **E03 — Regresión de media/seguridad:**
  [reception-media.test.tsx](../../src/features/reception/reception-media.test.tsx)
  y suite shared/media 332/332: elegibilidad, Files originales, ausencia de
  persistencia, aislamiento de tareas, revocación y resultados tardíos.
- **E04 — Router/App:**
  [App.test.tsx](../../src/app/App.test.tsx),
  [public-routes.test.tsx](../../src/app/public-routes.test.tsx) y pruebas de
  dashboard/CRM incluidas en 1271/1271. Suplemento independiente: 18 casos
  temporales de `app-integration.test.tsx` montan `App → AuthProvider →
  AuthenticatedRoot → AppRoutes → ReceptionProvider`; solo Clerk y transportes
  externos son sintéticos. Incluyen Back y acciones reales de autenticación
  con File local/PUT/asociación, invalidación externa, render ordinario,
  Strict Mode autenticado y deep links CRM con un nuevo montaje.
- **E05 — Coordinador:** siete diagnósticos temporales de
  `coordinator.test.tsx` sobre rutas/componentes productivos: clics repetidos,
  acciones competidoras, navegación y shell pendientes en ambos órdenes,
  intentos batched, múltiples destinos, rechazo seguido de otra acción y
  unmount/listeners. Junto con E04: **25/25, dos archivos**.
- **E06 — Chromium local real, fixture sintético:**
  [desktop-fix01-navigation.spec.ts](../../e2e-harness-tests/browser/secure/desktop-fix01-navigation.spec.ts),
  **22/22**, sin skipped, unexpected ni flaky. El JSON existente registra
  inicio `2026-10-10T16:13:11.096Z` y duración 15413.585 ms. Navegación de
  browser real; fixture monta AppRoutes/AppShell/Nueva recepción/proveedor y
  coordinador, sin montar la composición completa de App ni contactar servicios
  remotos. E04 aporta la comprobación adicional de esa composición en jsdom.
- **E07 — Gates:** comandos y resultados independientes en la tabla siguiente,
  ejecutados por Codex durante el re-review del HEAD corregido.

Los suplementos E04/E05 y el JSON E06 siguen disponibles localmente en
`/private/tmp/s4-f07-b-fix01-review.XtaFyw/`; son artefactos temporales,
no fixtures versionados ni evidencia de un ambiente remoto. Las pruebas
versionadas E02/E03/E04 y el spec E06, vinculados al SHA, son las regresiones
reproducibles del repositorio. No se depende del directorio temporal para
ejecutar los gates del proyecto. SHA-256 del JSON de Chromium:
`8a3fe5ab458239c45180865dae15dc2786f001518f25b726dffaa6bda2e52e7d`.

Antes/después verificado de forma independiente: los tres casos `App regression:
local File survives rejected Back / Cambiar taller / Cerrar sesión` fallaron
contra una exportación temporal del código de `d3ecbf2` por ausencia del diálogo,
y pasaron contra `2b58d5a`. El filtro baseline seleccionó tres casos; los doce
restantes de ese diagnóstico inicial quedaron deselectados, no omitidos en un
gate obligatorio. La ejecución final E04/E05 fue 25/25. Una primera expectativa
temporal de revocación contabilizaba también el montaje de prueba de Strict Mode;
se ajustó el contador del diagnóstico, sin modificar producción ni tests del repo.

| Comando ejecutado en el re-review | Resultado independiente |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS; cero warnings |
| `npm test -- src/features/reception` | PASS 506/506; 10 archivos |
| `npm test -- src/shared/media` | PASS 332/332; 10 archivos |
| `npm test` | PASS 1271/1271; 47 archivos; incluye los 88 casos unitarios añadidos por FIX-01 |
| `npm run test:e2e:harness` | PASS 191/191; 11 archivos; harness local sintético, incluidos los nuevos casos Chromium y sus controles negativos esperados |
| `npm run build` | PASS; aviso de chunk >500 kB preexistente, principal actual 640.02 kB |
| `git diff c61e9eeec281bec667c2b246d022c2795b493275..HEAD --check` | PASS |
| `git status --short` | Limpio al terminar el re-review; esta auditoría añade únicamente el suplemento documental |

Comando Chromium ejecutado, desde el worktree revisado:

```sh
HARNESS_OUT_DIR=/private/tmp/s4-f07-b-fix01-review.XtaFyw/chromium HARNESS_SUITE=secure ./node_modules/.bin/playwright test --config e2e-harness-tests/browser/playwright.harness.config.ts --project=harness-desktop e2e-harness-tests/browser/secure/desktop-fix01-navigation.spec.ts
```

El resultado enfocado 118/118 del apartado FIX-01 pertenece a la ejecución
reportada por la implementación. El re-review independiente verificó esos casos
dentro de las suites completas; no se presenta una nueva ejecución enfocada.

### Matriz criterio → prueba → resultado → evidencia → estado

`VERIFICADO F07-B` significa cumplimiento del criterio frontend de esta tarea
con pruebas ejecutadas y revisión independiente. No equivale a aprobar el gate
global del sprint. `PENDIENTE F07-C` conserva una obligación de integración real;
no es PASS ni una exención del documento canónico.

| Criterio de aceptación verificable | Prueba / comprobación | Resultado observado | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| Crear una sola recepción: submits simultáneos o posteriores al éxito no repiten POST; no hay media antes de receptionId confirmado | `locks form...forced resubmit cannot create again`; `photo stays the original File across delayed create`; rutas no-media y descarte explícito | Un POST de creación tras éxito; cero sesión/PUT/complete/attach antes de creación; fallos de media no recrean recepción | E01/E02; latch de creación en NewReceptionPage; regresión adicional de submits atómicos del Recovery Review | VERIFICADO F07-B |
| Conservar el File original y sus datos hasta asociación, con photo/video360, File.type y File.size reales | `photo stays the original File...`; `maps the original walk-around File...`; pruebas F05 de selección | Identidad del mismo File conservada; mapping y tamaño exactos; sin capturedAt derivado de lastModified ni object URL en el DTO | E02/E03 | VERIFICADO F07-B |
| UUID de idempotencia y sortOrder pertenecen a cada selección y sobreviven al reinicio seguro; máximo dos uploads explícitos | `stable distinct UUIDs and sort orders survive safe restart...max two uploads` | UUID/order estables; selección nueva obtiene identidad nueva; no batch/cola automática; techo dos | E02/E03; garantías de idempotencia frontend, sin certificar deduplicación DB/backend | VERIFICADO F07-B |
| Usar el PUT firmado emitido y los adaptadores aprobados, sin bearer token al storage ni campos server-owned inventados | F07-A/F01 y orquestación con ejecutor productivo | Target/headers emitidos; credentials omit; mapping aprobado y request allowlists; transporte probado con storage sintético | E01/E02/E03; F07-A/B04 Phase B referenciado arriba | VERIFICADO F07-B; R2 real pendiente |
| No afirmar evidencia guardada ni liberar el File con PUT 2xx o active solamente; exigir asociación canónica | Active/attach diferidos; identidad/orden de respuesta inválidos; completion no-active/malformado | Guardado/release solo después de attach confirmado; estados ambiguos conservan evidencia y no producen falso éxito | E02/E03 | VERIFICADO F07-B |
| Recuperar mediante reintento explícito de asociación sin sesión, PUT, complete ni creación adicionales | `association network/server/identity...explicit retry`; controles de doble clic y Retry-After | Repite mismo receptionId/mediaAssetId/sortOrder; no re-upload ni retry automático; Retry-After impide ejecución anticipada | E02; Recovery Review de Retry-After; E07 | VERIFICADO F07-B |
| Fallo/interrupción de PUT o completion no destruye recepción; éxito parcial y abandono son decisiones explícitas | PUT 403/412/network; completion ambiguo; `partial success...deliberate action`; descarte | Recepción creada conserva su éxito; archivos pendientes visibles; sin reinicio ciego ni borrado de recepción; abandono libera recursos | E02/E03 | VERIFICADO F07-B; caída R2 real pendiente |
| Corrección mínima del MEDIUM: proteger POP, push/replace y navegación programática, además de enlaces y beforeunload | Matriz ocho estados × cuatro transiciones × aceptación/rechazo; Chromium Back/Forward/programmatic y reload rechazado | Rechazar conserva File/preview/operación y ruta; aceptar sale una vez, aborta/limpia y no repite mutaciones | E01: Data Router/useBlocker/guard; E02/E06; baseline independiente FAIL → PASS; re-review NO FINDINGS | VERIFICADO F07-B; MEDIUM confirmado cerrado |
| Corrección mínima del MEDIUM: Cambiar taller y Cerrar sesión deben confirmar antes de ejecutar la acción voluntaria | Shell local/PUT/attach; 12 casos acceptance/rejection; composición completa App; dos casos Chromium durante PUT | Rechazo no ejecuta callback ni cambia contexto; aceptación limpia primero y ejecuta una vez; sin doble confirmación | E01: AppShell/coordinador; E02/E04/E06; baseline FAIL → PASS; re-review NO FINDINGS | VERIFICADO F07-B; MEDIUM confirmado cerrado |
| Router/coordinador conservan ownership, estado y limpieza frente a renders, Strict Mode e intentos concurrentes | App listener disposal; public routes; Strict Mode; siete casos E05; App ordinario/deep links E04 | Router estable con configuración inicial de main.tsx; rutas/layouts conservados; landing sin Clerk; una salida resuelta; sin callback viejo tras rechazo/unmount | E01/E02/E04/E05; re-review NO FINDINGS | VERIFICADO F07-B |
| Invalidaciones forzadas de sesión/identidad/tenant/permisos limpian inmediatamente, incluso con diálogo; refresh equivalente conserva estado | Invalidation overrides open dialog; blocked history permission loss; equivalent refresh; App forced logout/identity | Requests abortados y previews liberados; callback voluntario no ejecutado; resultado tardío ignorado; File no accesible en nuevo contexto | E02/E03/E04/E06; ReceptionProvider y límites de tasks revisados | VERIFICADO F07-B; no certifica RLS/seguridad backend |
| Navegar libremente sin pendientes o después de asociar todo; conservar límites de privacidad y memoria local | No pending/all associated; F05 owner/consent/adult/permission; no persistence; signal abort | Sin bloqueo innecesario; elegibilidad preservada; sin nueva firma, IndexedDB, queue u offline replay | E02/E03; E01 | VERIFICADO F07-B |
| Evidencia mínima: SHA, fecha, ambiente, responsable, casos, resultado, defecto y decisión; fallo corregido seguido de nueva ejecución | Registro de esta sección y contraste de commits/tests/outputs del re-review | Datos explícitos; MEDIUM reproducido → fix → regresiones → re-review; gates verdes reutilizados, sin resultados inventados | E01–E07; esta sección; Notion §2 | COMPLETO DOCUMENTALMENTE |
| Findings históricos MEDIUM/LOW sin descripción no se pueden declarar corregidos | Comparación de notas históricas y decisiones actualizadas | No se recuperó descripción, ubicación, reproducción ni verdict originales; se conservan como limitación, sin asumir invalidez/cierre | Follow-up verification/FIX-01 y decisión actual | LIMITACIÓN; no bloquea PR de este alcance revisado |
| R2/CORS, URL de descarga, galería operacional y E2E remoto requieren evidencia propia | Contraste con Notion §7/§21/§22, informe F07 y exclusiones de F07-B | No ejecutados ni declarados PASS por Chromium/harness/jsdom; requisitos concretos pendientes abajo | Notion canónico; Remaining F07-C; E06/E07 delimitados | PENDIENTE F07-C; bloquea cierre global Sprint 4 |

### Pendientes, efecto sobre integración y decisión

No falta evidencia necesaria de implementación, prueba o re-review para los
criterios frontend de **F07-B** auditados. Faltaba registrar aquí el re-review
independiente, su SHA/fecha/ambiente/responsable, la matriz y la decisión actual;
este suplemento cierra únicamente esas omisiones documentales.

Pendientes explícitos de **F07-C**, que no bloquean preparar/revisar el PR
incremental de F07-B pero sí certificar el flujo operacional remoto y cerrar
el Quality Gate global de Sprint 4:

| Pendiente | Evidencia exacta que falta |
| --- | --- |
| R2/CORS desde browser productivo | Bucket privado y policy para origen frontend exacto; OPTIONS/PUT con headers firmados, subida de fotos/video válidos, expiración/412, interrupción/caída y origen negativo; evidencia sanitizada del entorno real |
| URL de descarga / playback autorizado | Integración frontend con contrato aprobado, actor/tenant/estado válidos, URL temporal, lectura real, expiración y denegaciones; evidencia remota de lifecycle/RBAC correspondiente |
| Galería operacional / consulta por recepción u orden | UX productiva y DTOs aprobados, lectura tras nueva visita/recarga, asociación visible, aislamiento y recuperación/reconciliación real; una lista de archivos confirmados en memoria no satisface este criterio |
| E2E remoto recepción + video + fotos | Entorno provisionado Clerk/backend/PostgreSQL/R2, targets/roles/tenants/fixtures válidos, ejecución browser de create → upload → complete → attach → consulta/download, casos negativos, cleanup y run/reporte sanitizado enlazado; CI/staging/smoke y decisión del gate según corresponda |

La retención, holds, purge/scan y garantías server-authoritative conservan sus
dependencias/evidencia propias del gate global; esta auditoría no las implementa,
revalida ni declara aprobadas. No se modifican backend ni contratos compartidos.

Los findings históricos sin descripción requieren recuperar su informe completo
antes de cualquier afirmación de cierre. No se consideran findings accionables
reproducidos de este re-review ni se usa su ausencia para afirmar que todos los
riesgos del sprint están resueltos. La decisión `READY_FOR_PR` tiene alcance
F07-B, y no equivale al estado canónico `PASSED` ni habilita release/siguiente
sprint. Los criterios remotos obligatorios siguen pendientes bajo §21/§22.

Entrega documental: únicamente este informe ampliado, preparado para revisión
y commit separado; HEAD de implementación permanece `2b58d5a`. Sin nuevas
funcionalidades, repetición de pruebas funcionales, commit, push ni PR.

S4-F07-B GATE AUDIT: READY_FOR_PR
