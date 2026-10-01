# Authentication and Invitations

<trigger>
Load for Clerk, login, session lifecycle, onboarding or invitation acceptance.
</trigger>

<rules>
- Clerk establishes verified identity; TallerMecario backend establishes
  memberships and permissions. Do not trust org_role, org_permissions
  or provider metadata as local business authority.
- Use supported Clerk APIs through the approved integration. Do not store
  bearer tokens in localStorage, IndexedDB or drafts as custom auth.
- Login without an active membership follows the approved access/onboarding
  state; never fabricate implicit workshop access.
- Obtain the actual bootstrap/context contract; do not invent its endpoint.
- Invitation acceptance reads the token from the URL fragment, removes it
  with history.replaceState, then posts it in the documented request body.
  Do not log it or place it in query/path parameters.
- Token redemption uses verified primary email and the backend invitation
  contract. The frontend does not choose tenant or granted role.
- Read tenant-rbac-rules.md for session/workshop switching and data reset.
- If logout can affect pending drafts/operations, also read
  pwa-offline-rules.md. Do not expose another identity's pending data.
</rules>

<targeted_sources>
Search and read only the relevant sections of:
- docs/architecture/authentication-and-workshop.md
- docs/api/membership-invitations.md when implementing invitations
- docs/decisions/ADR-006-identity.md for identity decisions
Follow a source link only when it resolves a dependency of the task.
</targeted_sources>
