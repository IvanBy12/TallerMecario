# HTTP Contracts, Errors and Concurrency

<trigger>
Load for API clients, endpoint integration, DTOs, validation, errors or retries.
</trigger>

<rules>
- Use the approved shared client and feature service boundaries.
  Do not scatter fetch calls or hardcoded URLs through components.
- Establish exact method/path, request/response, auth/context mechanism,
  resource scope, errors, concurrency and retry behavior before integration.
- Do not invent /me, /session, tenant headers or permission payloads.
- Match the endpoint's field names, null semantics and strict body schema;
  role_code remains a documented historical exception.
- Preserve stable error codes and request_id. Handle session, permission,
  not-found, validation, conflict, rate-limit, timeout/network and server
  failures without exposing SQL details or stack traces.
- expectedUpdatedAt is the exact opaque string emitted by the backend.
  Never round-trip it through Date or truncate/reformat microseconds.
- Preserve user input after conflicts; no silent overwrite.
- Retry mutations only when the approved contract makes it safe. Reuse
  the same supported idempotency key for the same operation.
- CRM Sprint 2 has no universal Idempotency-Key or client-generated IDs.
  Ambiguous POST customer retries may duplicate records.
- Respect documented no-store responses; read pwa-offline-rules.md if
  adding any cache or offline behavior.
</rules>

<targeted_sources>
Search and read only the relevant sections of:
- docs/api/conventions-and-errors.md
- docs/api/crm.md for customer/vehicle/ownership work
- docs/api/membership-invitations.md and docs/api/memberships.md when applicable
- docs/api/reception-and-media-contract-status.md for reception/media dependencies
Follow a source link only when it resolves a dependency of the task.
</targeted_sources>
