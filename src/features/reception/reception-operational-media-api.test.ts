// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createApiClient, type FetchLike, type FetchResponse } from '@/shared/api/http-client';
import { createUploadTask } from '@/shared/media/upload-task';
import type { StorageFetch } from '@/shared/media/media-types';
import type { UploadObserver } from '@/shared/media/upload-task-types';
import { CONFIRMED_MEDIA, MEDIA_ID, SESSION_ID, UPLOAD_DTO, UPLOAD_SESSION } from '@/test/media-fixtures';
import { createReceptionOperationalMediaApi, createReceptionOperationalMediaExecutor } from './reception-operational-media-api';
import type { ReceptionOperationalMediaInput } from './reception-operational-media-types';

const RECEPTION_ID = 'c3333333-3333-4333-8333-333333333333';
const TENANT_ID = 'd4444444-4444-4444-8444-444444444444';
const KEY = 'e5555555-5555-4555-8555-555555555555';
const time = '2026-10-09T12:00:00.123456Z';
const dto = { mediaAssetId: MEDIA_ID, mediaType: 'photo', mimeType: 'image/png',
  sizeBytes: 3, capturedAt: time, uploadedAt: time, purpose: 'intake_evidence', sortOrder: 0 };
const input: ReceptionOperationalMediaInput = { receptionId: RECEPTION_ID, mediaType: 'photo',
  mimeType: 'image/png', expectedSizeBytes: 3, idempotencyKey: KEY };
const blob = new Blob(['abc'], { type: 'image/png' });
const observer = () => ({ onPhase: vi.fn(), onDispatch: vi.fn(), onProgress: vi.fn() }) satisfies UploadObserver;
function requestBody(body: unknown): string {
  if (typeof body !== 'string') throw new Error('Expected JSON request body');
  return body;
}
function response(data: unknown, status = 200): FetchResponse {
  return { ok: status >= 200 && status < 300, status, type: 'basic', redirected: false,
    headers: { get: () => null }, json: () => Promise.resolve(data) };
}
function setup() {
  const context = new AbortController(), local = new AbortController();
  const getToken = vi.fn(() => Promise.resolve({ kind: 'token' as const, token: 'synthetic-token' }));
  const fetchImpl = vi.fn<FetchLike>((url, init) => Promise.resolve(response(
    url.endsWith('/upload-sessions') ? { ...UPLOAD_DTO, uploadHeaders: { 'Content-Type': 'image/png', 'If-None-Match': '*' } } :
      url.endsWith('/complete') ? CONFIRMED_MEDIA :
        url.endsWith('/download-url') ? { mediaAssetId: MEDIA_ID, downloadUrl: UPLOAD_SESSION.uploadUrl, expiresAt: time } :
          init.method === 'POST' ? { media: dto } : { media: [dto] })));
  const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken, fetchImpl });
  const storageFetch = vi.fn<StorageFetch>(() => Promise.resolve({ ok: true, status: 200, redirected: false, type: 'basic' }));
  const executor = createReceptionOperationalMediaExecutor({ client, tenantId: TENANT_ID, signal: context.signal, storageFetch });
  const api = createReceptionOperationalMediaApi(client, TENANT_ID, context.signal);
  return { context, local, getToken, fetchImpl, storageFetch, executor, api };
}

describe('production reception upload executor', () => {
  it.each([
    ['photo', 'image/png'], ['video', 'video/mp4'], ['video360', 'video/quicktime'],
  ] as const)('creates exact operational %s request, PUTs directly, completes active without attaching', async (mediaType, mimeType) => {
    const h = setup(), seen = observer();
    const value = { ...input, mediaType, mimeType, capturedAt: '2026-10-09T07:00:00.123456-05:00',
      tenantId: 'forbidden', customerId: 'forbidden', privacyConsentId: 'forbidden', consentId: 'forbidden',
      purpose: 'forbidden', objectKey: 'forbidden', bucket: 'forbidden', uploadUrl: 'forbidden', sortOrder: 99 };
    expect(await h.executor.upload(value, blob, h.local.signal, seen)).toEqual({ ok: true, data: CONFIRMED_MEDIA });
    expect(h.fetchImpl).toHaveBeenCalledTimes(2);
    const [createUrl, createInit] = h.fetchImpl.mock.calls[0] ?? [];
    expect(createUrl).toBe('https://api.example.test/api/v1/media/upload-sessions');
    expect(createInit?.method).toBe('POST');
    expect(JSON.parse(requestBody(createInit?.body))).toEqual({ mediaType, mimeType, retentionClass: 'operational',
      idempotencyKey: KEY, expectedSizeBytes: 3, capturedAt: value.capturedAt,
      operationalContext: { type: 'reception', receptionId: RECEPTION_ID } });
    const [completeUrl, completeInit] = h.fetchImpl.mock.calls[1] ?? [];
    expect(completeUrl).toBe(`https://api.example.test/api/v1/media/upload-sessions/${SESSION_ID}/complete`);
    expect(completeInit?.method).toBe('POST'); expect(completeInit?.body).toBe('{}');
    for (const [, init] of h.fetchImpl.mock.calls) {
      expect(init.headers).toMatchObject({ Authorization: 'Bearer synthetic-token', 'X-Tenant-Id': TENANT_ID });
      expect(init.cache).toBe('no-store');
      expect(requestBody(init.body)).not.toMatch(/tenantId|customerId|consentId|privacyConsentId|purpose|objectKey|bucket|uploadUrl|sortOrder/);
    }
    const [storageUrl, storageInit] = h.storageFetch.mock.calls[0] ?? [];
    expect(storageUrl).toBe(UPLOAD_SESSION.uploadUrl);
    expect(storageInit).toMatchObject({ method: 'PUT', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' } });
    expect(storageInit?.headers).not.toHaveProperty('Authorization');
    expect(storageInit?.headers).not.toHaveProperty('X-Tenant-Id');
    expect(storageInit?.body).toBeInstanceOf(Blob);
    expect(h.fetchImpl.mock.invocationCallOrder[0]).toBeLessThan(h.storageFetch.mock.invocationCallOrder[0] ?? 0);
    expect(h.storageFetch.mock.invocationCallOrder[0]).toBeLessThan(h.fetchImpl.mock.invocationCallOrder[1] ?? 0);
    expect(seen.onPhase.mock.calls.flat()).toEqual(['preparing', 'uploading', 'completing']);
  });
  it('omits capturedAt when absent', async () => {
    const h = setup(); await h.executor.upload(input, blob, h.local.signal, observer());
    const body: unknown = JSON.parse(requestBody(h.fetchImpl.mock.calls[0]?.[1].body));
    expect(body).not.toHaveProperty('capturedAt');
  });
  it.each([
    { receptionId: '../other' }, { receptionId: 'bad' }, { receptionId: RECEPTION_ID.toUpperCase() },
    { receptionId: '00000000-0000-0000-0000-000000000000' }, { idempotencyKey: 'bad' },
    { mediaType: 'signature' }, { mediaType: 'unknown' }, { expectedSizeBytes: 0 },
    { expectedSizeBytes: -1 }, { expectedSizeBytes: 1.5 }, { expectedSizeBytes: Infinity },
    { expectedSizeBytes: Number.MAX_SAFE_INTEGER + 1 }, { mimeType: '' }, { mimeType: 'image/png\r\nprivate' },
    { capturedAt: 'bad' }, { capturedAt: '2026-02-30T12:00:00Z' },
  ])('rejects malformed upload input locally %#', async change => {
    const h = setup();
    // Deliberately malformed wire caller; production TypeScript rejects invalid enums.
    const value: ReceptionOperationalMediaInput = { ...input };
    Object.assign(value, change);
    expect(await h.executor.upload(value, blob, h.local.signal, observer())).toMatchObject({ ok: false,
      failure: { source: 'api', stage: 'create', failure: { kind: 'client_bug' } } });
    expect(h.getToken).not.toHaveBeenCalled(); expect(h.fetchImpl).not.toHaveBeenCalled();
    expect(h.storageFetch).not.toHaveBeenCalled();
  });
  it.each(['pending', 'uploaded', 'quarantined', 'deleted'])('PUT success plus completion %s never confirms upload', async status => {
    const h = setup(); h.fetchImpl.mockResolvedValueOnce(response(UPLOAD_DTO))
      .mockResolvedValueOnce(response({ ...CONFIRMED_MEDIA, status }));
    expect(await h.executor.upload(input, blob, h.local.signal, observer())).toEqual({ ok: false,
      failure: { source: 'contract', kind: 'invalid_completion' } });
    expect(h.storageFetch).toHaveBeenCalledTimes(1); expect(h.fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('rejects completion of a different asset', async () => {
    const h = setup(); h.fetchImpl.mockResolvedValueOnce(response(UPLOAD_DTO))
      .mockResolvedValueOnce(response({ ...CONFIRMED_MEDIA, mediaAssetId: SESSION_ID }));
    expect(await h.executor.upload(input, blob, h.local.signal, observer())).toMatchObject({ ok: false,
      failure: { source: 'contract', kind: 'invalid_completion' } });
  });
  it('invalid signed session prevents storage dispatch and leaks no target', async () => {
    const h = setup(); h.fetchImpl.mockResolvedValue(response({ ...UPLOAD_DTO, uploadUrl: 'http://unsafe.test/object' }));
    const result = await h.executor.upload(input, blob, h.local.signal, observer());
    expect(result).toEqual({ ok: false, failure: { source: 'contract', kind: 'invalid_upload_session' } });
    expect(h.storageFetch).not.toHaveBeenCalled(); expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/private|unsafe|uploadUrl|objectKey/);
  });
  it.each(['create', 'complete', 'storage'] as const)('sanitizes %s failure, preserves safe requestId and never retries', async stage => {
    const h = setup();
    const error = { error: { code: 'MEDIA_METADATA_MISMATCH', request_id: 'safe-reference',
      message: UPLOAD_SESSION.uploadUrl + UPLOAD_DTO.objectKey } };
    if (stage === 'create') h.fetchImpl.mockResolvedValue(response(error, 409));
    if (stage === 'complete') h.fetchImpl.mockResolvedValueOnce(response(UPLOAD_DTO)).mockResolvedValueOnce(response(error, 409));
    if (stage === 'storage') h.storageFetch.mockRejectedValue(new Error(error.error.message));
    const result = await h.executor.upload(input, blob, h.local.signal, observer());
    expect(result.ok).toBe(false);
    if (stage !== 'storage') expect(result).toMatchObject({ failure: { source: 'api', stage,
      failure: { code: 'MEDIA_METADATA_MISMATCH', requestId: 'safe-reference' } } });
    expect(JSON.stringify(result)).not.toMatch(/presigned|private\/|uploadUrl|objectKey|message/);
    expect(h.fetchImpl).toHaveBeenCalledTimes(stage === 'complete' ? 2 : 1);
    expect(h.storageFetch).toHaveBeenCalledTimes(stage === 'create' ? 0 : 1);
  });
  it('keeps F04 ambiguous complete state and forbids blind task restart', async () => {
    const h = setup(); h.fetchImpl.mockResolvedValueOnce(response(UPLOAD_DTO)).mockRejectedValueOnce(new Error('private'));
    const task = createUploadTask(h.executor);
    const attempt = task.start(input, blob); if (!attempt.ok) throw new Error('Expected start');
    await attempt.attempt.done;
    expect(task.getState()).toMatchObject({ phase: 'ambiguous', recovery: { kind: 'contract_dependency', reason: 'reconciliation' } });
    expect(task.restart(input, blob)).toEqual({ ok: false, reason: 'contract_dependency' });
    expect(h.fetchImpl).toHaveBeenCalledTimes(2); expect(h.storageFetch).toHaveBeenCalledTimes(1);
  });
  it.each(['context', 'local'] as const)('already aborted %s prevents all dispatch', async owner => {
    const h = setup(); h[owner].abort();
    expect(await h.executor.upload(input, blob, h.local.signal, observer())).toEqual({ ok: false,
      failure: { source: 'client', kind: 'aborted' } });
    expect(h.fetchImpl).not.toHaveBeenCalled(); expect(h.storageFetch).not.toHaveBeenCalled();
  });
  it.each(['create', 'storage', 'complete'] as const)('context abort during %s settles and discards late success', async stage => {
    const h = setup();
    if (stage === 'storage') h.storageFetch.mockImplementation(() => {
      h.context.abort(); return Promise.resolve({ ok: true, status: 200, redirected: false, type: 'basic' });
    });
    else h.fetchImpl.mockImplementation((url) => {
      if ((stage === 'create' && url.endsWith('/upload-sessions')) || (stage === 'complete' && url.endsWith('/complete'))) h.context.abort();
      return Promise.resolve(response(url.endsWith('/complete') ? CONFIRMED_MEDIA : UPLOAD_DTO));
    });
    expect(await h.executor.upload(input, blob, h.local.signal, observer())).toEqual({ ok: false,
      failure: { source: 'client', kind: 'aborted' } });
    expect(h.fetchImpl).toHaveBeenCalledTimes(stage === 'complete' ? 2 : 1);
    expect(h.storageFetch).toHaveBeenCalledTimes(stage === 'create' ? 0 : 1);
  });
});

describe('explicit reception association/read operations', () => {
  it.each([undefined, 0, 7, 2147483647])('attaches exact allowed body with sortOrder %s', async sortOrder => {
    const h = setup(), value = { mediaAssetId: MEDIA_ID, ...(sortOrder === undefined ? {} : { sortOrder }),
      purpose: 'forbidden', tenantId: 'forbidden', uploadUrl: 'forbidden', objectKey: 'forbidden',
      bucket: 'forbidden', customerId: 'forbidden', privacyConsentId: 'forbidden' };
    h.fetchImpl.mockResolvedValue(response({ media: { ...dto, sortOrder: sortOrder ?? 0 } }, 201));
    expect(await h.api.attach(RECEPTION_ID, value, h.local.signal)).toEqual({ ok: true, data: { media: { ...dto, sortOrder: sortOrder ?? 0 } } });
    const [url, init] = h.fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.example.test/api/v1/receptions/${RECEPTION_ID}/media`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(requestBody(init?.body))).toEqual({ mediaAssetId: MEDIA_ID, ...(sortOrder === undefined ? {} : { sortOrder }) });
    expect(h.fetchImpl).toHaveBeenCalledTimes(1); expect(h.storageFetch).not.toHaveBeenCalled();
  });
  it.each([-1, 1.5, 2147483648, Infinity, NaN])('rejects unsafe association sortOrder %s locally', async sortOrder => {
    const h = setup(); expect(await h.api.attach(RECEPTION_ID, { mediaAssetId: MEDIA_ID, sortOrder })).toMatchObject({ ok: false, failure: { kind: 'client_bug' } });
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['bad', '../path', '00000000-0000-0000-0000-000000000000'])('rejects malformed resource IDs locally %s', async value => {
    const h = setup();
    const results = await Promise.all([h.api.attach(value, { mediaAssetId: MEDIA_ID }),
      h.api.attach(RECEPTION_ID, { mediaAssetId: value }), h.api.list(value), h.api.download(value)]);
    for (const result of results) expect(result).toMatchObject({ ok: false, failure: { kind: 'client_bug' } });
    expect(h.getToken).not.toHaveBeenCalled(); expect(h.fetchImpl).not.toHaveBeenCalled();
  });
  it.each([{ mediaAssetId: SESSION_ID }, { sortOrder: 1 }, { purpose: 'unknown' }])('rejects mismatched/invalid association response %#', async change => {
    const h = setup(); h.fetchImpl.mockResolvedValue(response({ media: { ...dto, ...change } }));
    expect(await h.api.attach(RECEPTION_ID, { mediaAssetId: MEDIA_ID })).toMatchObject({ ok: false, failure: { kind: 'contract_violation' } });
  });
  it('GETs list without query, preserving server order and projecting safe DTOs', async () => {
    const h = setup(), media = [{ ...dto, mediaAssetId: MEDIA_ID }, { ...dto, mediaAssetId: SESSION_ID, sortOrder: 1 }];
    h.fetchImpl.mockResolvedValue(response({ media: media.map(item => ({ ...item, objectKey: 'private' })) }));
    expect(await h.api.list(RECEPTION_ID)).toEqual({ ok: true, data: { media } });
    expect(h.fetchImpl.mock.calls[0]?.[0]).toBe(`https://api.example.test/api/v1/receptions/${RECEPTION_ID}/media`);
    expect(h.fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', cache: 'no-store', headers: { 'X-Tenant-Id': TENANT_ID } });
  });
  it('rejects the entire list when one item is malformed', async () => {
    const h = setup(); h.fetchImpl.mockResolvedValue(response({ media: [dto, { ...dto, purpose: 'unknown' }] }));
    expect(await h.api.list(RECEPTION_ID)).toMatchObject({ ok: false, failure: { kind: 'contract_violation' } });
  });
  it('requests a transient download URL for the exact media identity', async () => {
    const h = setup(); expect(await h.api.download(MEDIA_ID)).toEqual({ ok: true, data: {
      mediaAssetId: MEDIA_ID, downloadUrl: UPLOAD_SESSION.uploadUrl, expiresAt: time,
    } });
    expect(h.fetchImpl.mock.calls[0]?.[0]).toBe(`https://api.example.test/api/v1/media/${MEDIA_ID}/download-url`);
    expect(h.fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', cache: 'no-store' });
    expect(h.storageFetch).not.toHaveBeenCalled();
  });
  it.each([{ mediaAssetId: SESSION_ID }, { downloadUrl: 'http://unsafe.test' }, { expiresAt: 'invalid' }])('rejects unsafe/mismatched download response %#', async change => {
    const h = setup(); h.fetchImpl.mockResolvedValue(response({ mediaAssetId: MEDIA_ID,
      downloadUrl: UPLOAD_SESSION.uploadUrl, expiresAt: time, ...change }));
    const result = await h.api.download(MEDIA_ID);
    expect(result).toMatchObject({ ok: false, failure: { kind: 'contract_violation' } });
    expect(JSON.stringify(result)).not.toMatch(/presigned|downloadUrl|unsafe/);
  });
  it.each(['list', 'download'] as const)('refreshes token once for GET %s on 401', async operation => {
    const h = setup(); h.fetchImpl.mockResolvedValueOnce(response({ error: { code: 'UNAUTHENTICATED', request_id: 'safe-reference' } }, 401));
    const result = await (operation === 'list' ? h.api.list(RECEPTION_ID) : h.api.download(MEDIA_ID));
    expect(result.ok).toBe(true); expect(h.fetchImpl).toHaveBeenCalledTimes(2);
    expect(h.getToken.mock.calls).toEqual([[undefined], [{ skipCache: true }]]);
  });
  it.each(['attach', 'upload'] as const)('never automatically retries POST %s on 401', async operation => {
    const h = setup(); h.fetchImpl.mockResolvedValue(response({ error: { code: 'UNAUTHENTICATED', request_id: 'safe-reference' } }, 401));
    const result = await (operation === 'attach' ? h.api.attach(RECEPTION_ID, { mediaAssetId: MEDIA_ID }) : h.executor.upload(input, blob, h.local.signal, observer()));
    expect(result.ok).toBe(false); expect(h.fetchImpl).toHaveBeenCalledTimes(1);
    expect(h.getToken).toHaveBeenCalledTimes(1);
  });
  it('preserves association conflict code/requestId and never leaks backend messages or retries', async () => {
    const h = setup(); h.fetchImpl.mockResolvedValue(response({ error: { code: 'MEDIA_ASSOCIATION_CONFLICT',
      request_id: 'safe-reference', message: UPLOAD_SESSION.uploadUrl, objectKey: UPLOAD_DTO.objectKey } }, 409));
    expect(await h.api.attach(RECEPTION_ID, { mediaAssetId: MEDIA_ID })).toEqual({ ok: false,
      failure: { kind: 'unexpected_status', status: 409, code: 'MEDIA_ASSOCIATION_CONFLICT', requestId: 'safe-reference' } });
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each(['attach', 'list', 'download'] as const)('pre-aborted operation %s never dispatches', async operation => {
    const h = setup(); h.local.abort();
    const result = await (operation === 'attach' ? h.api.attach(RECEPTION_ID, { mediaAssetId: MEDIA_ID }, h.local.signal) :
      operation === 'list' ? h.api.list(RECEPTION_ID, h.local.signal) : h.api.download(MEDIA_ID, h.local.signal));
    expect(result).toMatchObject({ ok: false, failure: { kind: 'aborted' } });
    expect(h.fetchImpl).not.toHaveBeenCalled(); expect(h.getToken).not.toHaveBeenCalled();
  });
  it.each(['attach', 'list', 'download'] as const)('context cancellation during %s discards late DTO', async operation => {
    const h = setup(); h.fetchImpl.mockImplementation((_url, init) => {
      h.context.abort(); expect(init.signal?.aborted).toBe(true);
      return Promise.resolve(response(operation === 'attach' ? { media: dto } :
        operation === 'list' ? { media: [dto] } : { mediaAssetId: MEDIA_ID, downloadUrl: UPLOAD_SESSION.uploadUrl, expiresAt: time }));
    });
    const result = await (operation === 'attach' ? h.api.attach(RECEPTION_ID, { mediaAssetId: MEDIA_ID }, h.local.signal) :
      operation === 'list' ? h.api.list(RECEPTION_ID, h.local.signal) : h.api.download(MEDIA_ID, h.local.signal));
    expect(result).toMatchObject({ ok: false, failure: { kind: 'aborted' } });
    expect(h.fetchImpl).toHaveBeenCalledTimes(1);
  });
});
