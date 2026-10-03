import { classifyFailure } from '@/shared/api/api-failure';
import type { ApiClient, ApiResult, GetRequest, JsonObject, QueryParams } from '@/shared/api/http-client';
import { id, parseConsent, parseConsents, parseCustomers, parseNotice, parseOwners, parseReception, parseReceptionDetail, parseReceptions, parseVehicles } from './reception-contract';
import { validReceptionBody } from './reception-create-form';
import { RECEPTION_ACCEPTANCE } from './reception-acceptance';
import { parseActiveMedia, parseAttachedSignature, parseClosedReception, parseUploadSession } from './reception-workflow-contract';
export interface ReceptionFilters {
    readonly status?: 'open' | 'closed';
    readonly vehicleId?: string;
    readonly customerId?: string;
}
export function createReceptionApi(client: ApiClient, tenantId: string, signal: AbortSignal) {
    const base = { tenantId, signal, tokenPolicy: 'cached' as const };
    async function get<T>(path: string, parse: (body: unknown) => T | null, query?: QueryParams): Promise<ApiResult<T>> {
        const request: GetRequest = { ...base, path, ...(query === undefined ? {} : { query }) };
        const result = await client.getJson(request, parse);
        return !result.ok && result.failure.kind === 'unauthenticated' && !signal.aborted
            ? client.getJson({ ...request, tokenPolicy: 'fresh' }, parse) : result;
    }
    function validIds(...values: readonly (string | undefined)[]) { return values.every((v) => v === undefined || id(v) !== null); }
    function bad<T>(): Promise<ApiResult<T>> { return Promise.resolve({ ok: false, failure: classifyFailure({ source: 'client', reason: 'client_bug' }) }); }
    const context = (local?: AbortSignal) => ({ ...base, signal: local === undefined ? signal : AbortSignal.any([signal, local]) });
    return {
        createSignatureUpload: (size: number, key: string, local: AbortSignal) => client.postJson({ ...context(local), path: '/api/v1/media/upload-sessions', body: { mediaType: 'signature', mimeType: 'image/png', retentionClass: 'authorization_evidence', idempotencyKey: key, expectedSizeBytes: size } }, parseUploadSession),
        completeSignatureUpload: (sessionId: string, mediaId: string, local: AbortSignal) => !validIds(sessionId, mediaId) ? bad<NonNullable<ReturnType<typeof parseActiveMedia>>>() : client.postJson({ ...context(local), path: `/api/v1/media/upload-sessions/${sessionId}/complete`, body: {} }, value => { const data = parseActiveMedia(value); return data?.mediaAssetId === mediaId ? data : null; }),
        attachSignature: (receptionId: string, mediaId: string, name: string, document: string | null, local: AbortSignal) => !validIds(receptionId, mediaId) || !name.trim() || name.length > 200 || (document !== null && document.length > 60) ? bad<NonNullable<ReturnType<typeof parseAttachedSignature>>>() : client.postJson({ ...context(local), path: `/api/v1/receptions/${receptionId}/signature`, body: { signatureMediaId: mediaId, signedByName: name, signedByDocument: document, documentVersion: RECEPTION_ACCEPTANCE.documentVersion } }, value => { const data = parseAttachedSignature(value); return data?.receptionId === receptionId && data.signatureMediaId === mediaId && data.documentVersion === RECEPTION_ACCEPTANCE.documentVersion ? data : null; }),
        close: (receptionId: string, local: AbortSignal) => !validIds(receptionId) ? bad<NonNullable<ReturnType<typeof parseClosedReception>>>() : client.postCommand({ ...context(local), path: `/api/v1/receptions/${receptionId}/close` }, value => { const data = parseClosedReception(value); return data?.reception.id === receptionId ? data : null; }),
        list: (filters: ReceptionFilters = {}, cursor?: string) => !validIds(filters.vehicleId, filters.customerId) || (filters.status !== undefined && !['open', 'closed'].includes(filters.status)) || (cursor !== undefined && !cursor)
            ? bad<NonNullable<ReturnType<typeof parseReceptions>>>()
            : get('/api/v1/receptions', parseReceptions, { limit: 25, cursor, status: filters.status, vehicleId: filters.vehicleId, customerId: filters.customerId }),
        detail: (receptionId: string) => !validIds(receptionId) ? bad<NonNullable<ReturnType<typeof parseReceptionDetail>>>() : get(`/api/v1/receptions/${receptionId}`, (body) => { const data = parseReceptionDetail(body); return data?.receptionId === receptionId ? data : null; }),
        create: (body: JsonObject) => !validReceptionBody(body, false) ? bad<NonNullable<ReturnType<typeof parseReception>>>() : client.postJson({ ...base, path: '/api/v1/receptions', body }, (value) => { const data = parseReception(value); return data !== null && data.vehicleId === body['vehicleId'] && data.customerId === body['customerId'] ? data : null; }),
        patch: (receptionId: string, body: JsonObject) => !validIds(receptionId) || !validReceptionBody(body, true) ? bad<NonNullable<ReturnType<typeof parseReception>>>() : client.patchJson({ ...base, path: `/api/v1/receptions/${receptionId}`, body }, (value) => { const data = parseReception(value); return data?.receptionId === receptionId ? data : null; }),
        vehicles: (plate: string, cursor?: string) => get('/api/v1/vehicles', parseVehicles, { limit: 25, plate, cursor }),
        customers: (name: string, cursor?: string) => get('/api/v1/customers', parseCustomers, { limit: 25, name, cursor }),
        owners: (vehicleId: string) => !validIds(vehicleId) ? bad<NonNullable<ReturnType<typeof parseOwners>>>() : get(`/api/v1/vehicles/${vehicleId}/owners`, parseOwners),
        consents: async (customerId: string) => {
            if (!validIds(customerId))
                return bad<NonNullable<ReturnType<typeof parseConsents>>>();
            const result = await get(`/api/v1/customers/${customerId}/privacy-consents`, parseConsents, { status: 'granted', purposeCode: 'service_provision' });
            if (result.ok && (result.data.privacyConsents.length > 1 || result.data.privacyConsents.some((c) => c.customerId !== customerId || c.purposeCode !== 'service_provision')))
                return { ok: false, failure: classifyFailure({ source: 'contract' }) } as const;
            return result;
        },
        notice: () => get('/api/v1/privacy-notice', parseNotice, { purposeCode: 'service_provision' }),
        capture: (customerId: string, body: JsonObject) => !validIds(customerId) ? bad<NonNullable<ReturnType<typeof parseConsent>>>() : client.postJson({ ...base, path: `/api/v1/customers/${customerId}/privacy-consents`, body }, (value) => {
            const c = parseConsent(value);
            return c !== null && c.customerId === customerId && c.purposeCode === 'service_provision' ? c : null;
        }),
    };
}
export type ReceptionApi = ReturnType<typeof createReceptionApi>;
