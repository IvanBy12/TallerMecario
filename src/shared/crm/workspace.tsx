import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import type { ApiClient } from '@/shared/api/http-client';
import type { EffectivePermissions } from '@/shared/auth/effective-permissions';
export interface WorkspaceRuntime {
  readonly apiClient: ApiClient;
  readonly identity: string;
  readonly tenantId: string;
  readonly permissions: EffectivePermissions;
}
interface Workspace extends WorkspaceRuntime { readonly signal: AbortSignal }
const Context = createContext<Workspace | null>(null);
export function CrmProvider({ runtime, children }: { readonly runtime: WorkspaceRuntime; readonly children: ReactNode }) {
  const [value, setValue] = useState<Workspace | null>(null);
  const { apiClient, tenantId, identity, permissions } = runtime;
  useLayoutEffect(() => {
    const controller = new AbortController();
    setValue({ apiClient, tenantId, identity, permissions, signal: controller.signal });
    return () => { controller.abort(); };
  }, [apiClient, tenantId, identity, permissions]);
  return value === null ? <p role="status">Preparando CRM…</p> : <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (value === null) throw new Error('CrmProvider requerido');
  return value;
}
