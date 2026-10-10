import type { UploadExecutor } from '@/shared/media/upload-task-types';
import type { createReceptionOperationalMediaApi } from './reception-operational-media-api';
import type { ReceptionOperationalMediaInput } from './reception-operational-media-types';

export type ReceptionMediaCapability = { readonly kind: 'unavailable' } | {
  readonly kind: 'available';
  readonly executor: UploadExecutor<ReceptionOperationalMediaInput>;
  readonly attach: ReturnType<typeof createReceptionOperationalMediaApi>['attach'];
  /** Called on accepted selection, outside render. Transient and never persisted. */
  readonly createIdempotencyKey?: () => string;
};
