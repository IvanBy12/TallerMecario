# Reception, Consent and Signature Rules

<trigger>
Load for reception, privacy forms, consent evidence or signature capture.
</trigger>

<rules>
- Read the current Track A HTTP contract before integration. Database
  schemas and narrative examples do not establish request fields/paths.
- Enforce the approved UX order: show privacy notice, obtain required
  service_provision authorization and explicit adult attestation before
  allowing reception photo/video/signature capture.
- Optional purposes are separate, not preselected, and not required for
  reception: marketing, image_use, appointment reminders and WhatsApp
  notifications. The backend revalidates consent.
- Current MVP: the current primary owner delivers the vehicle and grants
  consent. Third-party delivery, representation and minors need a future
  approved contract; do not enable them by assumption.
- Consent hashes/controller snapshots are server-owned. Do not submit
  client-computed values as authoritative evidence.
- For approved offline reception, preserve the original server-issued
  privacy_notice_bundle, display exact content and resend its envelope.
  Do not invent expiration/grace rules or expose the signing secret.
- Consent revocation/owner changes may invalidate a new reception;
  preserve form data and handle the actual backend error.
- Reception and delivery are distinct signature acts requiring distinct
  media. Do not reuse an already signed asset.
- Read media-rules.md for capture/uploads, api-rules.md for integration,
  and pwa-offline-rules.md if drafts or offline behavior are involved.
</rules>

<targeted_sources>
Search and read only the relevant sections of:
- docs/privacy/privacy-product-requirements.md
- docs/domain/data-dictionary/05-privacy-and-offline.md: RECEPTION-CONSENT-01 and D-PRIV-01–05
- docs/domain/data-dictionary/02-agenda-and-reception.md for reception/signature fields
- docs/api/reception-and-media-contract-status.md
Follow a source link only when it resolves a dependency of the task.
</targeted_sources>
