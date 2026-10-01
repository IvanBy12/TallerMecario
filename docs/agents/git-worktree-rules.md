# Git, Worktrees and Temporary Artifacts

<trigger>
Load before branch/worktree/commit/integration operations or creating audit artifacts.
</trigger>

<rules>
- Repository root:
  C:\Users\leopa\OneDrive\Documentos\Proyectos\TallerMecario
- Frontend worktree parent:
  C:\Users\leopa\.tallermecario-frontend-worktrees
- Disposable frontend audit parent:
  C:\Users\leopa\.tallermecario-frontend-audits
  The OS temporary directory is also allowed for disposable artifacts.
- Each worktree/audit uses a task-specific child directory.
- Keep project source and canonical artifacts in the repository.
  Never nest worktrees, audit checkouts, mutation copies or temporary agent
  directories inside its root.
- Before creating a worktree, inspect git status and git worktree list;
  reuse an appropriate existing clean frontend worktree when possible.
- Frontend worktrees belong to TallerMecario, never TallerMecarioB.
- Follow the approved branch/integration policy. Do not create every
  future sprint worktree or permanent repository copy in advance.
- Preserve unrelated/uncommitted work. Avoid destructive reset/clean
  operations without explicit authorization.
- After integration, remove disposable worktrees with git worktree remove,
  run git worktree prune and remove disposable audit artifacts.
  Never remove a worktree with uncommitted work.
- Push/merge/integration actions follow the user's authorized task scope.
</rules>

<targeted_sources>
Search and read only the relevant sections of:
- Current repository status, remotes, branches and worktree list
- Approved task branch/integration instructions
Follow a source link only when it resolves a dependency of the task.
</targeted_sources>
