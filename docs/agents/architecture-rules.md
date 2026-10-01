# Architecture and TypeScript

<trigger>
Load for structure, module boundaries, TypeScript types or dependencies.
</trigger>

<rules>
- Follow the approved frontend specification. Do not create speculative
  src/ architecture before approval.
- Organize features by domain; keep shared code reusable and free from
  feature-internal dependencies.
- Separate remote state, UI state and approved persisted drafts.
- Keep requests outside presentational components; avoid circular imports,
  unnecessary abstractions and import-time side effects.
- Keep strict TypeScript. Avoid unjustified any, unsafe assertions,
  suppressed diagnostics and types inferred from SQL rows.
- Routing, styling, state, forms and testing libraries follow the approved
  specification. A recommendation is not dependency approval.
- Reuse pinned versions and lockfile conventions. Verify new compatibility
  or security-sensitive version decisions; do not select from memory.
- Do not use force/legacy-peer-deps to hide an unresolved installation issue.
- Implement the assigned scope, not every module in the product roadmap.
</rules>

<targeted_sources>
Search and read only the relevant sections of:
- docs/architecture/frontend-boundary.md
- docs/product/mvp-and-sprint-scope.md
- Approved task specification and existing package/config files
Follow a source link only when it resolves a dependency of the task.
</targeted_sources>
