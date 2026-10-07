import type { ApiClient } from '@/shared/api/http-client';
import { parseActiveMedia, parseUploadSession } from './media-contract';
import { putMedia } from './media-upload';
import type { MediaApiAdapter, MediaResult, StorageFetch } from './media-types';
import type { UploadObserver, UploadTransport } from './upload-task-types';

const ABORTED = Symbol('aborted');
const isAborted = (signal: AbortSignal) => signal.aborted;
/** Settle on abort even when an adapter ignores its signal; discard late results. */
async function untilAbort<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T | typeof ABORTED> {
  if (isAborted(signal)) return ABORTED;
  let onAbort = () => {};
  const aborted = new Promise<typeof ABORTED>(resolve => {
    onAbort = () => { resolve(ABORTED); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([run(), aborted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}

export function createMediaClient<Input>(deps: {
  readonly client: ApiClient;
  readonly api: MediaApiAdapter<Input>;
  readonly storageFetch?: StorageFetch;
  /** Trusted extension point; only the default secure fetch is shipped. */
  readonly uploadTransport?: UploadTransport;
}) {
  const aborted = (): MediaResult => ({ ok: false, failure: { source: 'client', kind: 'aborted' } });
  return {
    async upload(input: Input, blob: Blob, signal: AbortSignal, observer?: UploadObserver): Promise<MediaResult> {
      if (isAborted(signal)) return aborted();
      observer?.onPhase('preparing');
      if (isAborted(signal)) return aborted();
      observer?.onDispatch('create');
      if (isAborted(signal)) return aborted();
      const created = await untilAbort(signal, () => deps.api.createUploadSession(deps.client, input, signal));
      if (created === ABORTED || isAborted(signal)) return aborted();
      if (!created.ok) return { ok: false, failure: { source: 'api', stage: 'create', failure: created.failure } };
      const session = parseUploadSession(created.data);
      if (session === null) return { ok: false, failure: { source: 'contract', kind: 'invalid_upload_session' } };
      observer?.onPhase('uploading');
      if (isAborted(signal)) return aborted();
      observer?.onDispatch('storage');
      if (isAborted(signal)) return aborted();
      const uploaded = await untilAbort(signal, () => deps.uploadTransport
        ? deps.uploadTransport(session, blob, signal, event => { if (!isAborted(signal)) observer?.onProgress(event); })
        : putMedia(session, blob, signal, deps.storageFetch));
      if (uploaded === ABORTED || isAborted(signal)) return aborted();
      if (!uploaded.ok) return uploaded;
      observer?.onPhase('completing');
      if (isAborted(signal)) return aborted();
      observer?.onDispatch('complete');
      if (isAborted(signal)) return aborted();
      // Completion receives opaque IDs only, never the signed target.
      const completed = await untilAbort(signal, () => deps.api.completeUploadSession(deps.client, {
        uploadSessionId: session.uploadSessionId, mediaAssetId: session.mediaAssetId,
      }, signal));
      if (completed === ABORTED || isAborted(signal)) return aborted();
      if (!completed.ok) return { ok: false, failure: { source: 'api', stage: 'complete', failure: completed.failure } };
      const media = parseActiveMedia(completed.data);
      return media?.mediaAssetId === session.mediaAssetId ? { ok: true, data: media } :
        { ok: false, failure: { source: 'contract', kind: 'invalid_completion' } };
    },
  };
}
