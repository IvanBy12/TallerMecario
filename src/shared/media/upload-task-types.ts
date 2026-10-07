import type { ApiFailureKind } from '@/shared/api/api-failure';
import type { ConfirmedMedia, MediaResult, StorageFailure, StorageResult, UploadSession } from './media-types';

export type UploadPhase = 'preparing' | 'uploading' | 'completing';
export type UploadDispatch = 'create' | 'storage' | 'complete';
export interface UploadBytes { readonly loadedBytes: number; readonly totalBytes?: number }
export type UploadProgress = { readonly determinate: false } | {
  readonly determinate: true; readonly loadedBytes: number; readonly totalBytes: number; readonly ratio: number;
};
export interface UploadObserver {
  onPhase(phase: UploadPhase): void;
  onDispatch(stage: UploadDispatch): void;
  onProgress(bytes: UploadBytes): void;
}
/** A future production implementation requires review of F01's exact redirect/header guarantees. */
export type UploadTransport = (session: UploadSession, blob: Blob, signal: AbortSignal,
  onProgress: (bytes: UploadBytes) => void) => Promise<StorageResult>;
export interface UploadExecutor<Input> {
  upload(input: Input, blob: Blob, signal: AbortSignal, observer: UploadObserver): Promise<MediaResult>;
}
/** Safe projection of F01 failures: no arbitrary strings, request IDs or provider bodies. */
export type UploadFailure = StorageFailure | {
  readonly source: 'api'; readonly stage: 'create' | 'complete'; readonly kind: ApiFailureKind;
  readonly status: number | null; readonly retryAfterSeconds?: number | null;
} | { readonly source: 'contract'; readonly kind: 'invalid_upload_session' | 'invalid_completion' };
export type UploadRecovery = { readonly kind: 'safe_local_restart' } |
  { readonly kind: 'user_action' } | {
    readonly kind: 'contract_dependency';
    readonly reason: 'create_retry' | 'new_session' | 'reconciliation';
  };
export type UploadTaskState = { readonly phase: 'idle' | 'disposed' } |
  { readonly phase: UploadPhase; readonly progress: UploadProgress } |
  { readonly phase: 'succeeded'; readonly media: ConfirmedMedia } |
  { readonly phase: 'canceled'; readonly recovery: UploadRecovery } |
  { readonly phase: 'failed' | 'ambiguous' | 'needs_restart'; readonly failure: UploadFailure; readonly recovery: UploadRecovery };
export interface UploadAttempt {
  /** Bound to this attempt: an old handle cannot cancel a later run. */
  cancel(): void;
  readonly done: Promise<void>;
}
export type UploadStartResult = { readonly ok: true; readonly attempt: UploadAttempt } |
  { readonly ok: false; readonly reason: 'busy' | 'disposed' | 'contract_dependency' | 'user_action' | 'already_succeeded' };
