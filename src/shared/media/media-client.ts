import type { ApiClient } from '@/shared/api/http-client';
import { parseActiveMedia, parseUploadSession } from './media-contract';
import { putMedia } from './media-upload';
import type { MediaApiAdapter, MediaResult, StorageFetch } from './media-types';

const isAborted = (signal: AbortSignal) => signal.aborted;

export function createMediaClient<Input>(deps: {
  readonly client: ApiClient;
  readonly api: MediaApiAdapter<Input>;
  readonly storageFetch?: StorageFetch;
}) {
  const aborted = (): MediaResult => ({ ok: false, failure: { source: 'client', kind: 'aborted' } });
  return {
    async upload(input: Input, blob: Blob, signal: AbortSignal): Promise<MediaResult> {
      if (isAborted(signal)) return aborted();
      const created = await deps.api.createUploadSession(deps.client, input, signal);
      if (isAborted(signal)) return aborted();
      if (!created.ok) return { ok: false, failure: { source: 'api', stage: 'create', failure: created.failure } };
      const session = parseUploadSession(created.data);
      if (session === null) return { ok: false, failure: { source: 'contract', kind: 'invalid_upload_session' } };
      const uploaded = await putMedia(session, blob, signal, deps.storageFetch);
      if (!uploaded.ok) return uploaded;
      if (isAborted(signal)) return aborted();
      // Completion needs opaque IDs only; signed URLs and object keys stay out of the adapter.
      const completed = await deps.api.completeUploadSession(deps.client, {
        uploadSessionId: session.uploadSessionId, mediaAssetId: session.mediaAssetId,
      }, signal);
      if (isAborted(signal)) return aborted();
      if (!completed.ok) return { ok: false, failure: { source: 'api', stage: 'complete', failure: completed.failure } };
      const media = parseActiveMedia(completed.data);
      return media?.mediaAssetId === session.mediaAssetId ? { ok: true, data: media } :
        { ok: false, failure: { source: 'contract', kind: 'invalid_completion' } };
    },
  };
}
