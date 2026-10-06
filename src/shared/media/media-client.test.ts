// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { classifyFailure } from '@/shared/api/api-failure';
import { createApiClient } from '@/shared/api/http-client';
import { CONFIRMED_MEDIA, MEDIA_ID, SESSION_ID, UPLOAD_DTO, UPLOAD_SESSION } from '@/test/media-fixtures';
import { createMediaClient } from './media-client';
import type { MediaApiAdapter, StorageFetch } from './media-types';
import clientSource from './media-client.ts?raw';
import contractSource from './media-contract.ts?raw';
import errorSource from './media-errors.ts?raw';
import uploadSource from './media-upload.ts?raw';
import typeSource from './media-types.ts?raw';

const payload = new Blob(['abc']);
function setup() {
  const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'private-token' }) });
  const api = {
    createUploadSession: vi.fn<MediaApiAdapter<undefined>['createUploadSession']>(() => Promise.resolve({ ok: true, data: UPLOAD_DTO })),
    completeUploadSession: vi.fn<MediaApiAdapter<undefined>['completeUploadSession']>(() => Promise.resolve({ ok: true, data: CONFIRMED_MEDIA })),
  };
  const storageFetch = vi.fn<StorageFetch>(() => Promise.resolve({ ok: true, status: 200, redirected: false, type: 'basic' }));
  return { client, api, storageFetch, media: createMediaClient({ client, api, storageFetch }) };
}

describe('generic media lifecycle', () => {
  it('creates, parses, PUTs, completes once and returns only confirmed fields', async () => {
    const h = setup(), signal = new AbortController().signal;
    h.api.completeUploadSession.mockResolvedValue({ ok: true, data: { ...CONFIRMED_MEDIA, objectKey: UPLOAD_DTO.objectKey, uploadUrl: UPLOAD_SESSION.uploadUrl } });
    expect(await h.media.upload(undefined, payload, signal)).toEqual({ ok: true, data: CONFIRMED_MEDIA });
    expect(h.api.createUploadSession).toHaveBeenCalledExactlyOnceWith(h.client, undefined, signal);
    expect(h.api.completeUploadSession).toHaveBeenCalledExactlyOnceWith(h.client, { uploadSessionId: SESSION_ID, mediaAssetId: MEDIA_ID }, signal);
    expect(h.api.createUploadSession.mock.invocationCallOrder[0]).toBeLessThan(h.storageFetch.mock.invocationCallOrder[0] ?? 0);
    expect(h.storageFetch.mock.invocationCallOrder[0]).toBeLessThan(h.api.completeUploadSession.mock.invocationCallOrder[0] ?? 0);
  });
  it('the authenticated API client supplies bearer/tenant headers only to API calls, never storage', async () => {
    const apiCalls: RequestInit[] = [];
    const getToken = vi.fn(() => Promise.resolve({ kind: 'token' as const, token: 'private-token' }));
    const client = createApiClient({
      apiOrigin: 'https://api.example.test', getToken,
      fetchImpl: (_url, init) => {
        apiCalls.push(init);
        return Promise.resolve({ status: 200, ok: true, type: 'basic', redirected: false,
          headers: { get: () => null }, json: () => Promise.resolve(apiCalls.length === 1 ? UPLOAD_DTO : CONFIRMED_MEDIA) });
      },
    });
    // Synthetic test-only adapter: this does not declare a product endpoint/body.
    const api: MediaApiAdapter<undefined> = {
      createUploadSession: (authenticated, _input, signal) => authenticated.postJson({
        path: '/api/v1/prueba', body: {}, tenantId: MEDIA_ID, tokenPolicy: 'cached', signal,
      }, value => value),
      completeUploadSession: (authenticated, _identity, signal) => authenticated.postJson({
        path: '/api/v1/prueba', body: {}, tenantId: MEDIA_ID, tokenPolicy: 'cached', signal,
      }, value => value),
    };
    const storageFetch = vi.fn<StorageFetch>(() => Promise.resolve({ status: 200, ok: true, type: 'basic', redirected: false }));
    const media = createMediaClient({ client, api, storageFetch });
    expect(await media.upload(undefined, payload, new AbortController().signal)).toEqual({ ok: true, data: CONFIRMED_MEDIA });
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(apiCalls).toHaveLength(2);
    for (const init of apiCalls) {
      expect(init.headers).toEqual({ Authorization: 'Bearer private-token', Accept: 'application/json', 'Content-Type': 'application/json', 'X-Tenant-Id': MEDIA_ID });
    }
    expect(storageFetch.mock.calls[0]?.[1].headers).toEqual(UPLOAD_SESSION.uploadHeaders);
    expect(storageFetch).toHaveBeenCalledTimes(1);
  });
  it.each(['create', 'complete'] as const)('preserves authenticated API failure at %s without storage classification or retries', async stage => {
    const h = setup();
    const failure = classifyFailure({ source: 'http', status: 403, code: 'PERMISSION_DENIED', requestId: 'safe-reference', retryAfterSeconds: null });
    if (stage === 'create') h.api.createUploadSession.mockResolvedValue({ ok: false, failure });
    else h.api.completeUploadSession.mockResolvedValue({ ok: false, failure });
    expect(await h.media.upload(undefined, payload, new AbortController().signal)).toEqual({ ok: false, failure: { source: 'api', stage, failure } });
    expect(h.api.createUploadSession).toHaveBeenCalledTimes(1);
    expect(h.storageFetch).toHaveBeenCalledTimes(stage === 'create' ? 0 : 1);
    expect(h.api.completeUploadSession).toHaveBeenCalledTimes(stage === 'create' ? 0 : 1);
  });
  it('invalid session prevents PUT and completion', async () => {
    const h = setup();
    h.api.createUploadSession.mockResolvedValue({ ok: true, data: { ...UPLOAD_DTO, uploadUrl: 'http://unsafe.test' } });
    expect(await h.media.upload(undefined, payload, new AbortController().signal)).toEqual({ ok: false, failure: { source: 'contract', kind: 'invalid_upload_session' } });
    expect(h.storageFetch).not.toHaveBeenCalled(); expect(h.api.completeUploadSession).not.toHaveBeenCalled();
  });
  it('storage 403 prevents completion and remains distinct from API RBAC', async () => {
    const h = setup();
    h.storageFetch.mockResolvedValue({ ok: false, status: 403, redirected: false, type: 'basic' });
    expect(await h.media.upload(undefined, payload, new AbortController().signal)).toEqual({ ok: false, failure: { source: 'storage', kind: 'signed_url_rejected', status: 403 } });
    expect(h.api.completeUploadSession).not.toHaveBeenCalled(); expect(h.storageFetch).toHaveBeenCalledTimes(1);
  });
  it.each([{ ...CONFIRMED_MEDIA, mediaAssetId: SESSION_ID }, { ...CONFIRMED_MEDIA, status: 'pending' }, null])('rejects mismatched or unconfirmed completion %#', async data => {
    const h = setup(); h.api.completeUploadSession.mockResolvedValue({ ok: true, data });
    expect(await h.media.upload(undefined, payload, new AbortController().signal)).toEqual({ ok: false, failure: { source: 'contract', kind: 'invalid_completion' } });
  });
  it('already aborted lifecycle makes no API or storage calls', async () => {
    const h = setup(), controller = new AbortController(); controller.abort();
    expect(await h.media.upload(undefined, payload, controller.signal)).toMatchObject({ ok: false, failure: { kind: 'aborted' } });
    expect(h.api.createUploadSession).not.toHaveBeenCalled(); expect(h.storageFetch).not.toHaveBeenCalled();
    expect(h.api.completeUploadSession).not.toHaveBeenCalled();
  });
  it('abort during PUT prevents completion', async () => {
    const h = setup(), controller = new AbortController();
    h.storageFetch.mockImplementation(() => { controller.abort(); return Promise.resolve({ ok: true, status: 200, redirected: false, type: 'basic' }); });
    expect(await h.media.upload(undefined, payload, controller.signal)).toMatchObject({ ok: false, failure: { kind: 'aborted' } });
    expect(h.api.completeUploadSession).not.toHaveBeenCalled();
  });
  it.each(['create', 'complete'] as const)('abort during %s discards the stale API result', async stage => {
    const h = setup(), controller = new AbortController();
    if (stage === 'create') h.api.createUploadSession.mockImplementation(() => { controller.abort(); return Promise.resolve({ ok: true, data: UPLOAD_DTO }); });
    else h.api.completeUploadSession.mockImplementation(() => { controller.abort(); return Promise.resolve({ ok: true, data: CONFIRMED_MEDIA }); });
    expect(await h.media.upload(undefined, payload, controller.signal)).toMatchObject({ ok: false, failure: { kind: 'aborted' } });
    expect(h.storageFetch).toHaveBeenCalledTimes(stage === 'create' ? 0 : 1);
  });
  it('abort after completed lifecycle does not change the confirmed result', async () => {
    const h = setup(), controller = new AbortController();
    const result = await h.media.upload(undefined, payload, controller.signal);
    controller.abort(); expect(result).toEqual({ ok: true, data: CONFIRMED_MEDIA });
  });
  it('the generic implementation has no reception coupling, media enum values, MIME/size limits or endpoint paths', () => {
    const source = [clientSource, contractSource, errorSource, uploadSource, typeSource].join('\n');
    expect(source).not.toMatch(/signature|reception|image\/png|authorization_evidence|retentionClass|mediaType|\/api\/v1\//i);
  });
});
