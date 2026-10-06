/** In-memory selection only. The original File is ready for a future uploader.
 * IDs identify selections, never filenames/content. Repeated files are accepted
 * as separate selections. Preview URLs belong exclusively to thumbnail effects.
 */
export interface PhotoSelection {
  readonly id: string;
  readonly file: File;
}

/** Optional consumer policy; no canonical server limits are implied. */
export interface PhotoValidationPolicy {
  readonly allowedMimeTypes?: readonly string[];
  readonly maxBytes?: number;
  readonly maxFiles?: number;
}

export type PhotoIssueCode = 'invalid_file' | 'empty_file' | 'not_image' |
  'mime_not_allowed' | 'too_large' | 'too_many' | 'invalid_policy';
export interface PhotoIssue {
  /** One-based position in the latest batch; no file metadata or exceptions. */
  readonly position: number;
  readonly code: PhotoIssueCode;
}
export interface PhotoSelectionState {
  readonly photos: readonly PhotoSelection[];
  readonly issues: readonly PhotoIssue[];
}
