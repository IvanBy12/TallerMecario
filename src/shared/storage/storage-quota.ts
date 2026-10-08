import type { StoragePressure, StoragePressurePolicy, StorageQuotaEstimate } from './storage-types';

/** Discards all browser details except validated origin usage/quota. */
export function parseStorageQuota(value: unknown): StorageQuotaEstimate {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return { status: 'unknown' };
    const usage = 'usage' in value ? value.usage : undefined;
    const quota = 'quota' in value ? value.quota : undefined;
    if (typeof usage !== 'number' || !Number.isFinite(usage) || usage < 0
      || typeof quota !== 'number' || !Number.isFinite(quota) || quota <= 0) return { status: 'unknown' };
    return { status: 'known', usageBytes: usage, quotaBytes: quota, ratio: Math.min(usage / quota, 1) };
  } catch {
    return { status: 'unknown' };
  }
}

/** Inclusive thresholds; critical takes precedence. Invalid policies never warn. */
export function evaluateStoragePressure(
  estimate: StorageQuotaEstimate,
  policy?: StoragePressurePolicy,
): StoragePressure {
  try {
    if (policy === undefined) return 'unconfigured';
    if (typeof policy !== 'object' || Array.isArray(policy)) return 'invalid_policy';
    const { warningRatio, criticalRatio } = policy;
    for (const threshold of [warningRatio, criticalRatio]) {
      if (threshold !== undefined
        && (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0 || threshold > 1)) {
        return 'invalid_policy';
      }
    }
    if (warningRatio === undefined && criticalRatio === undefined) return 'unconfigured';
    if (warningRatio !== undefined && criticalRatio !== undefined && warningRatio > criticalRatio) {
      return 'invalid_policy';
    }
    if (estimate.status === 'unknown') return 'unknown';
    if (criticalRatio !== undefined && estimate.ratio >= criticalRatio) return 'critical';
    if (warningRatio !== undefined && estimate.ratio >= warningRatio) return 'warning';
    return 'normal';
  } catch {
    return 'invalid_policy';
  }
}
