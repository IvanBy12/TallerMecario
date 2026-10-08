export type StorageMethodSupport = 'unsupported' | 'available';

/** An origin-wide browser estimate, not reserved space or media-specific usage. */
export type StorageQuotaEstimate =
  | { readonly status: 'unknown' }
  | {
    readonly status: 'known';
    /** Validated browser usage; may exceed quota. Only ratio is clamped. */
    readonly usageBytes: number;
    readonly quotaBytes: number;
    readonly ratio: number;
  };

export type StoragePersistenceStatus = 'unsupported' | 'unknown' | 'granted' | 'not_granted';

export interface BrowserStorageCapabilities {
  readonly support: 'unavailable' | 'available';
  readonly estimateSupport: StorageMethodSupport;
  readonly quota: StorageQuotaEstimate;
  readonly persistenceStatus: StoragePersistenceStatus;
  readonly persistenceRequestSupport: StorageMethodSupport;
}

/** Only the browser's explicit decision; no eviction guarantee or quota change. */
export interface StoragePersistenceResult {
  readonly status: StoragePersistenceStatus;
}

/** No default thresholds. Consumers must supply an approved policy. */
export interface StoragePressurePolicy {
  readonly warningRatio?: number;
  readonly criticalRatio?: number;
}

export type StoragePressure = 'unconfigured' | 'invalid_policy' | 'unknown' | 'normal' | 'warning' | 'critical';
