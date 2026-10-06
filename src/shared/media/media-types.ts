import type { ApiFailure } from '@/shared/api/api-failure';
import type { ApiClient, ApiResult } from '@/shared/api/http-client';

export interface UploadIdentity {
  readonly uploadSessionId: string;
  readonly mediaAssetId: string;
}

/** Transient transport data. Never persist or present the signed target. */
export interface UploadTarget {
  readonly uploadUrl: string;
  readonly uploadHeaders: Readonly<Record<string, string>>;
}

export interface UploadSession extends UploadIdentity, UploadTarget {
  readonly status: 'pending';
  readonly uploadMethod: 'PUT';
  readonly expiresAt: string;
}

/** Existing completion DTO, reduced to confirmed fields suitable for consumers. */
export interface ConfirmedMedia {
  readonly mediaAssetId: string;
  readonly status: 'active';
  readonly sizeBytes: number;
  readonly checksumSha256: string | null;
}

export interface StorageResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly redirected: boolean;
  readonly type: string;
}
export type StorageFetch = (url: string, init: RequestInit) => Promise<StorageResponse>;

export type StorageFailureKind =
  | 'aborted'
  | 'network'
  | 'session_expired'
  | 'signed_url_rejected'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'unprocessable_upload'
  | 'unexpected_status'
  | 'unexpected_redirect'
  | 'invalid_upload_target';

export interface StorageFailure {
  readonly source: 'storage';
  readonly kind: StorageFailureKind;
  readonly status: number | null;
}
export type StorageResult = { readonly ok: true; readonly data: null } |
  { readonly ok: false; readonly failure: StorageFailure };

export type MediaFailure = StorageFailure |
  { readonly source: 'client'; readonly kind: 'aborted' } |
  { readonly source: 'api'; readonly stage: 'create' | 'complete'; readonly failure: ApiFailure } |
  { readonly source: 'contract'; readonly kind: 'invalid_upload_session' | 'invalid_completion' };
export type MediaResult = { readonly ok: true; readonly data: ConfirmedMedia } |
  { readonly ok: false; readonly failure: MediaFailure };

/** CONTRACT_DEPENDENCY: implement only against an approved HTTP contract.
 * The adapter owns paths, bodies, tenant context and endpoint response envelopes.
 * Both calls use the existing authenticated client; storage never receives it.
 * Return unwrapped wire DTOs as data: this layer parses them once, discarding
 * private transport fields before returning confirmed media to consumers.
 */
export interface MediaApiAdapter<Input> {
  createUploadSession(client: ApiClient, input: Input, signal: AbortSignal): Promise<ApiResult<unknown>>;
  completeUploadSession(client: ApiClient, identity: UploadIdentity, signal: AbortSignal): Promise<ApiResult<unknown>>;
}
