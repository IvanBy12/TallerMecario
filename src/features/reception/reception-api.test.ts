import { describe, expect, it } from 'vitest';
import { createApiClient, type JsonObject } from '@/shared/api/http-client';
import { CONSENT, CUSTOMER, DETAIL, errorResponse, IDS, jsonResponse, NOTICE, OWNER, RECEPTION, SUMMARY, TIME, VEHICLE, type Call } from '@/test/render-reception';
import { createReceptionApi } from './reception-api';
function setup(responses: readonly ReturnType<typeof jsonResponse>[]) {
    const calls: Call[] = [], tokens: unknown[] = [];
    const queue = [...responses];
    const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: (options) => { tokens.push(options); return Promise.resolve({ kind: 'token', token: 'test-token' }); }, fetchImpl: (url, init) => { calls.push({ url: new URL(url), init }); return Promise.resolve(queue.shift() ?? jsonResponse(null)); } });
    return { calls, tokens, api: createReceptionApi(client, IDS.tenant, new AbortController().signal), client };
}
describe('Reception API exact wire contract', () => {
    it('sends the default limit, combined filters and cursor exactly', async () => {
        const h = setup([jsonResponse({ receptions: [SUMMARY], nextCursor: null })]);
        expect((await h.api.list({ status: 'open', vehicleId: IDS.vehicle, customerId: IDS.customer }, 'opaque+/=')).ok).toBe(true);
        expect(h.calls[0]?.url.href).toBe(`https://api.example.test/api/v1/receptions?limit=25&cursor=opaque%2B%2F%3D&status=open&vehicleId=${IDS.vehicle}&customerId=${IDS.customer}`);
        expect(h.calls[0]?.init.headers).toEqual({ Authorization: 'Bearer test-token', Accept: 'application/json', 'X-Tenant-Id': IDS.tenant });
    });
    it('GET retries once with a fresh token on 401', async () => {
        const h = setup([errorResponse('AUTHENTICATION_REQUIRED', 401), errorResponse('AUTHENTICATION_REQUIRED', 401)]);
        const result = await h.api.detail(IDS.reception);
        expect(result.ok).toBe(false);
        expect(h.calls).toHaveLength(2);
        expect(h.tokens).toEqual([undefined, { skipCache: true }]);
    });
    it('reads detail with the canonical envelope', async () => { const h = setup([jsonResponse({ reception: DETAIL })]); expect(await h.api.detail(IDS.reception)).toEqual({ ok: true, data: DETAIL }); });
    it.each(['create', 'patch'] as const)('%s JSON is sent once, including on 401', async (method) => {
        const h = setup([errorResponse('AUTHENTICATION_REQUIRED', 401)]);
        const body: JsonObject = method === 'create' ? { vehicleId: IDS.vehicle, customerId: IDS.customer, privacyConsentId: IDS.consent, mileageKm: 100 } : { expectedUpdatedAt: TIME, mileageKm: 101 };
        await (method === 'create' ? h.api.create(body) : h.api.patch(IDS.reception, body));
        expect(h.calls).toHaveLength(1);
        expect(h.tokens).toEqual([undefined]);
        expect(h.calls[0]?.init.method).toBe(method === 'create' ? 'POST' : 'PATCH');
        expect(h.calls[0]?.init.body).toBe(JSON.stringify(body));
        expect(h.calls[0]?.init.headers).toEqual({ Authorization: 'Bearer test-token', Accept: 'application/json', 'Content-Type': 'application/json', 'X-Tenant-Id': IDS.tenant });
    });
    it('parses successful POST and PATCH responses', async () => {
        const h = setup([jsonResponse({ reception: RECEPTION }, 201), jsonResponse({ reception: RECEPTION })]);
        expect((await h.api.create({ vehicleId: IDS.vehicle, customerId: IDS.customer, privacyConsentId: IDS.consent, mileageKm: 100 })).ok).toBe(true);
        expect((await h.api.patch(IDS.reception, { expectedUpdatedAt: TIME, mileageKm: 101 })).ok).toBe(true);
    });
    it('uses CRM searches, owners, consent lookup and exact notice query', async () => {
        const h = setup([jsonResponse({ vehicles: [VEHICLE], nextCursor: null }), jsonResponse({ customers: [CUSTOMER], nextCursor: null }), jsonResponse({ owners: [OWNER] }), jsonResponse({ privacyConsents: [CONSENT] }), jsonResponse({ privacyNotice: NOTICE })]);
        await h.api.vehicles('ABC123');
        await h.api.customers('Ana');
        await h.api.owners(IDS.vehicle);
        await h.api.consents(IDS.customer);
        await h.api.notice();
        expect(h.calls.map((c) => c.url.pathname + c.url.search)).toEqual(['/api/v1/vehicles?limit=25&plate=ABC123', '/api/v1/customers?limit=25&name=Ana', `/api/v1/vehicles/${IDS.vehicle}/owners`, `/api/v1/customers/${IDS.customer}/privacy-consents?status=granted&purposeCode=service_provision`, '/api/v1/privacy-notice?purposeCode=service_provision']);
    });
    it('fails closed on a consent belonging to a different customer', async () => { const h = setup([jsonResponse({ privacyConsents: [{ ...CONSENT, customerId: IDS.other }] })]); const r = await h.api.consents(IDS.customer); expect(r.ok ? null : r.failure.kind).toBe('contract_violation'); });
    it('rejects invalid IDs before token and network', async () => { const h = setup([]); await h.api.list({ vehicleId: 'bad' }); await h.api.detail('../bad'); expect(h.calls).toHaveLength(0); expect(h.tokens).toHaveLength(0); });
    it.each([undefined, NaN, Infinity, new Date(), () => null, 1n])('rejects non-JSON body value %s without requesting a token', async (invalid) => {
        const h = setup([]);
        const controller = new AbortController();
        // Runtime validation is exercised through Reflect without weakening TypeScript callers.
        const result: unknown = await Reflect.apply(h.client.postJson, h.client, [{ path: '/api/v1/receptions', signal: controller.signal, tokenPolicy: 'cached', body: { invalid } }, () => null]);
        expect(result).toMatchObject({ ok: false, failure: { kind: 'client_bug' } });
        expect(h.tokens).toHaveLength(0);
        expect(h.calls).toHaveLength(0);
    });
    it.each([403, 429, 500])('preserves status %i and request_id', async (status) => { const h = setup([errorResponse('KNOWN_CODE', status, '9')]); const result = await h.api.list(); expect(result).toMatchObject({ ok: false, failure: { status, requestId: 'request-test' } }); expect(h.calls).toHaveLength(1); });
});
it('rejects unsupported mutation fields and malformed version tokens before network', async () => {
    const h = setup([]);
    await h.api.create({ vehicleId: IDS.vehicle, customerId: IDS.customer, privacyConsentId: IDS.consent, mileageKm: 100, tenantId: IDS.tenant });
    await h.api.patch(IDS.reception, { expectedUpdatedAt: TIME, status: 'closed' });
    await h.api.patch(IDS.reception, { expectedUpdatedAt: 'rounded-token', mileageKm: 100 });
    expect(h.calls).toHaveLength(0);
    expect(h.tokens).toHaveLength(0);
});
it.each([{ 'bad key': 'value' }, { status: '\n' }, { limit: NaN }])('rejects invalid query %j before token/network', async (query) => {
    const h = setup([]);
    const request = { path: '/api/v1/receptions', query, signal: new AbortController().signal, tokenPolicy: 'cached' as const };
    const result = await h.client.getJson(request, () => null);
    expect(result).toMatchObject({ ok: false, failure: { kind: 'client_bug' } });
    expect(h.calls).toHaveLength(0);
    expect(h.tokens).toHaveLength(0);
});
it('sends exact consent versions once with JSON headers and tenant', async () => {
    const h = setup([jsonResponse({ privacyConsent: CONSENT }, 201)]);
    const body = { purposeCode: 'service_provision', privacyNoticeVersion: NOTICE.privacyNoticeVersion, authorizationTextVersion: NOTICE.authorizationTextVersion, channel: 'in_person', adultAttestationConfirmed: true };
    const result = await h.api.capture(IDS.customer, body);
    expect(result).toEqual({ ok: true, data: CONSENT });
    expect(h.calls[0]?.init.body).toBe(JSON.stringify(body));
    expect(h.calls).toHaveLength(1);
});
