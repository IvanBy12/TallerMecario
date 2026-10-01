# TallerMecario Frontend — Core Agent Instructions

<tech_stack>
Frontend repository: TallerMecario. Backend: TallerMecarioB.
React, strict TypeScript, Vite, PWA, Clerk identity, IndexedDB.
Use the repository's pinned Node.js version (initial baseline: Node 22).
Other libraries require the approved task specification.
</tech_stack>

<frontend_backend_boundary>
Build staff-facing mobile/tablet/desktop UX within the approved task.
Frontend validation and guards improve UX.
The backend owns authorization, tenant isolation, business transitions,
consent enforcement, payments, integrity, concurrency and idempotency.
Consume approved HTTP DTOs; database columns are not API contracts.
</frontend_backend_boundary>

<context_loading>
Before starting, use tools to locate and read only the rules and
documentation explicitly required for the component being changed.
Inspect the affected code and applicable AGENTS.md files.
Search with rg --files and rg when available; read matching sections,
not entire document collections. Read referenced prerequisites when needed.
Missing context must be resolved, not replaced with assumptions.

Read each matching module below BEFORE dependent implementation or review.
Combine modules for tasks spanning multiple concerns. Do not load all modules.

| Task involves | Required module |
| --- | --- |
| Structure, TypeScript or dependencies | docs/agents/architecture-rules.md |
| HTTP requests, DTOs, errors or retries | docs/agents/api-rules.md |
| Login, sessions, onboarding or invitations | docs/agents/authentication-rules.md |
| Workshop context, permissions, guards or local data isolation | docs/agents/tenant-rbac-rules.md |
| Reception, consent, signatures or privacy | docs/agents/reception-privacy-rules.md |
| File capture, upload, download or asset association | docs/agents/media-rules.md |
| Service worker, caching, IndexedDB or synchronization | docs/agents/pwa-offline-rules.md |
| Components, forms, layout or accessibility | docs/agents/ui-rules.md |
| Implementation, review, verification or agent handoff | docs/agents/quality-workflow-rules.md |
| Branches, worktrees, commits, integration or temporary artifacts | docs/agents/git-worktree-rules.md |

Modules specify further references; search docs/OPEN-QUESTIONS.md for the
affected topic. Do not assume a documented feature is implemented.
If a required module is missing, report it and pause dependent work.
</context_loading>

<doc_conflict_protocol>
Explicit user instructions govern scope. Shared approved product/domain
decisions govern business requirements; specific approved HTTP contracts
govern requests. docs/ contains reference snapshots from Notion.
Do not silently edit shared contracts to justify code.
Report DOC_CONFLICT: source/section, current contract, conflicting evidence,
proposed resolution, frontend impact and backend impact.
Pause dependent work only; continue independent authorized work.
Use Notion read access if available and necessary. Ask for the specific
missing source only when it cannot be obtained. Never invent requirements.
</doc_conflict_protocol>

<forbidden_actions>
Never expose secrets or unnecessary PII in bundles, storage or logs.
Never use Clerk metadata or client fields as tenant/permission authority.
Never access PostgreSQL directly or copy backend implementation here.
Never invent endpoints, DTOs, business rules or security bypasses.
Never retry unsupported mutations or silently overwrite conflicts.
Never complete sensitive server-authoritative actions offline.
Never create worktrees or temporary audit copies inside the repository.
Never overwrite unrelated user work or claim unexecuted checks passed.
Follow the assigned agent role; delegation requires explicit authorization.
</forbidden_actions>
