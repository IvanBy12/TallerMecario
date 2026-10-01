import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import type { ApiClient } from '@/shared/api/http-client';
import { createReceptionApi, type ReceptionApi } from './reception-api';
export type EffectivePermissions = readonly {
    readonly code: string;
    readonly scopes: readonly string[];
}[];
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
    const [value, setValue] = useState<Value | null>(null);
    const { apiClient, tenantId, permissions, identity } = runtime;
    useLayoutEffect(() => {
        const controller = new AbortController();
        setValue({ api: createReceptionApi(apiClient, tenantId, controller.signal), permissions, signal: controller.signal });
        return () => { controller.abort(); };
    }, [apiClient, tenantId, permissions, identity]);
    return value === null ? <p role="status">Preparando recepción…</p> : <ReceptionContext.Provider value={value}>{children}</ReceptionContext.Provider>;
}
export function useReception() {
    const value = useContext(ReceptionContext);
    if (value === null)
        throw new Error('ReceptionProvider requerido');
    return value;
}
export function can(permissions: EffectivePermissions, code: string, tenant = false) {
    return permissions.some((p) => p.code === code && (!tenant || p.scopes.includes('tenant')));
}
