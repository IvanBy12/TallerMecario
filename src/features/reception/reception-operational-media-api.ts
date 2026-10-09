import { classifyFailure } from '@/shared/api/api-failure';
import type { ApiClient, ApiResult, GetRequest } from '@/shared/api/http-client';
import { id } from '@/shared/crm/contract';
import { createMediaClient } from '@/shared/media/media-client';
import type { MediaApiAdapter, StorageFetch } from '@/shared/media/media-types';
import type { UploadExecutor } from '@/shared/media/upload-task-types';
import { parseMediaMime, parseMediaSize, parseMediaSortOrder, parseMediaTimestamp, parseOperationalMediaType,
  parseReceptionMediaAssociation, parseReceptionMediaDownload, parseReceptionMediaList } from './reception-operational-media-contract';
import type { ReceptionMediaAssociationInput, ReceptionOperationalMediaInput } from './reception-operational-media-types';

function bad<T>(): Promise<ApiResult<T>> {
  return Promise.resolve({ ok: false, failure: classifyFailure({ source: 'client', reason: 'client_bug' }) });
}
function requestContext(tenantId: string, signal: AbortSignal, local?: AbortSignal) {
  return { tenantId, tokenPolicy: 'cached' as const,
    signal: local === undefined ? signal : AbortSignal.any([signal, local]) };
}

/** Session → signed PUT → complete(active) only. Association remains explicit. */
export function createReceptionOperationalMediaExecutor(deps: {
  readonly client: ApiClient;
  readonly tenantId: string;
  readonly signal: AbortSignal;
  readonly storageFetch?: StorageFetch;
}): UploadExecutor<ReceptionOperationalMediaInput> {
  const api: MediaApiAdapter<ReceptionOperationalMediaInput> = {
    createUploadSession(client, input, local) {
      if (id(input.receptionId) === null || id(input.idempotencyKey) === null ||
          parseOperationalMediaType(input.mediaType) === null || parseMediaMime(input.mimeType) === null ||
          parseMediaSize(input.expectedSizeBytes) === null ||
          (input.capturedAt !== undefined && parseMediaTimestamp(input.capturedAt) === null)) return bad();
      return client.postJson({ ...requestContext(deps.tenantId, deps.signal, local),
        path: '/api/v1/media/upload-sessions', body: {
          mediaType: input.mediaType, mimeType: input.mimeType, retentionClass: 'operational',
          idempotencyKey: input.idempotencyKey, expectedSizeBytes: input.expectedSizeBytes,
          ...(input.capturedAt === undefined ? {} : { capturedAt: input.capturedAt }),
          operationalContext: { type: 'reception', receptionId: input.receptionId },
        },
      }, value => value); // Generic client parses and discards private session fields.
    },
    completeUploadSession(client, identity, local) {
      if (id(identity.uploadSessionId) === null || id(identity.mediaAssetId) === null) return bad();
      return client.postJson({ ...requestContext(deps.tenantId, deps.signal, local),
        path: `/api/v1/media/upload-sessions/${identity.uploadSessionId}/complete`, body: {},
      }, value => value); // Generic client requires active and checks asset identity.
    },
  };
  const media = createMediaClient({ client: deps.client, api, storageFetch: deps.storageFetch });
  return {
    upload: (input, blob, local, observer) => media.upload(input, blob,
      AbortSignal.any([deps.signal, local]), observer),
  };
}

/** tenantId/signal must come from the existing verified reception runtime.
 * IDs are resource selectors, never authorization. No POST is retried here.
 */
export function createReceptionOperationalMediaApi(client: ApiClient, tenantId: string, signal: AbortSignal) {
  async function get<T>(path: string, parse: (value: unknown) => T | null, local?: AbortSignal): Promise<ApiResult<T>> {
    const request: GetRequest = { ...requestContext(tenantId, signal, local), path };
    const result = await client.getJson(request, parse);
    return !result.ok && result.failure.kind === 'unauthenticated' && !request.signal.aborted
      ? client.getJson({ ...request, tokenPolicy: 'fresh' }, parse) : result;
  }
  return {
    attach(receptionId: string, input: ReceptionMediaAssociationInput, local?: AbortSignal) {
      if (id(receptionId) === null || id(input.mediaAssetId) === null ||
          (input.sortOrder !== undefined && parseMediaSortOrder(input.sortOrder) === null)) {
        return bad<NonNullable<ReturnType<typeof parseReceptionMediaAssociation>>>();
      }
      return client.postJson({ ...requestContext(tenantId, signal, local),
        path: `/api/v1/receptions/${receptionId}/media`, body: {
          mediaAssetId: input.mediaAssetId,
          ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        },
      }, value => {
        const data = parseReceptionMediaAssociation(value);
        return data?.media.mediaAssetId === input.mediaAssetId &&
          data.media.sortOrder === (input.sortOrder ?? 0) ? data : null;
      });
    },
    list(receptionId: string, local?: AbortSignal) {
      return id(receptionId) === null ? bad<NonNullable<ReturnType<typeof parseReceptionMediaList>>>() :
        get(`/api/v1/receptions/${receptionId}/media`, parseReceptionMediaList, local);
    },
    download(mediaAssetId: string, local?: AbortSignal) {
      return id(mediaAssetId) === null ? bad<NonNullable<ReturnType<typeof parseReceptionMediaDownload>>>() :
        get(`/api/v1/media/${mediaAssetId}/download-url`, value => {
          const data = parseReceptionMediaDownload(value);
          return data?.mediaAssetId === mediaAssetId ? data : null;
        }, local);
    },
  };
}
