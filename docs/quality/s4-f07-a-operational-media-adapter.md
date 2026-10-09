# S4-F07-A — Operational reception media adapter

2026-10-09, America/Bogota. Frontend base `7f10016bd4ef5ca6448740a5c4c65c3cccb6b4e8`;
branch `task/s4-f07-media-adapter`. This verifies the adapter foundation only;
**it does not declare Sprint 4 PASS or enable production reception media**.

Authority: the approved S4-F07-A ticket and backend
[`56c6e056934d271ada3c7ace667cdd2dbe809da3`](https://github.com/IvanBy12/TallerMecarioB/commit/56c6e056934d271ada3c7ace667cdd2dbe809da3),
inspected read-only. Published contracts:
[B04 Phase B, Attach and list API / Invariants and replay](https://github.com/IvanBy12/TallerMecarioB/blob/56c6e056934d271ada3c7ace667cdd2dbe809da3/docs/S4-B04-media-associations.md),
[B01 §9, Download](https://github.com/IvanBy12/TallerMecarioB/blob/56c6e056934d271ada3c7ace667cdd2dbe809da3/docs/S4-B01-media-contract.md),
and [media routes](https://github.com/IvanBy12/TallerMecarioB/blob/56c6e056934d271ada3c7ace667cdd2dbe809da3/src/media/routes.ts).
No backend code, gates, PostgreSQL, R2, deployment or remote E2E were executed/modified.

## Contract and integration

`createReceptionOperationalMediaExecutor({ client, tenantId, signal })` implements
`UploadExecutor<ReceptionOperationalMediaInput>` using the unchanged generic
`createMediaClient`. The verified runtime supplies tenant context and cancellation;
frontend resource IDs never grant authority.

- Create: `POST /api/v1/media/upload-sessions`, explicit body containing mediaType
  (`photo|video|video360`), mimeType, retentionClass `operational`, idempotencyKey,
  positive safe-integer expectedSizeBytes, optional capturedAt, and
  operationalContext `{ type: 'reception', receptionId }`. The adapter preserves
  RFC3339 capturedAt precision/offset; the backend owns normalization/equivalence.
- PUT: unchanged signed storage transport, exact issued headers, credentials omit,
  redirect error, no bearer or tenant header. No API proxy or PUT replay.
- Complete: `POST /api/v1/media/upload-sessions/:uploadSessionId/complete`, `{}`.
  The generic parser requires active and the original asset identity; PUT success
  alone never confirms upload. Completion success never implies association.
- `createReceptionOperationalMediaApi(client, tenantId, signal)` exposes explicit
  attach, list and download operations. Attach POSTs to
  `/api/v1/receptions/:receptionId/media` with mediaAssetId and optional sortOrder
  (integer 0…2147483647). The response must match that asset and effective sort.
  Purpose is backend-owned `intake_evidence` and never sent.
- List GETs the same reception media path without query/pagination. The parser
  preserves backend sortOrder/mediaAssetId/purpose ordering without sorting.
- Download GETs `/api/v1/media/:mediaAssetId/download-url`, checking exact identity,
  an absolute HTTPS URL without credentials, fragments, whitespace or backslashes,
  and valid RFC3339 expiresAt. Only mediaAssetId/downloadUrl/expiresAt are retained;
  the signed capability is transient, never persisted, logged or copied into errors.

DTO/envelope parsers require all published fields, reject unknown types/purposes,
invalid canonical IDs, unsafe numbers, malformed MIME syntax and invalid calendar
instants, and discard internal fields. MediaDto timestamps use the published UTC
microsecond shape. Explicit null sizeBytes/capturedAt/uploadedAt are supported as
published by Phase B; missing fields still fail.

API errors preserve existing classifyFailure/ApiResult and requestId conventions;
backend message text never becomes UI copy. Read operations follow the existing
cached-token → one fresh-token GET on 401 pattern. No POST is automatically retried.
Runtime and per-operation abort signals combine; late canceled results are rejected.
F04 ambiguous completion continues to forbid blind task restart.

## DOC_CONFLICT reconciliation

`docs/api/reception-and-media-contract-status.md` (PENDIENTE) and
`docs/quality/s4-f07-media-final-readiness.md` (D6/D8/D10, BE1/DOC1) describe older
snapshots without Phase B attach/list/purpose. Backend 56c6e05 B04 Phase B and
routes publish these contracts now. Resolution: retain those historical sources,
pin this adapter to the approved ticket/current published contract. Frontend
impact: adapter/read operations can be implemented; production remains unavailable
until F07-B solves the parent/File lifecycle. Backend impact: no change requested.
Remaining overall Sprint 4 gates are not certified by this adapter work.

## Verification

Node v22.23.3, npm 10.9.9, existing pinned dependencies; no packages added.

| Gate | Result |
| --- | --- |
| Focused adapter/parser tests | PASS 153/153, 2 files |
| npm run typecheck | PASS |
| npm run lint | PASS, zero warnings |
| npm test -- src/shared/media | PASS 329/329, 10 files |
| npm test -- src/features/reception | PASS 391/391, 9 files |
| npm test | PASS 1151/1151, 46 files |
| npm run test:e2e:harness | PASS 191/191, 11 files; synthetic local only |
| npm run build | PASS; existing >500 kB chunk warning |

The first focused run exposed two test expectations for getToken(undefined),
corrected to match ApiClient; the first lint exposed test-style violations, fixed.
Final focused and required gates above passed. Security tests assert explicit
request allowlists despite extra runtime properties, no protected fields/signed
URL/key in API bodies or returned failures, and no Authorization to storage.
Git whitespace/staged checks and final clean status are verified at delivery.

Production AppRoutes/NewReceptionPage and generic shared media are unchanged.
F07-B owns create reception once, retaining original Files in memory after confirmed
receptionId, File.size mapping, upload then explicit attach, truthful partial-success
UX, existing bounded concurrency/cancellation and navigation. It must keep uploaded,
attached and readable states distinct. No offline persistence/queue/replay is added.
