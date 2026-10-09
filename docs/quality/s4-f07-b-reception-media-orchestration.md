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
