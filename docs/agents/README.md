# Modular Agent Instructions

This package replaces the long frontend AGENTS.md with a core prompt and
ten task-specific rule modules. Install AGENTS.md at the repository root
and merge docs/agents/ into the existing docs/ tree.

## Loading

All agents receive the core. If the runner does not automatically load
AGENTS.md, explicitly provide its content as the base prompt and give the
agent read access to the repository.

Referenced files are not automatically injected by Markdown/XML links.
The agent must use its tools to read the triggered modules before doing
dependent work. Without read tools, provide the relevant module text in
the task prompt.

Modules are project instructions, not installed Skills or a vector RAG
system. XML tags organize instructions; they do not implement retrieval.

## Examples

- Static button styles: ui-rules + quality-workflow; read tokens/component.
- Vehicle PATCH form: ui + api + tenant-rbac + quality-workflow; search
  CRM DTO, expectedUpdatedAt and related errors.
- Reception video upload: media + reception-privacy + api + tenant-rbac
  + quality-workflow. Add pwa-offline if storing blobs/queueing offline.
- Service-worker cache change: pwa-offline + tenant-rbac + quality-workflow.
- Create a worktree: git-worktree; inspect status and existing worktrees.
- Architecture specification: architecture + quality-workflow and only
  domain modules needed for its stated scope.

## Verification and maintenance

The core is the always-loaded safety boundary. Modules add detail without
weakening it or creating new business contracts.
If a task reveals another concern, load its module before changing that area.

This refactor preserves the prior frontend instructions; it does not
start architecture, change shared product contracts or add dependencies.
Existing docs/, backend sources and source manifests remain separate.

No fixed percentage of token savings is asserted. Savings depend on
module selection, relevant source sizes and the runner's prompt handling.

For deterministic loading later, a wrapper may map task tags to these
files; that automation requires a separate implementation task.
