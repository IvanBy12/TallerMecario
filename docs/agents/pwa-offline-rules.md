# PWA, Local Storage and Synchronization

<trigger>
Load for service workers, Cache Storage, IndexedDB, drafts or offline queues.
</trigger>

<rules>
- ADR-005 is accepted; implement only the task's approved scope.
  Foundation does not imply full synchronization or a passed offline gate.
- Cache Storage holds approved app-shell resources. IndexedDB holds
  approved structured drafts/queue data; use the approved local media
  abstraction for blobs. Neither becomes a business source of truth.
- Do not cache authenticated business responses against no-store or without
  an approved policy. Avoid stale authenticated API fallbacks.
- Do not complete quote authorization, payments, security/ownership changes
  or other sensitive server-authoritative actions offline.
- Do not queue unsupported calls or invent a sync endpoint/protocol.
- Preserve operation identity across retries. Backend revalidates auth,
  permissions, tenant and domain guards upon sync.
- Show pending/syncing/applied/conflict/error; no silent last-write-wins.
- Background Sync is optional; foreground reopening/focus/reconnection
  must provide the approved recovery path.
- Check quota/persistence where applicable. Quota failure cannot silently
  delete pending drafts. Do not promise a large offline video was saved
  when storage failed.
- Logout with pending operations needs explicit safe UX, and pending data
  must not become accessible to another identity. No provider credentials,
  signing keys, OTPs or bearer tokens belong in drafts.
- Read tenant-rbac-rules.md for account/workshop isolation. For reception
  bundles also read reception-privacy-rules.md; for blobs, media-rules.md.
- CRM expectedUpdatedAt is not an integer base_version; resolve the
  documented sync-version gap before integration.
</rules>

<targeted_sources>
Search and read only the relevant sections of:
- docs/architecture/pwa-offline.md
- docs/decisions/ADR-005-pwa-offline.md
- docs/OPEN-QUESTIONS.md: CRM idempotency, sync version and sprint scope
- docs/quality/frontend-relevant-gates.md: relevant offline criteria
Follow a source link only when it resolves a dependency of the task.
</targeted_sources>
