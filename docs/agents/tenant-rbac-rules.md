# Workshop Context, RBAC and Data Isolation

<trigger>
Load for workshop selection, permissions, routing guards, caches or draft isolation.
</trigger>

<rules>
- Workshop selection is a request for backend-validated context.
  Client IDs, route params, storage and Clerk metadata grant no authority.
- Use the approved context DTO and stable permission codes. Do not scatter
  role-name comparisons through components or assume a single role.
- Effective permissions reflect active local roles; frontend checks are UX.
- A means assigned resources; Q means explicit quality-control assignment
  and applicable separation rules. A permission code alone does not prove
  access to the selected resource. Do not accept assigned=true as authority.
- Technician DTOs intentionally omit general CRM PII and financial data.
  Do not substitute unrestricted endpoints for technical views.
- Permissions in the catalog do not prove that an endpoint is available.
- Partition approved caches/drafts/queues by identity and workshop.
- On context change, cancel or invalidate affected requests, reset remote
  caches and prevent late responses from populating the new context.
- A queued operation must never be relabeled to another tenant/account.
- Respect no-store. Read pwa-offline-rules.md for caching or persistence.
- Keep session/permission rejection visible and recoverable.
</rules>

<targeted_sources>
Search and read only the relevant sections of:
- docs/domain/roles-and-permissions.md; read the affected domain matrix and A/Q semantics
- docs/architecture/authentication-and-workshop.md
- docs/api/crm.md for technician vehicle DTOs
Follow a source link only when it resolves a dependency of the task.
</targeted_sources>
