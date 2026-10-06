import { parseUploadTarget } from './media-contract';
import { classifyStorageStatus, storageFailure } from './media-errors';
import type { StorageFetch, StorageResult, UploadSession } from './media-types';

const ABORTED = Symbol('aborted');
const isAborted = (signal: AbortSignal) => signal.aborted;

/** Direct, single-attempt PUT. This transport has no authenticated API dependency. */
export async function putMedia(
  session: UploadSession,
  blob: Blob,
  signal: AbortSignal,
  send: StorageFetch = fetch,
): Promise<StorageResult> {
  if (isAborted(signal)) return { ok: false, failure: storageFailure('aborted') };
  const target = parseUploadTarget(session.uploadUrl, session.uploadHeaders);
  const expiresAt = Date.parse(session.expiresAt);
  if (target === null || !Number.isFinite(expiresAt)) {
    return { ok: false, failure: storageFailure('invalid_upload_target') };
  }

  let onAbort = () => {};
  const aborted = new Promise<typeof ABORTED>(resolve => {
    onAbort = () => { resolve(ABORTED); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const response = await Promise.race([send(target.uploadUrl, {
      method: 'PUT', headers: target.uploadHeaders,
      // Strip File/Blob's MIME so Fetch cannot insert an unsigned Content-Type.
      // An explicit signed Content-Type remains exactly as issued by the session.
      body: blob.slice(0, blob.size, ''),
      credentials: 'omit', redirect: 'error', signal,
    }), aborted]);
    if (response === ABORTED || isAborted(signal)) return { ok: false, failure: storageFailure('aborted') };
    // Never read storage bodies, including arbitrary error XML/JSON.
    if (response.redirected || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      return { ok: false, failure: storageFailure('unexpected_redirect', response.status) };
    }
    return response.ok ? { ok: true, data: null } : { ok: false, failure: classifyStorageStatus(response.status) };
  } catch {
    return { ok: false, failure: storageFailure(isAborted(signal) ? 'aborted' : 'network') };
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
