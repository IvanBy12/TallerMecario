import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type FetchResponse } from '@/shared/api/http-client';
import type { MediaResult, StorageResponse } from '@/shared/media/media-types';
import type { UploadExecutor } from '@/shared/media/upload-task-types';
import { parseMediaSortOrder } from './reception-operational-media-contract';
import { id as parseId } from '@/shared/crm/contract';
import { CONFIRMED_MEDIA, MEDIA_ID, UPLOAD_DTO } from '@/test/media-fixtures';
import { CONSENT, DETAIL, IDS, NOTICE, OWNER, PERMISSIONS, RECEPTION, TIME, VEHICLE, errorResponse, jsonResponse, renderReception, type Call } from '@/test/render-reception';
import * as operational from './reception-operational-media-api';
import { NewReceptionPage } from './new-reception-page';
import { ReceptionProvider } from './reception-context';
import type { ReceptionMediaCapability } from './reception-media-capability';
import type { ReceptionOperationalMediaInput } from './reception-operational-media-types';

const permissions = [...PERMISSIONS, { code: 'media.upload', scopes: ['tenant'] }];
const photo = () => new File(['abc'], 'private-photo.jpg', { type: 'image/jpeg', lastModified: 1 });
const video = () => new File(['video'], 'private-video.mp4', { type: 'video/mp4', lastModified: 1 });
const body = (call: Call | undefined): unknown => typeof call?.init.body === 'string' ? JSON.parse(call.init.body) : null;
const click = (name: string | RegExp) => { fireEvent.click(screen.getByRole('button', { name })); };
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const linked = (input: { readonly mediaAssetId: string; readonly sortOrder?: number }) => ({ media: {
  mediaAssetId: input.mediaAssetId, sortOrder: input.sortOrder ?? 0, mediaType: 'photo', mimeType: 'image/jpeg',
  sizeBytes: 3, capturedAt: null, uploadedAt: TIME, purpose: 'intake_evidence',
} });
function defaults(call: Call): FetchResponse {
  const path = call.url.pathname;
  if (path.endsWith('/owners')) return jsonResponse({ owners: [OWNER] });
  if (path.endsWith('/privacy-consents')) return jsonResponse({ privacyConsents: [CONSENT] });
  if (path === '/api/v1/privacy-notice') return jsonResponse({ privacyNotice: NOTICE });
  if (path === '/api/v1/vehicles') return jsonResponse({ vehicles: [VEHICLE], nextCursor: null });
  if (path === '/api/v1/media/upload-sessions') return jsonResponse(UPLOAD_DTO, 201);
  if (path.endsWith('/complete')) return jsonResponse(CONFIRMED_MEDIA);
  if (path.endsWith('/media')) {
    if (typeof call.init.body !== 'string') throw new Error('Expected association JSON');
    const data: unknown = JSON.parse(call.init.body);
    if (typeof data !== 'object' || data === null || !('mediaAssetId' in data) || !('sortOrder' in data)) throw new Error('Expected association body');
    const mediaAssetId = parseId(data.mediaAssetId), sortOrder = parseMediaSortOrder(data.sortOrder);
    if (mediaAssetId === null || sortOrder === null) throw new Error('Expected association identity');
    return jsonResponse(linked({ mediaAssetId, sortOrder }));
  }
  return jsonResponse({ reception: call.init.method === 'POST' ? RECEPTION : DETAIL });
}
let revoke: ReturnType<typeof vi.fn>;
let storage: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<StorageResponse>>>;
let decoders: HTMLVideoElement[];
let uploads: ReturnType<typeof vi.fn<UploadExecutor<ReceptionOperationalMediaInput>['upload']>>[];
beforeEach(() => {
  decoders = []; uploads = []; revoke = vi.fn();
  let serial = 0;
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: vi.fn(() => `blob:orchestration-${String(++serial)}`), revokeObjectURL: revoke }));
  storage = vi.fn(() => Promise.resolve({ ok: true, status: 200, redirected: false, type: 'basic' }));
  vi.stubGlobal('fetch', storage);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) {
    if (this instanceof HTMLVideoElement && this.hasAttribute('src') && !this.isConnected) decoders.push(this);
  });
  const factory = operational.createReceptionOperationalMediaExecutor;
  vi.spyOn(operational, 'createReceptionOperationalMediaExecutor').mockImplementation(deps => {
    const real = factory(deps), upload = vi.fn<UploadExecutor<ReceptionOperationalMediaInput>['upload']>((...args) => real.upload(...args)); uploads.push(upload); return { upload };
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
async function prepare() {
  fireEvent.change(await screen.findByLabelText('Buscar vehículo por placa'), { target: { value: 'ABC123' } });
  click('Buscar vehículo'); fireEvent.click(await screen.findByRole('button', { name: /ABC123 —/ }));
  click('Consultar propietario vigente'); fireEvent.click(await screen.findByRole('button', { name: /Confirmar propietario/ }));
  await screen.findByText('Autorización vigente para la prestación del servicio.');
  fireEvent.change(screen.getByLabelText('Kilometraje (km)'), { target: { value: '101' } });
}
async function capture() {
  click('Mostrar aviso para capturar evidencia');
  fireEvent.click(await screen.findByLabelText('El propietario declara ser mayor de edad para la captura de evidencia.'));
  screen.getAllByLabelText('He leído este aviso').forEach(input => { fireEvent.click(input); });
}
function choosePhotos(files = [photo()]) { fireEvent.change(screen.getByLabelText('Seleccionar fotos'), { target: { files } }); }
async function chooseVideo(file = video()) {
  fireEvent.change(screen.getByLabelText('Seleccionar video'), { target: { files: [file] } });
  const decoder = decoders.at(-1); if (!decoder) throw new Error('Expected local decoder');
  Object.defineProperty(decoder, 'duration', { configurable: true, value: 10 });
  fireEvent.loadedMetadata(decoder); await flush();
}
const creates = (calls: readonly Call[]) => calls.filter(c => c.url.pathname === '/api/v1/receptions' && c.init.method === 'POST');
const mediaCalls = (calls: readonly Call[]) => calls.filter(c => c.url.pathname.includes('/media'));
async function createWithPhoto(respond: (call: Call) => FetchResponse | Promise<FetchResponse> = defaults) {
  const h = renderReception('/recepciones/nueva', respond, permissions);
  await prepare(); await capture(); const original = photo(); choosePhotos([original]); click('Crear recepción');
  await screen.findByText('Recepción creada. Ahora puedes completar la carga de la evidencia.');
  return { ...h, original };
}

describe('F07-B production post-create orchestration (synthetic HTTP/storage)', () => {
  it('no media: creates once and navigates without any media work', async () => {
    const h = renderReception('/recepciones/nueva', defaults, permissions); await prepare(); click('Crear recepción');
    await screen.findByRole('heading', { name: 'Detalle de recepción' });
    expect(creates(h.calls)).toHaveLength(1); expect(mediaCalls(h.calls)).toHaveLength(0); expect(storage).not.toHaveBeenCalled();
  });
  it('explicit discard: creates once, releases photo/video and performs zero media requests', async () => {
    const h = renderReception('/recepciones/nueva', defaults, permissions); await prepare(); await capture(); choosePhotos(); await chooseVideo();
    fireEvent.click(screen.getByLabelText(/Crear la recepción sin estos archivos locales/)); click('Crear recepción');
    await screen.findByRole('heading', { name: 'Detalle de recepción' });
    expect(creates(h.calls)).toHaveLength(1); expect(mediaCalls(h.calls)).toHaveLength(0); expect(storage).not.toHaveBeenCalled(); expect(revoke).toHaveBeenCalledTimes(2);
    expect(body(creates(h.calls)[0])).toEqual({ vehicleId: IDS.vehicle, customerId: IDS.customer, privacyConsentId: IDS.consent, mileageKm: 101, fuelLevelPct: null, customerNotes: null, advisorNotes: null });
  });
  it('photo stays the original File across delayed create; active is retained until canonical attach', async () => {
    const created = deferred<FetchResponse>(), attached = deferred<FetchResponse>();
    const h = renderReception('/recepciones/nueva', call => call.url.pathname === '/api/v1/receptions' && call.init.method === 'POST' ? created.promise : call.url.pathname.endsWith('/media') ? attached.promise : defaults(call), permissions);
    await prepare(); await capture(); const original = photo(); choosePhotos([original]); const preview = screen.getByRole('img').getAttribute('src');
    expect(screen.queryByRole('button', { name: /^Subir/ })).toBeNull(); expect(mediaCalls(h.calls)).toHaveLength(0);
    click('Crear recepción'); click('Crear recepción'); await flush();
    expect(creates(h.calls)).toHaveLength(1); expect(mediaCalls(h.calls)).toHaveLength(0); expect(storage).not.toHaveBeenCalled();
    act(() => { created.resolve(jsonResponse({ reception: RECEPTION }, 201)); }); await flush();
    expect(screen.getByRole('img').getAttribute('src')).toBe(preview); expect(revoke).not.toHaveBeenCalled();
    click('Subir foto 1'); await flush();
    expect(uploads[0]?.mock.calls[0]?.[1]).toBe(original);
    const input = uploads[0]?.mock.calls[0]?.[0];
    expect(input).toEqual({ receptionId: IDS.reception, mediaType: 'photo', mimeType: original.type, expectedSizeBytes: original.size, idempotencyKey: input?.idempotencyKey });
    expect(input?.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(screen.getByText('Carga activa. Asociando evidencia a la recepción…')).toBeDefined(); expect(screen.queryByText(/Evidencia guardada/)).toBeNull(); expect(revoke).not.toHaveBeenCalled();
    const attach = h.calls.find(c => c.url.pathname.endsWith('/media'));
    expect(body(attach)).toEqual({ mediaAssetId: MEDIA_ID, sortOrder: 0 });
    act(() => { attached.resolve(jsonResponse(linked({ mediaAssetId: MEDIA_ID, sortOrder: 0 }))); }); await flush();
    expect(screen.getByText('Foto 1 · Evidencia guardada')).toBeDefined(); expect(screen.queryByRole('img')).toBeNull(); expect(revoke).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('heading', { name: 'Detalle de recepción' })).toBeNull();
    click('Continuar a la recepción'); await screen.findByRole('heading', { name: 'Detalle de recepción' }); expect(creates(h.calls)).toHaveLength(1);
    expect(new Headers(storage.mock.calls[0]?.[1].headers).has('Authorization')).toBe(false);
    expect(storage.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT', credentials: 'omit', redirect: 'error' });
  });
  it('maps the original walk-around File to video360 and its actual size without capturedAt', async () => {
    const h = renderReception('/recepciones/nueva', defaults, permissions); await prepare(); await capture(); const original = video(); await chooseVideo(original);
    expect(mediaCalls(h.calls)).toHaveLength(0); click('Crear recepción'); await flush(); click('Subir video'); await flush();
    expect(uploads[0]?.mock.calls[0]?.[1]).toBe(original);
    expect(uploads[0]?.mock.calls[0]?.[0]).toMatchObject({ mediaType: 'video360', mimeType: original.type, expectedSizeBytes: original.size, receptionId: IDS.reception });
    expect(uploads[0]?.mock.calls[0]?.[0]).not.toHaveProperty('capturedAt'); expect(screen.getByText('Video · Evidencia guardada')).toBeDefined();
  });
  it('does not submit while video metadata is pending, including a forced form submission', async () => {
    const h = renderReception('/recepciones/nueva', defaults, permissions); await prepare(); await capture();
    fireEvent.change(screen.getByLabelText('Seleccionar video'), { target: { files: [video()] } });
    const submit = screen.getByRole('button', { name: 'Crear recepción' }); expect(submit.hasAttribute('disabled')).toBe(true);
    const form = submit.closest('form'); if (!form) throw new Error('Expected form');
    fireEvent.submit(form); await flush(); expect(creates(h.calls)).toHaveLength(0); expect(storage).not.toHaveBeenCalled();
  });
  it('locks form, owner, warnings and editing after create; forced resubmit cannot create again', async () => {
    const h = await createWithPhoto();
    for (const name of ['Crear recepción', 'Consultar propietario vigente', 'Quitar foto 1', 'Quitar todas las fotos']) expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
    for (const name of ['Kilometraje (km)', 'Seleccionar fotos', 'Seleccionar video', 'El propietario declara ser mayor de edad para la captura de evidencia.']) expect(screen.getByLabelText(name).matches(':disabled')).toBe(true);
    fireEvent.click(screen.getByLabelText('El propietario declara ser mayor de edad para la captura de evidencia.'));
    expect(screen.getByRole('img')).toBeDefined(); expect(revoke).not.toHaveBeenCalled();
    const form = screen.getByRole('button', { name: 'Crear recepción' }).closest('form'); if (!form) throw new Error('Expected form');
    fireEvent.submit(form); await flush(); expect(creates(h.calls)).toHaveLength(1);
  });
  it('reception create failure keeps local Files and performs zero media work or false success', async () => {
    const h = renderReception('/recepciones/nueva', call => call.url.pathname === '/api/v1/receptions' && call.init.method === 'POST' ? errorResponse('INTERNAL_ERROR', 500) : defaults(call), permissions);
    await prepare(); await capture(); choosePhotos(); await chooseVideo(); click('Crear recepción'); await flush();
    expect(screen.queryByText(/Recepción creada/)).toBeNull(); expect(screen.getByRole('img')).toBeDefined(); expect(screen.getByLabelText('Vista previa del video seleccionado')).toBeDefined();
    expect(creates(h.calls)).toHaveLength(1); expect(mediaCalls(h.calls)).toHaveLength(0); expect(storage).not.toHaveBeenCalled(); expect(revoke).not.toHaveBeenCalled();
  });
  it.each([403, 412, 'network'] as const)('PUT %s preserves F04 recovery and the created reception without replay', async failure => {
    if (failure === 'network') storage.mockRejectedValue(new Error('synthetic network'));
    else storage.mockResolvedValue({ ok: false, status: failure, redirected: false, type: 'basic' });
    const h = await createWithPhoto(); click('Subir foto 1'); await flush();
    expect(screen.getByText('Recepción creada. Ahora puedes completar la carga de la evidencia.')).toBeDefined(); expect(screen.getByRole('img')).toBeDefined(); expect(revoke).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Reiniciar|Reintentar asociación|^Subir/ })).toBeNull();
    expect(mediaCalls(h.calls)).toHaveLength(1); expect(storage).toHaveBeenCalledTimes(1); expect(creates(h.calls)).toHaveLength(1);
    click('Continuar a la recepción sin completar esta evidencia'); await screen.findByRole('heading', { name: 'Detalle de recepción' }); expect(revoke).toHaveBeenCalledTimes(1);
  });
  it.each(['network', 'malformed', 'pending'] as const)('completion %s is ambiguous: no attach or blind restart', async failure => {
    const h = await createWithPhoto(call => call.url.pathname.endsWith('/complete') ? failure === 'network' ? Promise.reject(new Error('synthetic')) : jsonResponse(failure === 'pending' ? { ...CONFIRMED_MEDIA, status: 'pending' } : { invalid: true }) : defaults(call));
    click('Subir foto 1'); await flush();
    expect(screen.getByText(/No se pudo confirmar el resultado de la carga/)).toBeDefined(); expect(screen.queryByRole('button', { name: /Reiniciar|Reintentar asociación|^Subir/ })).toBeNull();
    expect(h.calls.filter(c => c.url.pathname.endsWith('/media'))).toHaveLength(0); expect(creates(h.calls)).toHaveLength(1); expect(revoke).not.toHaveBeenCalled();
  });
  it.each(['network', 'server', 'identity'] as const)('association %s: retains active identity; explicit retry attaches the same asset without upload/create', async failure => {
    let attaches = 0;
    const h = await createWithPhoto(call => {
      if (!call.url.pathname.endsWith('/media') || ++attaches > 1) return defaults(call);
      return failure === 'network' ? Promise.reject(new Error('synthetic')) : failure === 'server' ? errorResponse('INTERNAL_ERROR', 500) : jsonResponse(linked({ mediaAssetId: IDS.other, sortOrder: 0 }));
    });
    click('Subir foto 1'); await flush();
    expect(screen.getByText('Archivo cargado. No se confirmó su asociación a la recepción.')).toBeDefined(); expect(screen.queryByText(/Evidencia guardada/)).toBeNull(); expect(screen.getByRole('img')).toBeDefined();
    await flush(); expect(attaches).toBe(1); expect(revoke).not.toHaveBeenCalled();
    const retry = screen.getByRole('button', { name: 'Reintentar asociación de foto 1' });
    act(() => { fireEvent.click(retry); fireEvent.click(retry); }); await flush();
    expect(attaches).toBe(2); expect(screen.getByText('Foto 1 · Evidencia guardada')).toBeDefined(); expect(revoke).toHaveBeenCalledTimes(1);
    const requests = h.calls.filter(c => c.url.pathname.endsWith('/media')); expect(body(requests[1])).toEqual(body(requests[0]));
    expect(creates(h.calls)).toHaveLength(1); expect(h.calls.filter(c => c.url.pathname === '/api/v1/media/upload-sessions')).toHaveLength(1);
    expect(h.calls.filter(c => c.url.pathname.endsWith('/complete'))).toHaveLength(1); expect(storage).toHaveBeenCalledTimes(1);
  });
  it('partial success keeps saved and pending evidence distinct and leaves only by deliberate action', async () => {
    const put = deferred<StorageResponse>(); storage.mockImplementationOnce(() => Promise.resolve({ ok: true, status: 200, redirected: false, type: 'basic' })).mockImplementationOnce(() => put.promise);
    const h = renderReception('/recepciones/nueva', defaults, permissions); await prepare(); await capture(); choosePhotos([photo(), photo()]); click('Crear recepción'); await flush();
    click('Subir foto 1'); await flush(); click('Subir foto 2'); await flush();
    expect(screen.getByText('Foto 1 · Evidencia guardada')).toBeDefined(); expect(screen.getByText('Subiendo el archivo.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Continuar a la recepción' })).toBeNull(); expect(screen.getByText(/La recepción ya existe. Hay evidencia sin asociación confirmada/)).toBeDefined();
    click('Continuar a la recepción sin completar esta evidencia'); await screen.findByRole('heading', { name: 'Detalle de recepción' });
    expect(storage.mock.calls[1]?.[1].signal?.aborted).toBe(true); expect(creates(h.calls)).toHaveLength(1); expect(revoke).toHaveBeenCalledTimes(2);
  });
  it.each(['tenant', 'identity', 'permission', 'unmount'] as const)('%s invalidation aborts upload and releases local Files with no late attach', async change => {
    const put = deferred<StorageResponse>(); storage.mockImplementation(() => put.promise);
    const h = await createWithPhoto(); click('Subir foto 1'); await flush();
    if (change === 'unmount') h.unmount(); else h.updateRuntime({ ...h.runtime, ...(change === 'tenant' ? { tenantId: IDS.other } : change === 'identity' ? { identity: 'new-session' } : { permissions: PERMISSIONS }) });
    await flush(); expect(storage.mock.calls[0]?.[1].signal?.aborted).toBe(true); expect(screen.queryByRole('img')).toBeNull(); expect(revoke).toHaveBeenCalledTimes(1);
    act(() => { put.resolve({ ok: true, status: 200, redirected: false, type: 'basic' }); }); await flush();
    expect(h.calls.filter(c => c.url.pathname.endsWith('/media') || c.url.pathname.endsWith('/complete'))).toHaveLength(0); expect(creates(h.calls)).toHaveLength(1);
  });
  it('equivalent permissions and client refresh preserve post-create state, Files, and running task', async () => {
    const put = deferred<StorageResponse>(); storage.mockImplementation(() => put.promise);
    const h = await createWithPhoto(); const preview = screen.getByRole('img').getAttribute('src'); click('Subir foto 1'); await flush();
    h.updateRuntime({ ...h.runtime, apiClient: createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'no_session' }) }), permissions: [...permissions].reverse().flatMap(grant => [grant, { ...grant, scopes: [...grant.scopes, ...grant.scopes] }]) }); await flush();
    expect(screen.getByRole('img').getAttribute('src')).toBe(preview); expect(revoke).not.toHaveBeenCalled(); expect(storage.mock.calls[0]?.[1].signal?.aborted).toBe(false);
    act(() => { put.resolve({ ok: true, status: 200, redirected: false, type: 'basic' }); }); await flush();
    expect(screen.getByText('Foto 1 · Evidencia guardada')).toBeDefined(); expect(creates(h.calls)).toHaveLength(1);
  });
  it.each(['tenant', 'permission', 'unmount'] as const)('%s during association aborts that POST, ignores late success, and never retries', async change => {
    const attached = deferred<FetchResponse>(); const h = await createWithPhoto(c => c.url.pathname.endsWith('/media') ? attached.promise : defaults(c)); click('Subir foto 1'); await flush();
    const request = h.calls.find(c => c.url.pathname.endsWith('/media')); expect(request).toBeDefined();
    if (change === 'unmount') h.unmount(); else h.updateRuntime({ ...h.runtime, ...(change === 'tenant' ? { tenantId: IDS.other } : { permissions: PERMISSIONS }) }); await flush();
    expect(request?.init.signal?.aborted).toBe(true); expect(revoke).toHaveBeenCalledTimes(1);
    act(() => { attached.resolve(jsonResponse(linked({ mediaAssetId: MEDIA_ID }))); }); await flush();
    expect(screen.queryByText(/Evidencia guardada/)).toBeNull(); expect(h.calls.filter(c => c.url.pathname.endsWith('/media'))).toHaveLength(1); expect(creates(h.calls)).toHaveLength(1);
  });
  it('protects link navigation and browser unload while unassociated evidence remains', async () => {
    const h = await createWithPhoto(); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('link', { name: 'Saltar al contenido principal' })); expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: 'Volver a recepciones' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('La recepción ya existe.')); expect(screen.getByRole('img')).toBeDefined();
    const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    h.unmount(); const after = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(after); expect(after.defaultPrevented).toBe(false);
  });
});

describe('F07-B deterministic selection keys and bounded explicit dispatch', () => {
  it('stable distinct UUIDs and sort orders survive safe restart; replacements get fresh keys; max two uploads', async () => {
    const attempts: { readonly input: ReceptionOperationalMediaInput; readonly file: Blob; readonly signal: AbortSignal; readonly result: ReturnType<typeof deferred<MediaResult>> }[] = [];
    const executor: UploadExecutor<ReceptionOperationalMediaInput> = { upload: vi.fn<UploadExecutor<ReceptionOperationalMediaInput>['upload']>((input, file, signal) => { const result = deferred<MediaResult>(); attempts.push({ input, file, signal, result }); return result.promise; }) };
    let serial = 0;
    const source = vi.fn(() => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++serial).padStart(12, '0')}`);
    const attach = vi.fn((_id: string, input: { readonly mediaAssetId: string; readonly sortOrder?: number }) => Promise.resolve({ ok: true as const, data: { media: { ...linked(input).media, mediaType: 'photo' as const, purpose: 'intake_evidence' as const } } }));
    const capability: ReceptionMediaCapability = { kind: 'available', executor, attach, createIdempotencyKey: source };
    const apiClient = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }), fetchImpl: (url, init) => Promise.resolve(defaults({ url: new URL(url), init })) });
    render(<MemoryRouter><ReceptionProvider runtime={{ apiClient, identity: 'synthetic', tenantId: IDS.tenant, permissions }}><Routes><Route path="/" element={<NewReceptionPage mediaCapability={capability}/>}/></Routes></ReceptionProvider></MemoryRouter>);
    await prepare(); await capture(); const original = photo(); choosePhotos([original]); click('Quitar foto 1'); choosePhotos([original, original]); await chooseVideo(); await chooseVideo();
    expect(source).toHaveBeenCalledTimes(5); expect(attempts).toHaveLength(0); click('Crear recepción'); await flush();
    click('Subir foto 2'); click('Subir foto 3'); await flush();
    expect(attempts).toHaveLength(2); expect(screen.getByRole('button', { name: 'Subir video' }).hasAttribute('disabled')).toBe(true);
    expect(attempts.map(a => a.input.idempotencyKey)).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003']);
    expect(attempts.every(a => a.file === original)).toBe(true);
    act(() => { attempts[0]?.result.resolve({ ok: false, failure: { source: 'api', stage: 'create', failure: { kind: 'no_session', status: null, code: null, requestId: null } } }); }); await flush();
    click('Reiniciar carga foto 2'); await flush(); expect(attempts[2]?.input).toEqual(attempts[0]?.input); expect(source).toHaveBeenCalledTimes(5);
    act(() => { attempts[1]?.result.resolve({ ok: true, data: { ...CONFIRMED_MEDIA, mediaAssetId: IDS.other } }); }); await flush();
    expect(attach).toHaveBeenCalledWith(IDS.reception, { mediaAssetId: IDS.other, sortOrder: 2 }, expect.any(AbortSignal));
    expect(attempts).toHaveLength(3); click('Subir video'); await flush();
    expect(attempts[3]?.input.idempotencyKey).toBe('aaaaaaaa-aaaa-4aaa-8aaa-000000000005');
    act(() => { attempts[2]?.result.resolve({ ok: true, data: CONFIRMED_MEDIA }); }); await flush();
    expect(attach).toHaveBeenCalledWith(IDS.reception, { mediaAssetId: MEDIA_ID, sortOrder: 1 }, expect.any(AbortSignal));
    expect(within(screen.getByRole('list', { name: 'Evidencia confirmada' })).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Foto 2 · Evidencia guardada', 'Foto 3 · Evidencia guardada']);
  });
});
