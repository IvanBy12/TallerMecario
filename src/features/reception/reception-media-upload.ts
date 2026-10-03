import { classifyFailure } from '@/shared/api/api-failure';
import type { ApiResult, FetchLike } from '@/shared/api/http-client';
import type { UploadSession } from './reception-workflow-contract';
const isAborted = (signal: AbortSignal) => signal.aborted;
// Storage requests never pass through the authenticated API client.
export async function putSignature(session: UploadSession, blob: Blob, signal: AbortSignal, send: FetchLike = fetch): Promise<ApiResult<null>> {
    if (isAborted(signal)) return { ok: false, failure: classifyFailure({ source: 'transport', reason: 'aborted' }) };
    try {
        const response = await send(session.uploadUrl, { method: 'PUT', headers: session.uploadHeaders, body: blob,
            credentials: 'omit', redirect: 'error', signal });
        if (isAborted(signal)) return { ok: false, failure: classifyFailure({ source: 'transport', reason: 'aborted' }) };
        // Never read or expose storage error bodies, URLs or object keys.
        return response.ok && !response.redirected ? { ok: true, data: null } :
            { ok: false, failure: classifyFailure({ source: 'transport', reason: 'network' }) };
    } catch {
        return { ok: false, failure: classifyFailure({ source: 'transport', reason: isAborted(signal) ? 'aborted' : 'network' }) };
    }
}
