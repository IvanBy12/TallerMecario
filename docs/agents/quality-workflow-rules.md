# Agent Roles, Verification and Handoffs

<trigger>
Load for implementation, code review, validation or architecture handoffs.
</trigger>

<rules>
- Follow the assigned task role. Defaults: Claude specifies architecture;
  DeepSeek implements the approved specification; Codex reviews/verifies.
  This does not authorize delegation or cross-worktree edits.
- Handoffs name scope, exclusions, source sections, contracts/dependencies,
  expected changes, acceptance criteria and validation commands.
- Before completion, inspect package.json and autonomously run applicable
  existing typecheck, lint, relevant tests and production build.
  Do not assume build includes typechecking or invent missing scripts.
- Use meaningful behavioral/regression checks. Documentation-only changes
  do not require unrelated application tests.
- Review actual code and evidence: contracts, auth/context, resource scopes,
  cache/draft isolation, conflicts/retries, accessible responsive UX and
  absence of secrets/PII exposure.
- Do not claim backend RLS/constraints passed without executing the actual
  relevant backend checks.
- Local build does not prove remote CI, staging, PWA installation,
  media integration or end-to-end success.
- Report changes, checks/results, unexecuted checks with reasons, and
  remaining dependencies. Findings include evidence and severity.
- Reviewers change code only when the active task authorizes fixes.
- Continue authorized independent work when a contract is blocked; do not
  declare the blocked integration complete.
</rules>

<targeted_sources>
Search and read only the relevant sections of:
- Existing package.json scripts, test/config files and CI workflow
- Approved task specification and acceptance criteria
- docs/quality/frontend-relevant-gates.md: affected feature only
Follow a source link only when it resolves a dependency of the task.
</targeted_sources>
