import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type FetchLike } from '@/shared/api/http-client';
import { AuthContextProvider, useAuthContext } from './auth-provider';
import { AuthGate } from './auth-gate';
import { createMeContextSource } from './me-context-source';
import { parseMe, parseMeContext } from './me-contract';
import type { AuthSessionPort } from './session-port';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MA = '33333333-3333-4333-8333-333333333333';
const MB = '44444444-4444-4444-8444-444444444444';
const USER = '55555555-5555-4555-8555-555555555555';
const members = [{ tenantId: A, membershipId: MA }, { tenantId: B, membershipId: MB }];
const bootstrap = (count: number) => ({ user: count === 0 ? null : { id: USER }, memberships: members.slice(0, count), tenantSelection: { mode: count === 0 ? 'unavailable' : count === 1 ? 'automatic' : 'required', tenantId: count === 1 ? A : null } });
const context = (tenantId = A) => ({ context: { tenantId, membershipId: tenantId === A ? MA : MB, userId: USER, workshop: { displayName: tenantId === A ? 'Taller Alfa' : 'Taller Beta', timezone: 'America/Bogota', currency: 'COP' }, roles: ['technician'], permissions: [{ code: 'vehicles.read', scopes: ['assigned'] }] } });
const response = (body: unknown, status = 200, retry: string | null = null) => ({ ok: status === 200, status, type: 'basic', redirected: false, headers: { get: () => retry }, json: () => Promise.resolve(body) });
const error = (code: string) => ({ error: { code, message: 'No exponer', request_id: 'request-test' } });
const port: AuthSessionPort = { snapshot: { status: 'signed_in', identity: 'clerk:user-session' }, getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }), signOut: () => Promise.resolve() };
function Probe() {
  const { state, actions } = useAuthContext();
  return <><pre data-testid="state">{JSON.stringify(state)}</pre><AuthGate state={state} actions={actions} /><button onClick={actions.onChangeWorkshop}>Cambiar taller</button><button onClick={actions.onRetry}>Revalidar</button></>;
}
function mount(fetchImpl: FetchLike) {
  const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: (options) => port.getToken(options), fetchImpl });
  const source = createMeContextSource(client);
  return render(<StrictMode><AuthContextProvider port={port} apiClient={client} contextSource={source}><Probe /></AuthContextProvider></StrictMode>);
}
function state() { return screen.getByTestId('state').textContent; }
afterEach(() => vi.useRealTimers());

describe('G5 canonical context', () => {
  it('0 memberships means no access, no tenant request', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(response(bootstrap(0))));
    mount(fetchImpl);
    await screen.findByText('Tu cuenta no tiene acceso activo a un taller.');
    expect(fetchImpl.mock.calls.every(([url, init]) => url.endsWith('/me') && !('X-Tenant-Id' in (init.headers ?? {})) && init.cache === 'no-store')).toBe(true);
    expect(state()).not.toContain(USER);
  });
  it('1 membership automatically loads the authoritative context and sends its header', async () => {
    const fetchImpl = vi.fn<FetchLike>((url) => Promise.resolve(response(url.endsWith('/me') ? bootstrap(1) : context())));
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    mount(fetchImpl);
    await screen.findByText('Taller Alfa');
    expect(state()).toContain('"kind":"ready"');
    expect(state()).toContain('"userId":"' + USER + '"');
    expect(state()).toContain('"scopes":["assigned"]');
    expect(storage).not.toHaveBeenCalled();
    const tenantRequests = fetchImpl.mock.calls.filter(([url]) => url.endsWith('/me/context'));
    expect(tenantRequests.length).toBeGreaterThan(0);
    expect(tenantRequests.every(([, init]) => new Headers(init.headers).get('X-Tenant-Id') === A)).toBe(true);
  });
  it('multiple memberships require named selection and a fresh context request for the chosen tenant', async () => {
    const fetchImpl = vi.fn<FetchLike>((url, init) => Promise.resolve(response(url.endsWith('/me') ? bootstrap(2) : context(new Headers(init.headers).get('X-Tenant-Id') ?? A))));
    mount(fetchImpl);
    fireEvent.click(await screen.findByRole('button', { name: 'Taller Beta' }));
    await waitFor(() => { expect(state()).toContain('"kind":"ready"'); });
    expect(state()).toContain('"tenantId":"' + B + '"');
    expect(fetchImpl.mock.calls.filter(([url, init]) => url.endsWith('/me/context') && new Headers(init.headers).get('X-Tenant-Id') === B)).toHaveLength(2);
  });
  it('switching drops all previous context before the new bootstrap completes', async () => {
    let hold = false;
    let pending = false;
    let resolve: (value: ReturnType<typeof response>) => void = () => undefined;
    const fetchImpl: FetchLike = (url) => hold ? new Promise((done) => { pending = true; resolve = done; }) : Promise.resolve(response(url.endsWith('/me') ? bootstrap(1) : context()));
    mount(fetchImpl);
    await screen.findByText('Taller Alfa');
    hold = true;
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar taller' }));
    expect(state()).toContain('"kind":"loading_context"');
    expect(state()).not.toContain(A);
    expect(state()).not.toContain(MA);
    expect(state()).not.toContain('permissions');
    await waitFor(() => { expect(pending).toBe(true); });
    await act(async () => { resolve(response(bootstrap(0))); await Promise.resolve(); });
    await screen.findByText('Tu cuenta no tiene acceso activo a un taller.');
  });
  it('selection revocation clears context and revalidates me once without a loop', async () => {
    let denied = false;
    let revoked = false;
    const fetchImpl = vi.fn<FetchLike>((url, init) => {
      if (url.endsWith('/me')) return Promise.resolve(response(revoked ? bootstrap(0) : bootstrap(2)));
      if (denied) revoked = true;
      return Promise.resolve(denied ? response(error('TENANT_ACCESS_DENIED'), 403) : response(context(new Headers(init.headers).get('X-Tenant-Id') ?? A)));
    });
    mount(fetchImpl);
    const choice = await screen.findByRole('button', { name: 'Taller Beta' });
    denied = true;
    fireEvent.click(choice);
    await screen.findByText('Tu cuenta no tiene acceso activo a un taller.');
    expect(state()).not.toContain(B);
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/me'))).toHaveLength(3);
  });
  it('excludes denied candidates from the selector', async () => {
    mount((url, init) => Promise.resolve(url.endsWith('/me') ? response(bootstrap(2)) : new Headers(init.headers).get('X-Tenant-Id') === A ? response(error('PERMISSION_DENIED'), 403) : response(context(B))));
    await screen.findByRole('button', { name: 'Taller Beta' });
    expect(screen.queryByRole('button', { name: 'Taller Alfa' })).toBeNull();
    expect(state()).toContain('workshop_selection_required');
  });
  it.each([[400, 'TENANT_SELECTION_INVALID', 'fatal_error'], [401, 'AUTHENTICATION_REQUIRED', 'auth_rejected'], [403, 'PERMISSION_DENIED', 'no_access'], [500, 'INTERNAL_ERROR', 'recoverable_error']])('handles %s %s preserving request id', async (status, code, kind) => {
    const fetchImpl = vi.fn<FetchLike>((url) => Promise.resolve(url.endsWith('/me') ? response(bootstrap(1)) : response(error(code), status)));
    mount(fetchImpl);
    await waitFor(() => { expect(state()).toContain('"kind":"' + kind + '"'); });
    expect(state()).toContain('request-test');
    expect(state()).not.toContain('No exponer');
    if (status === 401) expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/me/context'))).toHaveLength(2);
  });
  it('429 Retry-After blocks retry until its deadline', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(response(error('RATE_LIMIT_EXCEEDED'), 429, '7')));
    mount(fetchImpl);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const retry = screen.getByRole('button', { name: 'Reintentar' });
    expect(retry.hasAttribute('disabled')).toBe(true);
    fireEvent.click(retry);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
    expect(retry.hasAttribute('disabled')).toBe(false);
    fireEvent.click(retry);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('ignores a late response from a context generation discarded by tenant change', async () => {
    let meCalls = 0;
    let pending = false;
    let previousSignal: AbortSignal | null | undefined;
    let finishPrevious: (value: ReturnType<typeof response>) => void = () => undefined;
    const fetchImpl: FetchLike = (url, init) => {
      if (!url.endsWith('/me')) return Promise.resolve(response(context()));
      meCalls += 1;
      if (meCalls === 2) {
        previousSignal = init.signal;
        return new Promise((resolve) => { pending = true; finishPrevious = resolve; });
      }
      return Promise.resolve(response(bootstrap(meCalls === 1 ? 1 : 0)));
    };
    mount(fetchImpl);
    await screen.findByText('Taller Alfa');
    fireEvent.click(screen.getByRole('button', { name: 'Revalidar' }));
    await waitFor(() => { expect(pending).toBe(true); });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar taller' }));
    await screen.findByText('Tu cuenta no tiene acceso activo a un taller.');
    expect(previousSignal?.aborted).toBe(true);
    await act(async () => { finishPrevious(response(bootstrap(1))); await Promise.resolve(); });
    expect(state()).toContain('no_access');
    expect(state()).not.toContain(A);
    expect(state()).not.toContain('permissions');
  });
  it('409 revalidates me and presents the selector without keeping context', async () => {
    let contextCalls = 0;
    let required = false;
    mount((url, init) => {
      if (url.endsWith('/me')) return Promise.resolve(response(bootstrap(required ? 2 : 1)));
      contextCalls += 1;
      if (contextCalls === 1) { required = true; return Promise.resolve(response(error('TENANT_SELECTION_REQUIRED'), 409)); }
      return Promise.resolve(response(context(new Headers(init.headers).get('X-Tenant-Id') ?? A)));
    });
    await screen.findByRole('button', { name: 'Taller Beta' });
    expect(state()).toContain('workshop_selection_required');
    expect(state()).not.toContain('permissions');
  });
  it('rejects inconsistent selection, malformed scopes and cross-tenant responses', async () => {
    expect(parseMe({ ...bootstrap(0), user: { id: USER } })).toBeNull();
    expect(parseMe({ ...bootstrap(1), tenantSelection: { mode: 'required', tenantId: null } })).toBeNull();
    expect(parseMeContext({ context: { ...context().context, permissions: [{ code: 'vehicles.read', scopes: ['tenant', 'assigned'] }] } })).toBeNull();
    mount((url) => Promise.resolve(response(url.endsWith('/me') ? bootstrap(1) : context(B))));
    await waitFor(() => { expect(state()).toContain('fatal_error'); });
    expect(state()).not.toContain(B);
  });
});
