import { parseStorageQuota } from './storage-quota';
import type {
  BrowserStorageCapabilities, StoragePersistenceResult, StoragePersistenceStatus, StorageQuotaEstimate,
} from './storage-types';

type BrowserStorageMethod = () => unknown;

/** Detection is deferred until each explicit call, including in SSR. */
function getBrowserStorage(): object | null {
  try {
    if (typeof navigator === 'undefined') return null;
    const storage: unknown = navigator.storage;
    return typeof storage === 'object' && storage !== null && !Array.isArray(storage) ? storage : null;
  } catch {
    return null;
  }
}

function getMethod(storage: object | null, name: 'estimate' | 'persisted' | 'persist'): BrowserStorageMethod | null {
  try {
    const method: unknown = storage ? Reflect.get(storage, name) : undefined;
    // Preserve the native receiver; partial support is detected independently.
    return typeof method === 'function' ? () => {
      const result: unknown = method.call(storage);
      return result;
    } : null;
  } catch {
    return null;
  }
}

async function readQuota(method: BrowserStorageMethod | null): Promise<StorageQuotaEstimate> {
  if (!method) return { status: 'unknown' };
  try {
    return parseStorageQuota(await method());
  } catch {
    return { status: 'unknown' };
  }
}

async function readPersistence(method: BrowserStorageMethod | null): Promise<StoragePersistenceStatus> {
  if (!method) return 'unsupported';
  try {
    const result = await method();
    if (result === true) return 'granted';
    if (result === false) return 'not_granted';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/** A fresh snapshot only: no retained state, automatic requests, polling or telemetry. */
export async function readBrowserStorageCapabilities(): Promise<BrowserStorageCapabilities> {
  const storage = getBrowserStorage();
  const estimate = getMethod(storage, 'estimate');
  const persisted = getMethod(storage, 'persisted');
  const persist = getMethod(storage, 'persist');
  const [quota, persistenceStatus] = await Promise.all([readQuota(estimate), readPersistence(persisted)]);
  return {
    support: storage ? 'available' : 'unavailable',
    estimateSupport: estimate ? 'available' : 'unsupported',
    quota,
    persistenceStatus,
    persistenceRequestSupport: persist ? 'available' : 'unsupported',
  };
}

/** Invoke from an explicit action. A denial is a valid decision; never retry automatically. */
export async function requestPersistence(): Promise<StoragePersistenceResult> {
  return { status: await readPersistence(getMethod(getBrowserStorage(), 'persist')) };
}
