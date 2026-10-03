import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { createApiClient, type ApiResult } from '@/shared/api/http-client';
import { CrmProvider, useWorkspace, type WorkspaceRuntime } from './workspace';
import { useCrmAction } from './use-action';

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error('Uninitialized promise'); };
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('CRM action generation', () => {
  it.each([false, true])('signal replacement releases pending and isolates old completion (abort first: %s)', async abortFirst => {
    const oldController = new AbortController();
    const nextController = new AbortController();
    const pending = deferred<ApiResult<string>>();
    const nextPending = deferred<ApiResult<string>>();
    const completions: string[] = [];
    const hook = renderHook(({ signal }) => useCrmAction(signal), { initialProps: { signal: oldController.signal } });
    let oldRun: Promise<void> = Promise.resolve();
    act(() => { oldRun = hook.result.current.run(() => pending.promise, data => { completions.push(data); }); });
    expect(hook.result.current.busy).toBe(true);
    if (abortFirst) {
      act(() => { oldController.abort(); });
      expect(hook.result.current.busy).toBe(false);
      expect(hook.result.current.blocked).toBe(false);
    }
    hook.rerender({ signal: nextController.signal });
    expect(hook.result.current.blocked).toBe(false);
    let nextRun: Promise<void> = Promise.resolve();
    act(() => { nextRun = hook.result.current.run(() => nextPending.promise, data => { completions.push(data); }); });
    expect(hook.result.current.busy).toBe(true);
    await act(async () => { pending.resolve({ ok: true, data: 'stale' }); await oldRun; });
    expect(completions).toEqual([]);
    expect(hook.result.current.busy).toBe(true);
    await act(async () => { nextPending.resolve({ ok: true, data: 'current' }); await nextRun; });
    expect(completions).toEqual(['current']);
    expect(hook.result.current.blocked).toBe(false);
  });

  it('replacement clears rate-limit cooldown and failure from the old context', async () => {
    const hook = renderHook(({ signal }) => useCrmAction(signal), { initialProps: { signal: new AbortController().signal } });
    await act(async () => {
      await hook.result.current.run(() => Promise.resolve({ ok: false, failure: { kind: 'rate_limited', status: 429, code: 'RATE_LIMIT_EXCEEDED', requestId: null, retryAfterSeconds: 30 } }), () => undefined);
    });
    expect(hook.result.current.blocked).toBe(true);
    hook.rerender({ signal: new AbortController().signal });
    expect(hook.result.current.blocked).toBe(false);
    expect(hook.result.current.failure).toBeNull();
  });

  it('provider retains a signal for reordered grants and aborts it when replacing the client', () => {
    const client = () => createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'no_session' }) });
    let runtime: WorkspaceRuntime = { apiClient: client(), identity: 'test-session', tenantId: '11111111-1111-4111-8111-111111111111', permissions: [{ code: 'customers.read', scopes: ['tenant', 'assigned'] }, { code: 'customers.update', scopes: ['tenant'] }] };
    const wrapper = ({ children }: { readonly children: ReactNode }) => <CrmProvider runtime={runtime}>{children}</CrmProvider>;
    const hook = renderHook(useWorkspace, { wrapper });
    const originalSignal = hook.result.current.signal;
    const originalPermissions = hook.result.current.permissions;
    runtime = { ...runtime, permissions: [{ code: 'customers.update', scopes: ['tenant'] }, { code: 'customers.read', scopes: ['assigned'] }, { code: 'customers.read', scopes: ['tenant'] }] };
    hook.rerender();
    expect(hook.result.current.signal).toBe(originalSignal);
    expect(hook.result.current.permissions).toBe(originalPermissions);
    expect(originalSignal.aborted).toBe(false);
    runtime = { ...runtime, apiClient: client() };
    hook.rerender();
    expect(originalSignal.aborted).toBe(true);
    expect(hook.result.current.signal).not.toBe(originalSignal);
    expect(hook.result.current.signal.aborted).toBe(false);
  });
});
