# Media Capture, Uploads and Downloads

<trigger>
Load for files, camera capture, R2 uploads, downloads, signatures or media links.
</trigger>

<rules>
- Binary files upload browser → R2 using backend-issued signed URLs.
  Do not proxy vehicle video through the Node API.
- Use the approved session → upload → complete → association sequence.
  Obtain exact paths, DTOs, PUT headers, limits and errors from Track A;
  diagram paths are not finalized HTTP contracts.
- Apply approved MIME/size/duration checks for UX; server validation
  remains authoritative. Never invent limits.
- Do not send Clerk bearer tokens to R2 or arbitrary storage URLs.
- Show progress, interruption, cancellation, retry and confirmed completion.
  Retry only within the session/endpoint's documented safety guarantees.
- Do not log signed URLs or use them as permanent media identifiers.
- Respect asset lifecycle and download authorization. Quarantined/inactive
  media cannot be exposed through normal access by frontend workarounds.
- Quarantine preserves historical signature evidence; do not replace,
  rewrite or delete the existing signing act.
- For reception/signatures, first read reception-privacy-rules.md.
- For local blobs, storage quota or queued uploads, also read
  pwa-offline-rules.md; never claim unpersisted media was saved.
</rules>

<targeted_sources>
Search and read only the relevant sections of:
- docs/architecture/media.md
- docs/decisions/ADR-003-media.md
- docs/api/reception-and-media-contract-status.md
- docs/domain/data-dictionary/04-media-and-billing.md: media_assets, upload_sessions and links
Follow a source link only when it resolves a dependency of the task.
</targeted_sources>
