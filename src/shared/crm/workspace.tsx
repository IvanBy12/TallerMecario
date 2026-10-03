import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import type { ApiClient } from '@/shared/api/http-client';
import { normalizePermissions, type EffectivePermissions } from '@/shared/auth/effective-permissions';

export interface WorkspaceRuntime {
  readonly apiClient: ApiClient;
  readonly identity: string;
  readonly tenantId: string;
  readonly permissions: EffectivePermissions;
}
interface Workspace extends WorkspaceRuntime { readonly signal: AbortSignal }
const Context = createContext<Workspace | null>(null);

export function CrmProvider({ runtime, children }: {
  readonly runtime: WorkspaceRuntime;
  readonly children: ReactNode;
}) {
  const permissions = normalizePermissions(runtime.permissions);
  // Serialize only normalized content; equivalent refreshes preserve the entire CRM subtree.
  const contextKey = JSON.stringify([runtime.identity, runtime.tenantId, permissions]);
  return <CrmSession key={contextKey} runtime={runtime} permissions={permissions}>{children}</CrmSession>;
}

function CrmSession({ runtime, permissions, children }: {
  readonly runtime: WorkspaceRuntime;
  readonly permissions: EffectivePermissions;
  readonly children: ReactNode;
}) {
  // The key changes for actual authorization changes, so this snapshot stays valid for the session.
  const [effectivePermissions] = useState(permissions);
  const [value, setValue] = useState<Workspace | null>(null);
  const { apiClient, tenantId, identity } = runtime;
  useLayoutEffect(() => {
    const controller = new AbortController();
    setValue({ apiClient, tenantId, identity, permissions: effectivePermissions, signal: controller.signal });
    return () => { controller.abort(); };
  }, [apiClient, tenantId, identity, effectivePermissions]);
  return value === null ? <p role="status">Preparando CRM…</p> : <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspace() {
  const value = useContext(Context);
  if (value === null) throw new Error('CrmProvider requerido');
  return value;
}
