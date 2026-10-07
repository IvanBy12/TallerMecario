// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { classifyFailure } from '@/shared/api/api-failure';
import { createApiClient } from '@/shared/api/http-client';
import type { ApiResult } from '@/shared/api/http-client';
import { CONFIRMED_MEDIA, UPLOAD_DTO, UPLOAD_SESSION } from '@/test/media-fixtures';
import { createMediaClient } from './media-client';
import { createUploadTask, advanceUploadProgress } from './upload-task';
import type { MediaApiAdapter, MediaResult, StorageFetch, StorageResponse, StorageResult } from './media-types';
import type { UploadAttempt, UploadObserver, UploadTaskState, UploadTransport } from './upload-task-types';

const blob = new Blob(['abc']);
const response = (status = 200): StorageResponse => ({ status, ok: status === 200, redirected: false, type: 'basic' });
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
function setup(uploadTransport?: UploadTransport) {
  const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }) });
  const api = {
    createUploadSession: vi.fn<MediaApiAdapter<undefined>['createUploadSession']>(() => Promise.resolve({ ok: true, data: UPLOAD_DTO })),
    completeUploadSession: vi.fn<MediaApiAdapter<undefined>['completeUploadSession']>(() => Promise.resolve({ ok: true, data: CONFIRMED_MEDIA })),
  };
  const storageFetch = vi.fn<StorageFetch>(() => Promise.resolve(response()));
  const media = createMediaClient({ client, api, storageFetch, uploadTransport });
  const task = createUploadTask(media);
  return { api, storageFetch, media, task };
}
function begin(task: ReturnType<typeof setup>['task']): UploadAttempt {
  const result = task.start(undefined, blob);
  if (!result.ok) throw new Error('Test expected an allowed attempt');
  return result.attempt;
}
function apiFailure(status: number) {
  return classifyFailure({ source: 'http', status, code: status === 403 ? 'PERMISSION_DENIED' : 'DOMAIN_CONFLICT', requestId: UPLOAD_SESSION.uploadUrl, retryAfterSeconds: 12 });
}

describe('upload execution and secure production path', () => {
  it('idle → preparing → uploading → completing → succeeded with only confirmed safe fields', async () => {
    const h = setup();
    expect(h.task.getState()).toEqual({ phase: 'idle' });
    const states: UploadTaskState[] = [];
    h.task.subscribe(() => states.push(h.task.getState()));
    h.api.completeUploadSession.mockResolvedValue({ ok: true, data: { ...CONFIRMED_MEDIA, uploadUrl: UPLOAD_SESSION.uploadUrl, objectKey: UPLOAD_DTO.objectKey } });
    const attempt = begin(h.task);
    expect(h.task.getState()).toEqual({ phase: 'preparing', progress: { determinate: false } });
    await attempt.done;
    expect(states.map(s => s.phase)).toEqual(['preparing', 'uploading', 'completing', 'succeeded']);
    expect(h.task.getState()).toEqual({ phase: 'succeeded', media: CONFIRMED_MEDIA });
    for (const state of states) {
      if ('progress' in state) expect(state.progress).toEqual({ determinate: false });
      expect(JSON.stringify(state)).not.toMatch(/presigned|private|objectKey|uploadUrl|requestId/);
    }
    const init = h.storageFetch.mock.calls[0]?.[1];
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', method: 'PUT', headers: UPLOAD_SESSION.uploadHeaders });
    for (const header of ['Authorization', 'X-Tenant-Id', 'Cookie']) expect(new Headers(init?.headers).has(header)).toBe(false);
    expect(h.storageFetch).toHaveBeenCalledTimes(1);
    expect(h.api.completeUploadSession).toHaveBeenCalledTimes(1);
  });
  it('cancel before dispatch, repeated cancel, and old handle cannot cancel a new local restart', async () => {
    const h = setup(), a = begin(h.task);
    a.cancel(); a.cancel(); h.task.cancel();
    expect(h.task.getState()).toEqual({ phase: 'canceled', recovery: { kind: 'safe_local_restart' } });
    const b = h.task.restart(undefined, blob);
    if (!b.ok) throw new Error('Expected local restart');
    a.cancel();
    await Promise.all([a.done, b.attempt.done]);
    expect(h.task.getState().phase).toBe('succeeded');
    expect(h.api.createUploadSession).toHaveBeenCalledTimes(1);
  });
  it('active start is refused and success cancel/restart are no-ops', async () => {
    const h = setup(), a = begin(h.task);
    expect(h.task.start(undefined, blob)).toEqual({ ok: false, reason: 'busy' });
    await a.done;
    const before = h.task.getState(); a.cancel(); h.task.cancel();
    expect(h.task.getState()).toBe(before);
    expect(h.task.restart(undefined, blob)).toEqual({ ok: false, reason: 'already_succeeded' });
  });
  it.each(['create', 'storage', 'complete'] as const)('cancel pending %s settles promptly and ignores late success', async stage => {
    const h = setup(), apiPending = deferred<ApiResult<unknown>>(), putPending = deferred<StorageResponse>();
    if (stage === 'create') h.api.createUploadSession.mockReturnValue(apiPending.promise);
    if (stage === 'complete') h.api.completeUploadSession.mockReturnValue(apiPending.promise);
    if (stage === 'storage') h.storageFetch.mockReturnValue(putPending.promise);
    const a = begin(h.task); await flush();
    const signal = stage === 'create' ? h.api.createUploadSession.mock.calls[0]?.[2]
      : stage === 'complete' ? h.api.completeUploadSession.mock.calls[0]?.[2] : h.storageFetch.mock.calls[0]?.[1].signal;
    a.cancel(); expect(signal?.aborted).toBe(true);
    await a.done;
    const canceled = h.task.getState();
    expect(canceled).toEqual({ phase: 'canceled', recovery: { kind: 'contract_dependency', reason: stage === 'create' ? 'create_retry' : 'reconciliation' } });
    apiPending.resolve({ ok: true, data: stage === 'create' ? UPLOAD_DTO : CONFIRMED_MEDIA });
    putPending.resolve(response()); await flush();
    expect(h.task.getState()).toBe(canceled);
    expect(h.task.restart(undefined, blob)).toEqual({ ok: false, reason: 'contract_dependency' });
    expect(h.api.completeUploadSession).toHaveBeenCalledTimes(stage === 'complete' ? 1 : 0);
  });
  it('cancel after PUT but before complete dispatch prevents complete', async () => {
    const h = setup();
    h.task.subscribe(() => { if (h.task.getState().phase === 'completing') h.task.cancel(); });
    await begin(h.task).done;
    expect(h.storageFetch).toHaveBeenCalledTimes(1);
    expect(h.api.completeUploadSession).not.toHaveBeenCalled();
    expect(h.task.getState().phase).toBe('canceled');
  });
  it('cancel on uploading transition prevents any PUT dispatch', async () => {
    const h = setup();
    h.task.subscribe(() => { if (h.task.getState().phase === 'uploading') h.task.cancel(); });
    await begin(h.task).done;
    expect(h.storageFetch).not.toHaveBeenCalled(); expect(h.api.completeUploadSession).not.toHaveBeenCalled();
  });
  it.each([403, 412, 413, 415, 422, 500])('storage %s preserves classification and blocks unsafe replay', async status => {
    const h = setup(); h.storageFetch.mockResolvedValue(response(status));
    await begin(h.task).done;
    const kinds: Record<number, string> = { 403: 'signed_url_rejected', 412: 'upload_conflict', 413: 'payload_too_large', 415: 'unsupported_media_type', 422: 'unprocessable_upload', 500: 'unexpected_status' };
    expect(h.task.getState()).toMatchObject({ phase: status === 403 || status === 412 ? 'needs_restart' : status === 500 ? 'ambiguous' : 'failed', failure: { source: 'storage', kind: kinds[status], status }, recovery: { kind: [413, 415, 422].includes(status) ? 'user_action' : 'contract_dependency' } });
    expect(h.task.restart(undefined, blob).ok).toBe(false);
    await flush(); expect(h.storageFetch).toHaveBeenCalledTimes(1); expect(h.api.createUploadSession).toHaveBeenCalledTimes(1);
    expect(h.api.completeUploadSession).not.toHaveBeenCalled();
  });
  it('network after PUT dispatch is ambiguous, sanitized and never replayed', async () => {
    const h = setup(); h.storageFetch.mockRejectedValue(new Error(UPLOAD_SESSION.uploadUrl + UPLOAD_DTO.objectKey));
    await begin(h.task).done;
    expect(h.task.getState()).toMatchObject({ phase: 'ambiguous', failure: { source: 'storage', kind: 'network' }, recovery: { kind: 'contract_dependency', reason: 'reconciliation' } });
    expect(JSON.stringify(h.task.getState())).not.toContain('private');
    expect(h.task.restart(undefined, blob).ok).toBe(false);
    expect(h.storageFetch).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 409, 429, 503])('create API %s preserves safe kind/status and never becomes storage ambiguity', async status => {
    const h = setup(), failure = apiFailure(status);
    h.api.createUploadSession.mockResolvedValue({ ok: false, failure });
    await begin(h.task).done;
    expect(h.task.getState()).toMatchObject({ phase: 'failed', failure: { source: 'api', stage: 'create', kind: failure.kind, status }, recovery: { kind: 'contract_dependency', reason: 'create_retry' } });
    if (status === 429) expect(h.task.getState()).toMatchObject({ failure: { retryAfterSeconds: 12 } });
    expect(JSON.stringify(h.task.getState())).not.toContain('presigned');
    expect(h.storageFetch).not.toHaveBeenCalled();
    expect(h.task.restart(undefined, blob).ok).toBe(false);
  });
  it.each(['network', 'timeout', 'contract_violation'] as const)('create %s does not become ambiguous or invent safe session retry', async kind => {
    const h = setup(); h.api.createUploadSession.mockResolvedValue({ ok: false, failure: { kind, status: null, code: null, requestId: null } });
    await begin(h.task).done;
    expect(h.task.getState()).toMatchObject({ phase: 'failed', recovery: { kind: 'contract_dependency', reason: 'create_retry' } });
    expect(h.storageFetch).not.toHaveBeenCalled();
  });
  it.each(['no_session', 'token_offline', 'token_error', 'client_bug'] as const)('local API preflight %s permits a fresh attempt', async kind => {
    const h = setup(); h.api.createUploadSession.mockResolvedValueOnce({ ok: false, failure: { kind, status: null, code: null, requestId: null } });
    await begin(h.task).done;
    expect(h.task.getState()).toMatchObject({ phase: 'failed', recovery: { kind: 'safe_local_restart' } });
    await begin(h.task).done; expect(h.task.getState().phase).toBe('succeeded');
    expect(h.storageFetch).toHaveBeenCalledTimes(1);
  });
  it.each(['network', 'timeout', 'server_error', 'contract_violation'] as const)('complete %s is ambiguous and is never replayed', async kind => {
    const h = setup(); h.api.completeUploadSession.mockResolvedValue({ ok: false, failure: { kind, status: null, code: null, requestId: null } });
    await begin(h.task).done;
    expect(h.task.getState()).toMatchObject({ phase: 'ambiguous', failure: { source: 'api', stage: 'complete', kind } });
    expect(h.task.restart(undefined, blob)).toEqual({ ok: false, reason: 'contract_dependency' });
    expect(h.api.completeUploadSession).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 409, 429])('complete API %s is a known rejection requiring recovery contract', async status => {
    const h = setup(); h.api.completeUploadSession.mockResolvedValue({ ok: false, failure: apiFailure(status) });
    await begin(h.task).done;
    expect(h.task.getState()).toMatchObject({ phase: 'failed', failure: { source: 'api', stage: 'complete', status }, recovery: { kind: 'contract_dependency', reason: 'reconciliation' } });
    if (status === 429) expect(h.task.getState()).toMatchObject({ failure: { retryAfterSeconds: 12 } });
  });
  it.each(['create', 'complete'] as const)('invalid %s DTO cannot claim success', async stage => {
    const h = setup();
    if (stage === 'create') h.api.createUploadSession.mockResolvedValue({ ok: true, data: { ...UPLOAD_DTO, uploadUrl: 'http://unsafe.test' } });
    else h.api.completeUploadSession.mockResolvedValue({ ok: true, data: null });
    await begin(h.task).done;
    expect(h.task.getState()).toMatchObject({ phase: stage === 'create' ? 'failed' : 'ambiguous', failure: { source: 'contract', kind: stage === 'create' ? 'invalid_upload_session' : 'invalid_completion' } });
  });
  it.each(['create', 'storage', 'complete'] as const)('dispose during %s aborts, promptly settles, clears state, ignores late results and disallows restart', async stage => {
    const h = setup(), apiPending = deferred<ApiResult<unknown>>(), putPending = deferred<StorageResponse>();
    if (stage === 'create') h.api.createUploadSession.mockReturnValue(apiPending.promise);
    if (stage === 'complete') h.api.completeUploadSession.mockReturnValue(apiPending.promise);
    if (stage === 'storage') h.storageFetch.mockReturnValue(putPending.promise);
    const listener = vi.fn(); h.task.subscribe(listener);
    const a = begin(h.task); await flush();
    const signal = stage === 'create' ? h.api.createUploadSession.mock.calls[0]?.[2]
      : stage === 'complete' ? h.api.completeUploadSession.mock.calls[0]?.[2] : h.storageFetch.mock.calls[0]?.[1].signal;
    h.task.dispose(); h.task.dispose(); await a.done;
    expect(signal?.aborted).toBe(true);
    expect(h.task.getState()).toEqual({ phase: 'disposed' });
    const calls = listener.mock.calls.length;
    apiPending.resolve({ ok: true, data: stage === 'create' ? UPLOAD_DTO : CONFIRMED_MEDIA }); putPending.resolve(response()); await flush();
    expect(h.task.getState()).toEqual({ phase: 'disposed' }); expect(listener).toHaveBeenCalledTimes(calls);
    expect(h.task.start(undefined, blob)).toEqual({ ok: false, reason: 'disposed' });
    expect(JSON.stringify(h.task.getState())).not.toMatch(/Blob|input|media|progress/);
  });
  it('dispose before dispatch does not send requests and subscription can unsubscribe', async () => {
    const h = setup(), listener = vi.fn(); const unsubscribe = h.task.subscribe(listener); unsubscribe();
    const a = begin(h.task); h.task.dispose(); await a.done;
    expect(listener).not.toHaveBeenCalled(); expect(h.api.createUploadSession).not.toHaveBeenCalled();
  });
  it('thrown adapter exceptions are safe and complete dispatch stays ambiguous', async () => {
    const h = setup(); h.api.completeUploadSession.mockRejectedValue(new Error(UPLOAD_SESSION.uploadUrl));
    await begin(h.task).done;
    expect(h.task.getState()).toMatchObject({ phase: 'ambiguous', failure: { source: 'api', kind: 'network', stage: 'complete' } });
    expect(JSON.stringify(h.task.getState())).not.toContain('presigned');
  });
});

describe('real-byte extension and attempt generation guards', () => {
  it('consumes synthetic real-byte events monotonically, clamps overshoot and preserves final 100%', async () => {
    const pending = deferred<StorageResult>(); let emit: ((bytes: { loadedBytes: number; totalBytes?: number }) => void) | undefined;
    const h = setup((_session, received, _signal, onProgress) => { expect(received).toBe(blob); emit = onProgress; return pending.promise; });
    const a = begin(h.task); await flush();
    emit?.({ loadedBytes: 2, totalBytes: 3 });
    expect(h.task.getState()).toMatchObject({ progress: { determinate: true, loadedBytes: 2, totalBytes: 3, ratio: 2 / 3 } });
    const previous = h.task.getState(); emit?.({ loadedBytes: 1, totalBytes: 3 }); expect(h.task.getState()).toBe(previous);
    emit?.({ loadedBytes: 99, totalBytes: 3 }); expect(h.task.getState()).toMatchObject({ progress: { ratio: 1, loadedBytes: 3 } });
    pending.resolve({ ok: true, data: null }); await a.done;
    const succeeded = h.task.getState(); emit?.({ loadedBytes: 0, totalBytes: 3 }); expect(h.task.getState()).toBe(succeeded);
  });
  it('unknown total remains indeterminate and late bytes after cancel cannot change state', async () => {
    const pending = deferred<StorageResult>(); let observer: ((bytes: { loadedBytes: number; totalBytes?: number }) => void) | undefined;
    const h = setup((_session, _blob, _signal, progress) => { observer = progress; return pending.promise; });
    const a = begin(h.task); await flush(); observer?.({ loadedBytes: 2 });
    expect(h.task.getState()).toEqual({ phase: 'uploading', progress: { determinate: false } });
    a.cancel(); await a.done; const canceled = h.task.getState();
    observer?.({ loadedBytes: 3, totalBytes: 3 }); pending.resolve({ ok: true, data: null }); await flush();
    expect(h.task.getState()).toBe(canceled);
  });
  it('late A callbacks/result never replace B; local restart creates a distinct signal and resets bytes', async () => {
    // Test-only executor holds callbacks without dispatching network. Recovery remains local.
    const observers: UploadObserver[] = [], signals: AbortSignal[] = [], results = [deferred<MediaResult>(), deferred<MediaResult>()];
    const task = createUploadTask<undefined>({ upload(_input, _blob, signal, observer) {
      const index = observers.length; observers.push(observer); signals.push(signal);
      return results[index]?.promise ?? Promise.resolve({ ok: true, data: CONFIRMED_MEDIA });
    } });
    const a = begin(task); await flush(); const old = observers[0];
    old?.onPhase('uploading'); old?.onProgress({ loadedBytes: 2, totalBytes: 3 });
    a.cancel(); const b = begin(task); await flush(); const fresh = observers[1];
    expect(signals[0]).not.toBe(signals[1]); expect(signals[0]?.aborted).toBe(true);
    fresh?.onPhase('uploading'); expect(task.getState()).toEqual({ phase: 'uploading', progress: { determinate: false } });
    a.cancel(); const authoritative = task.getState();
    old?.onProgress({ loadedBytes: 3, totalBytes: 3 }); old?.onPhase('completing'); old?.onDispatch('complete');
    results[0]?.resolve({ ok: true, data: CONFIRMED_MEDIA }); await a.done;
    expect(task.getState()).toBe(authoritative); expect(signals[1]?.aborted).toBe(false);
    results[1]?.resolve({ ok: true, data: CONFIRMED_MEDIA }); await b.done;
    expect(task.getState().phase).toBe('succeeded');
  });
  it('late rejection from A cannot fail B', async () => {
    const pending = deferred<MediaResult>(); let count = 0;
    const task = createUploadTask<undefined>({ upload() { return count++ === 0 ? pending.promise : Promise.resolve({ ok: true, data: CONFIRMED_MEDIA }); } });
    const a = begin(task); await flush(); a.cancel(); const b = begin(task); await b.done;
    pending.reject(new Error(UPLOAD_SESSION.uploadUrl)); await a.done;
    expect(task.getState()).toEqual({ phase: 'succeeded', media: CONFIRMED_MEDIA });
  });
  it.each([
    { loadedBytes: -1, totalBytes: 3 }, { loadedBytes: NaN, totalBytes: 3 },
    { loadedBytes: Infinity, totalBytes: 3 }, { loadedBytes: 1, totalBytes: 0 },
    { loadedBytes: 1, totalBytes: -1 }, { loadedBytes: 1, totalBytes: Infinity },
    { loadedBytes: 1, totalBytes: NaN }, { loadedBytes: 1 },
  ])('ignores invalid/unknown counts %#', event => {
    const previous = { determinate: false as const };
    expect(advanceUploadProgress(previous, event)).toBe(previous);
  });
  it('zero is honest and changing/unknown totals cannot regress determinate progress', () => {
    const first = advanceUploadProgress({ determinate: false }, { loadedBytes: 0, totalBytes: 3 });
    expect(first).toEqual({ determinate: true, loadedBytes: 0, totalBytes: 3, ratio: 0 });
    const next = advanceUploadProgress(first, { loadedBytes: 2, totalBytes: 3 });
    expect(advanceUploadProgress(next, { loadedBytes: 2, totalBytes: 100 })).toBe(next);
    expect(advanceUploadProgress(next, { loadedBytes: 2 })).toBe(next);
  });
});

describe('reentrant cancellation and phase boundaries', () => {
  it.each(['cancel', 'dispose'] as const)('%s publishes its final state before synchronous abort handlers', async action => {
    const pending = deferred<StorageResult>();
    let restart: unknown;
    const h = setup((_session, _blob, signal) => {
      signal.addEventListener('abort', () => { restart = h.task.restart(undefined, blob); });
      return pending.promise;
    });
    const attempt = begin(h.task); await flush(); h.task[action](); await attempt.done;
    expect(restart).toEqual({ ok: false, reason: action === 'dispose' ? 'disposed' : 'contract_dependency' });
    expect(h.task.getState().phase).toBe(action === 'dispose' ? 'disposed' : 'canceled');
  });
  it('late transport phase/progress cannot move completing back to uploading', async () => {
    const result = deferred<MediaResult>(); let hooks: UploadObserver | undefined;
    const task = createUploadTask<undefined>({ upload(_input, _blob, _signal, observer) { hooks = observer; return result.promise; } });
    const attempt = begin(task); await flush();
    hooks?.onPhase('uploading'); hooks?.onPhase('completing'); const completing = task.getState();
    hooks?.onPhase('uploading'); hooks?.onPhase('preparing'); hooks?.onProgress({ loadedBytes: 3, totalBytes: 3 });
    expect(task.getState()).toBe(completing);
    result.resolve({ ok: true, data: CONFIRMED_MEDIA }); await attempt.done;
  });
});
