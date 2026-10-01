# UI, Forms and Accessibility

<trigger>
Load for components, forms, responsive layouts, styles or user-facing states.
</trigger>

<rules>
- Use approved tokens/components; avoid repeated arbitrary colors,
  spacing and typography. Do not invent a final design system.
- Support workshop use on mobile, tablet and desktop.
- Use semantic HTML, accessible names/labels, visible keyboard focus,
  keyboard-operable controls and appropriate dialog focus behavior.
  Status must not rely only on color.
- Render untrusted text safely. Raw HTML needs an explicit requirement
  and a suitable sanitization implementation.
- Provide applicable loading, empty, validation, offline/network, session,
  forbidden/not-found, server-error and conflict/recovery states.
- Preserve entered form data through recoverable failures.
- Keep product language/copy consistent with approved designs.
- Read api-rules.md for submissions and errors, tenant-rbac-rules.md for
  permission/context-dependent UI, and reception-privacy-rules.md for
  reception or consent forms.
- Use synthetic data in fixtures/screenshots; minimize displayed PII.
- Do not weaken security configuration to make a screen appear functional.
</rules>

<targeted_sources>
Search and read only the relevant sections of:
- Approved UI specification, design tokens and existing components
- docs/product/product-overview.md: only the affected module
- Relevant HTTP contract and feature-specific rules
Follow a source link only when it resolves a dependency of the task.
</targeted_sources>
