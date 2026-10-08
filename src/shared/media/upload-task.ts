import type { MediaFailure } from './media-types';
import { createUploadExecution, executeUpload } from './upload-task-execution';
import type { UploadExecution } from './upload-task-execution';
import type { UploadBytes, UploadDispatch, UploadExecutor, UploadFailure, UploadProgress,
  UploadRecovery, UploadStartResult, UploadTaskState } from './upload-task-types';

const indeterminate: UploadProgress = Object.freeze({ determinate: false });
const local: UploadRecovery = Object.freeze({ kind: 'safe_local_restart' });
const dependency = (reason: 'create_retry' | 'new_session' | 'reconciliation'): UploadRecovery =>
  ({ kind: 'contract_dependency', reason });

/** Byte counts must be real; a changing/unknown total cannot regress the visible ratio. */
export function advanceUploadProgress(previous: UploadProgress, event: UploadBytes): UploadProgress {
  const total = event.totalBytes;
  if (!Number.isFinite(event.loadedBytes) || event.loadedBytes < 0) return previous;
  if (total === undefined || !Number.isFinite(total) || total <= 0) return previous;
  if (previous.determinate && previous.totalBytes !== total) return previous;
  const loaded = Math.min(total, Math.max(event.loadedBytes, previous.determinate ? previous.loadedBytes : 0));
  if (previous.determinate && loaded === previous.loadedBytes) return previous;
  return Object.freeze({ determinate: true, loadedBytes: loaded, totalBytes: total, ratio: loaded / total });
}

function projectFailure(failure: Exclude<MediaFailure, { source: 'client' }>): UploadFailure {
  if (failure.source === 'api') {
    const api = failure.failure;
    return { source: 'api', stage: failure.stage, kind: api.kind, status: api.status,
      ...(api.kind === 'rate_limited' ? { retryAfterSeconds: api.retryAfterSeconds } : {}) };
  }
  if (failure.source === 'storage') return { source: 'storage', kind: failure.kind, status: failure.status };
  return { source: 'contract', kind: failure.kind };
}
function failureState(failure: Exclude<MediaFailure, { source: 'client' }>): UploadTaskState {
  const safe = projectFailure(failure);
  if (failure.source === 'storage') {
    switch (failure.kind) {
      case 'upload_conflict':
        return { phase: 'needs_restart', failure: safe, recovery: dependency('reconciliation') };
      case 'signed_url_rejected': case 'session_expired':
        return { phase: 'needs_restart', failure: safe, recovery: dependency('new_session') };
      case 'payload_too_large': case 'unsupported_media_type': case 'unprocessable_upload':
        return { phase: 'failed', failure: safe, recovery: { kind: 'user_action' } };
      case 'invalid_upload_target':
        return { phase: 'failed', failure: safe, recovery: dependency('new_session') };
      default: return { phase: 'ambiguous', failure: safe, recovery: dependency('reconciliation') };
    }
  }
  if ((failure.source === 'contract' && failure.kind === 'invalid_completion') ||
      (failure.source === 'api' && failure.stage === 'complete' &&
        ['network', 'timeout', 'server_error', 'contract_violation', 'unexpected_redirect', 'aborted'].includes(failure.failure.kind))) {
    return { phase: 'ambiguous', failure: safe, recovery: dependency('reconciliation') };
  }
  const preflight = failure.source === 'api' && failure.stage === 'create' &&
    ['no_session', 'token_offline', 'token_error', 'client_bug'].includes(failure.failure.kind);
  return { phase: 'failed', failure: safe, recovery: preflight ? local : dependency(
    failure.source === 'api' && failure.stage === 'complete' ? 'reconciliation' : 'create_retry') };
}

/** In-session only. Caller owns previews and resupplies input/Blob for an allowed restart. */
export function createUploadTask<Input>(executor: UploadExecutor<Input>) {
  let state: UploadTaskState = Object.freeze({ phase: 'idle' });
  const listeners = new Set<() => void>();
  let generation = 0;
  let publication = 0;
  let active: { id: number; abort: AbortController; dispatched: UploadDispatch | null } | null = null;
  function publish(next: UploadTaskState) {
    state = Object.freeze(next);
    const revision = ++publication;
    const snapshot = [...listeners];
    for (const listener of snapshot) {
      // A nested cancel/dispose/publication supersedes this notification cycle.
      if (revision !== publication) break;
      if (!listeners.has(listener)) continue;
      try { listener(); } catch {
        // External consumers cannot interrupt lifecycle work or other subscribers.
      }
    }
  }
  function cancellationRecovery(stage: UploadDispatch | null): UploadRecovery {
    return stage === null ? local : dependency(stage === 'create' ? 'create_retry' : 'reconciliation');
  }
  function cancelAttempt(attempt: NonNullable<typeof active>) {
    if (active !== attempt) return;
    active = null;
    ++generation;
    try { publish({ phase: 'canceled', recovery: cancellationRecovery(attempt.dispatched) }); }
    finally { attempt.abort.abort(); }
  }
  function current(attempt: NonNullable<typeof active>) {
    return active === attempt && generation === attempt.id && !attempt.abort.signal.aborted;
  }
  // Created outside start's payload scope; retained handles capture only the identity.
  function cancelHandle(id: number) {
    return () => { if (active?.id === id) cancelAttempt(active); };
  }
  function runAttempt(attempt: NonNullable<typeof active>, execution: UploadExecution<Input>) {
    return Promise.resolve().then(async () => {
      try {
        if (!current(attempt)) return;
        const result = await executeUpload(executor, execution, attempt.abort.signal, {
          onPhase(phase) {
            if (!current(attempt)) return;
            if ((phase === 'uploading' && state.phase === 'preparing') ||
                (phase === 'completing' && state.phase === 'uploading')) {
              publish({ phase, progress: indeterminate });
            }
          },
          onDispatch(stage) { if (current(attempt)) attempt.dispatched = stage; },
          onProgress(event) {
            if (!current(attempt) || state.phase !== 'uploading') return;
            const progress = advanceUploadProgress(state.progress, event);
            if (progress !== state.progress) publish({ phase: 'uploading', progress });
          },
        });
        if (result === null || !current(attempt)) return;
        active = null;
        if (result.ok) publish({ phase: 'succeeded', media: Object.freeze({
          mediaAssetId: result.data.mediaAssetId, status: result.data.status,
          sizeBytes: result.data.sizeBytes, checksumSha256: result.data.checksumSha256,
        }) });
        else if (result.failure.source === 'client') publish({ phase: 'canceled', recovery: cancellationRecovery(attempt.dispatched) });
        else publish(failureState(result.failure));
      } catch {
        if (!current(attempt)) return;
        active = null;
        // Adapter/extension exceptions are sanitized; after dispatch the result is uncertain.
        const complete = attempt.dispatched === 'complete';
        publish(failureState(attempt.dispatched === 'storage'
          ? { source: 'storage', kind: 'network', status: null }
          : { source: 'api', stage: complete ? 'complete' : 'create', failure: {
            kind: 'network', status: null, code: null, requestId: null,
          } }));
      } finally { execution.payload = null; }
    });
  }
  function start(input: Input, blob: Blob): UploadStartResult {
    if (state.phase === 'disposed') return { ok: false, reason: 'disposed' };
    if (active) return { ok: false, reason: 'busy' };
    if (state.phase === 'succeeded') return { ok: false, reason: 'already_succeeded' };
    if ('recovery' in state && state.recovery.kind !== 'safe_local_restart') {
      return { ok: false, reason: state.recovery.kind === 'user_action' ? 'user_action' : 'contract_dependency' };
    }
    const attempt = { id: ++generation, abort: new AbortController(), dispatched: null as UploadDispatch | null };
    active = attempt;
    // Defer dispatch so the returned cancel handle can stop all network work.
    const done = runAttempt(attempt, createUploadExecution(input, blob));
    publish({ phase: 'preparing', progress: indeterminate });
    return { ok: true, attempt: { cancel: cancelHandle(attempt.id), done } };
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      if (state.phase === 'disposed') return () => {};
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
    start,
    /** Same guard as start; never replays a retained session, PUT or complete. */
    restart: start,
    cancel() {
      if (!active) return;
      const attempt = active;
      cancelAttempt(attempt);
    },
    dispose() {
      if (state.phase === 'disposed') return;
      const attempt = active;
      active = null;
      ++generation;
      try { publish({ phase: 'disposed' }); }
      finally {
        listeners.clear();
        attempt?.abort.abort();
      }
    },
  };
}
