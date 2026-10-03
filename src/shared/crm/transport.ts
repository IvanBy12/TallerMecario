import { classifyFailure } from '@/shared/api/api-failure';
import type { ApiClient, ApiResult, QueryParams } from '@/shared/api/http-client';
export function crmTransport(client: ApiClient, tenantId: string, signal: AbortSignal) {
  const base = { tenantId, signal, tokenPolicy: 'cached' as const };
  async function get<T>(path: string, parse: (body: unknown) => T | null, query?: QueryParams): Promise<ApiResult<T>> {
    const request = { ...base, path, ...(query === undefined ? {} : { query }) };
    const result = await client.getJson(request, parse);
    return !result.ok && result.failure.kind === 'unauthenticated' && !signal.aborted
      ? client.getJson({ ...request, tokenPolicy: 'fresh' }, parse) : result;
  }
  return { base, get };
}
export function badRequest<T>(): Promise<ApiResult<T>> {
  return Promise.resolve({ ok: false, failure: classifyFailure({ source: 'client', reason: 'client_bug' }) });
}
