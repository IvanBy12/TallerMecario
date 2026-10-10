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
