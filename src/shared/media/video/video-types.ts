/** One ready video in memory. IDs identify attempts, never filenames.
 * Original File unchanged; URLs belong only to local presentation resources.
 * One video is a local UX choice, not a canonical backend count limit.
 */
export interface VideoSelection {
  readonly id: string;
  readonly file: File;
  readonly durationSeconds: number;
}

/** Optional consumer policy; no product/server MIME, size or duration defaults. */
export interface VideoValidationPolicy {
  readonly allowedMimeTypes?: readonly string[];
  readonly maxBytes?: number;
  readonly maxDurationSeconds?: number;
}

export type VideoIssueCode = 'invalid_policy' | 'invalid_file' | 'empty_file' |
  'not_video' | 'mime_not_allowed' | 'too_large' | 'metadata_unavailable' |
  'invalid_duration' | 'too_long';

export interface VideoSelectionState {
  /** Last accepted selection stays ready during replacement/rejection. */
  readonly video: VideoSelection | null;
  /** Latest attempt. File/policy validation is synchronous before metadata. */
  readonly status: 'idle' | 'metadata_loading' | 'ready' | 'rejected';
  readonly issue: VideoIssueCode | null;
}
