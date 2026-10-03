import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import type { ApiClient } from '@/shared/api/http-client';
import { createReceptionApi, type ReceptionApi } from './reception-api';
export { can, type EffectivePermissions } from '@/shared/auth/effective-permissions';
import { normalizePermissions, type EffectivePermissions } from '@/shared/auth/effective-permissions';
export interface ReceptionRuntime {
    readonly apiClient: ApiClient;
    readonly identity: string;
    readonly tenantId: string;
    readonly permissions: EffectivePermissions;
}
interface Value {
    readonly api: ReceptionApi;
    readonly permissions: EffectivePermissions;
    readonly signal: AbortSignal;
}
const ReceptionContext = createContext<Value | null>(null);
export function ReceptionProvider({ runtime, children }: {
    readonly runtime: ReceptionRuntime;
    readonly children: ReactNode;
}) {
    const permissions = normalizePermissions(runtime.permissions);
    const contextKey = JSON.stringify([runtime.identity, runtime.tenantId, permissions]);
    return <ReceptionSession key={contextKey} runtime={runtime} permissions={permissions}>{children}</ReceptionSession>;
}
function ReceptionSession({ runtime, permissions, children }: {
    readonly runtime: ReceptionRuntime; readonly permissions: EffectivePermissions; readonly children: ReactNode;
}) {
    // A semantic authorization change remounts this session; equivalent refreshes keep its snapshot.
    const [effectivePermissions] = useState(permissions);
    const [value, setValue] = useState<Value | null>(null);
    const { apiClient, tenantId, identity } = runtime;
    useLayoutEffect(() => {
        const controller = new AbortController();
        setValue({ api: createReceptionApi(apiClient, tenantId, controller.signal), permissions: effectivePermissions, signal: controller.signal });
        return () => { controller.abort(); };
    }, [apiClient, tenantId, effectivePermissions, identity]);
    return value === null ? <p role="status">Preparando recepción…</p> : <ReceptionContext.Provider value={value}>{children}</ReceptionContext.Provider>;
}
export function useReception() {
    const value = useContext(ReceptionContext);
    if (value === null)
        throw new Error('ReceptionProvider requerido');
    return value;
}
