import { MemoryRouter } from '@/test/data-memory-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createMediaClient } from '@/shared/media/media-client';
import type { MediaApiAdapter, MediaResult, ConfirmedMedia } from '@/shared/media/media-types';
import type { UploadExecutor, UploadObserver } from '@/shared/media/upload-task-types';
import { ReceptionProvider, type ReceptionRuntime, type EffectivePermissions } from './reception-context';
import { NewReceptionPage } from './new-reception-page';
import { ReceptionDetailPage } from './reception-detail-page';
import { createReceptionApi } from './reception-api';
import * as context from './reception-context';
import type { ReceptionOperationalMediaInput } from './reception-operational-media-types';
import { ReceptionMedia, type ReceptionMediaCapability } from './reception-media';
import { CONSENT, DETAIL, IDS, NOTICE, OWNER, PERMISSIONS, RECEPTION, VEHICLE, jsonResponse, errorResponse, renderReception, type Call } from '@/test/render-reception';
import { createApiClient, type FetchResponse } from '@/shared/api/http-client';
import * as execution from '@/shared/media/upload-task-execution';
import * as tasks from '@/shared/media/upload-task';

const permissions = [...PERMISSIONS, { code: 'media.upload', scopes: ['tenant'] }];
const file = () => new File(['synthetic'], 'same.private-filename', { type: 'image/example' });
const active = (mediaAssetId = IDS.other): ConfirmedMedia => ({ mediaAssetId, status: 'active', sizeBytes: 9, checksumSha256: null });
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
let decoders: HTMLVideoElement[];
const revoke = vi.fn();
let enableUploads = () => {};
function available(executor: UploadExecutor<ReceptionOperationalMediaInput>): ReceptionMediaCapability {
  return { kind: 'available', executor, attach: vi.fn<Extract<ReceptionMediaCapability, { kind: 'available' }>['attach']>((_receptionId, input) => Promise.resolve({ ok: true as const, data: { media: {
    mediaAssetId: input.mediaAssetId, sortOrder: input.sortOrder ?? 0, mediaType: 'photo' as const, mimeType: 'image/example',
    sizeBytes: 9, capturedAt: null, uploadedAt: null, purpose: 'intake_evidence' as const,
  } } })) };
}
beforeEach(() => {
  enableUploads = () => {};
  decoders = [];
  let serial = 0;
  revoke.mockReset();
  vi.stubGlobal('URL', Object.assign(class extends URL {}, {
    createObjectURL: vi.fn(() => `blob:f05-${String(++serial)}`), revokeObjectURL: revoke,
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) {
    if (this instanceof HTMLVideoElement && this.hasAttribute('src') && !this.isConnected) decoders.push(this);
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
function defaults(call: Call) {
  if (call.url.pathname.endsWith('/owners')) return jsonResponse({ owners: [OWNER] });
  if (call.url.pathname.endsWith('/privacy-consents')) return jsonResponse({ privacyConsents: [CONSENT] });
  if (call.url.pathname === '/api/v1/privacy-notice') return jsonResponse({ privacyNotice: NOTICE });
  if (call.url.pathname === '/api/v1/vehicles') return jsonResponse({ vehicles: [VEHICLE], nextCursor: null });
  return jsonResponse({ reception: call.init.method === 'POST' ? RECEPTION : DETAIL });
}
function fixture(capability: ReceptionMediaCapability = available(controlled().executor), initial: EffectivePermissions = permissions, strict = false) {
  const calls: Call[] = [];
  const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }),
    fetchImpl: (url, init) => { const call = { url: new URL(url), init }; calls.push(call); return Promise.resolve(defaults(call)); } });
  const runtime: ReceptionRuntime = { apiClient: client, identity: 'synthetic', tenantId: IDS.tenant, permissions: initial };
  const pending = vi.fn();
  let receptionId: string | null = null;
  const view = (next: ReceptionRuntime) => <ReceptionProvider runtime={next}><ReceptionMedia consent={CONSENT} capability={capability} receptionId={receptionId} onPendingChange={pending}/></ReceptionProvider>;
  const wrapped = (next: ReceptionRuntime) => strict ? <StrictMode>{view(next)}</StrictMode> : view(next);
  const result = render(wrapped(runtime));
  enableUploads = () => { receptionId = IDS.reception; result.rerender(wrapped(runtime)); };
  return { ...result, calls, runtime, client, pending, update: (next: ReceptionRuntime) => { result.rerender(wrapped(next)); } };
}
function renderIntake(executor: UploadExecutor<ReceptionOperationalMediaInput>, respond: (call: Call) => FetchResponse | Promise<FetchResponse> = defaults) {
  const calls: Call[] = [];
  const apiClient = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }),
    fetchImpl: (url, init) => { const call = { url: new URL(url), init }; calls.push(call); return Promise.resolve(respond(call)); } });
  const runtime: ReceptionRuntime = { apiClient, identity: 'synthetic', tenantId: IDS.tenant, permissions };
  let capability: ReceptionMediaCapability = available(executor);
  const view = () => (<MemoryRouter initialEntries={['/recepciones/nueva']}><ReceptionProvider runtime={runtime}><Routes>
    <Route path="/recepciones/nueva" element={<NewReceptionPage mediaCapability={capability}/>}/>
    <Route path="/recepciones/:receptionId" element={<ReceptionDetailPage/>}/>
  </Routes></ReceptionProvider></MemoryRouter>);
  const rendered = render(view());
  return { ...rendered, calls, loseCapability: () => { capability = { kind: 'unavailable' }; rendered.rerender(view()); } };
}
async function prepareIntake() {
  fireEvent.change(await screen.findByLabelText('Buscar vehículo por placa'), { target: { value: 'ABC123' } });
  click('Buscar vehículo'); fireEvent.click(await screen.findByRole('button', { name: /ABC123 —/ }));
  click('Consultar propietario vigente'); fireEvent.click(await screen.findByRole('button', { name: /Confirmar propietario/ }));
  await screen.findByText('Autorización vigente para la prestación del servicio.');
  fireEvent.change(screen.getByLabelText('Kilometraje (km)'), { target: { value: '101' } });
}
/** Deliberately keep the component mounted across grants changes: do not rely on ReceptionProvider's remount. */
function reusableFixture(executor: UploadExecutor<ReceptionOperationalMediaInput>) {
  const apiClient = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }),
    fetchImpl: () => Promise.resolve(jsonResponse({ privacyNotice: NOTICE })) });
  const controller = new AbortController();
  const value = { api: createReceptionApi(apiClient, IDS.tenant, controller.signal), permissions, signal: controller.signal, mediaCapability: available(executor) };
  vi.spyOn(context, 'useReception').mockImplementation(() => value);
  const pending = vi.fn();
  let capability: ReceptionMediaCapability = available(executor);
  let consent = CONSENT;
  let receptionId: string | null = null;
  const view = () => <ReceptionMedia consent={consent} capability={capability} receptionId={receptionId} onPendingChange={pending}/>;
  const rendered = render(view());
  enableUploads = () => { receptionId = IDS.reception; rendered.rerender(view()); };
  return { ...rendered, pending, abort: () => { controller.abort(); },
    grants(next: EffectivePermissions) { value.permissions = [...next]; rendered.rerender(view()); },
    capability(next: ReceptionMediaCapability) { capability = next; rendered.rerender(view()); },
    consent(next: typeof CONSENT) { consent = next; rendered.rerender(view()); },
  };
}
async function privacy() {
  fireEvent.click(await screen.findByRole('button', { name: 'Mostrar aviso para capturar evidencia' }));
  fireEvent.click(await screen.findByLabelText('El propietario declara ser mayor de edad para la captura de evidencia.'));
  screen.getAllByLabelText('He leído este aviso').forEach(input => { fireEvent.click(input); });
}
function choosePhotos(files = [file()]) { fireEvent.change(screen.getByLabelText('Seleccionar fotos'), { target: { files } }); }
async function chooseVideo() {
  fireEvent.change(screen.getByLabelText('Seleccionar video'), { target: { files: [new File(['video'], 'private-video', { type: 'video/example' })] } });
  const decoder = decoders.at(-1);
  if (!decoder) throw new Error('No synthetic decoder');
  Object.defineProperty(decoder, 'duration', { configurable: true, value: 12 });
  fireEvent.loadedMetadata(decoder);
  await flush();
}
const click = (name: string) => { if (name.startsWith('Subir')) enableUploads(); fireEvent.click(screen.getByRole('button', { name })); };
function controlled() {
  const attempts: { readonly blob: Blob; readonly signal: AbortSignal; readonly observer: UploadObserver; readonly result: ReturnType<typeof deferred<MediaResult>> }[] = [];
  const executor: UploadExecutor<ReceptionOperationalMediaInput> = { upload: vi.fn((_input: ReceptionOperationalMediaInput, blob: Blob, signal: AbortSignal, observer: UploadObserver) => {
    const result = deferred<MediaResult>(); attempts.push({ blob, signal, observer, result }); return result.promise;
  }) };
  return { executor, attempts };
}
async function startPhoto(number = 1) { click(`Subir foto ${String(number)}`); await flush(); }
function attemptOf(c: ReturnType<typeof controlled>, index = 0) {
  const value = c.attempts[index]; if (!value) throw new Error('Missing attempt'); return value;
}
async function resolveAttempt(c: ReturnType<typeof controlled>, index: number, result: MediaResult) {
  await act(async () => { attemptOf(c, index).result.resolve(result); await Promise.resolve(); });
}

describe('F05 real intake boundary', () => {
  it.each([{ grants: [] }, { grants: PERMISSIONS }, { grants: [...PERMISSIONS, { code: 'media.upload', scopes: ['assigned'] }] }])('hides both pickers without tenant media/create authorization: %j', async ({ grants }) => {
    fixture(undefined, grants); await flush();
    expect(screen.queryByLabelText('Seleccionar fotos')).toBeNull(); expect(screen.queryByLabelText('Seleccionar video')).toBeNull();
    expect(screen.queryByRole('button', { name: /Mostrar aviso/ })).toBeNull();
  });
  it('requires exact notice, explicit adult attestation and both F02/F03 warnings', async () => {
    fixture(); await screen.findByRole('button', { name: /Mostrar aviso/ });
    expect(screen.queryByLabelText('Seleccionar fotos')).toBeNull();
    click('Mostrar aviso para capturar evidencia');
    const adult = await screen.findByLabelText<HTMLInputElement>('El propietario declara ser mayor de edad para la captura de evidencia.');
    expect(adult.checked).toBe(false); expect(screen.getByText('Aviso exacto Segunda línea.')).toBeDefined();
    expect(screen.queryByLabelText('Seleccionar video')).toBeNull(); fireEvent.click(adult);
    expect(screen.getByLabelText<HTMLInputElement>('Seleccionar fotos').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('Seleccionar video').disabled).toBe(true);
    screen.getAllByLabelText('He leído este aviso').forEach(input => { fireEvent.click(input); });
    expect(screen.getByLabelText<HTMLInputElement>('Seleccionar fotos').disabled).toBe(false);
    expect(screen.getByLabelText<HTMLInputElement>('Seleccionar video').disabled).toBe(false);
  });
  it('keeps injected intake media gated by owner/consent and preserves the create payload', async () => {
    const h = renderIntake(controlled().executor);
    await screen.findByLabelText('Buscar vehículo por placa'); expect(screen.queryByRole('button', { name: /Mostrar aviso/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Buscar vehículo por placa'), { target: { value: 'ABC123' } });
    click('Buscar vehículo'); fireEvent.click(await screen.findByRole('button', { name: /ABC123 —/ }));
    click('Consultar propietario vigente'); fireEvent.click(await screen.findByRole('button', { name: /Confirmar propietario/ }));
    await privacy(); choosePhotos(); await chooseVideo();
    expect(screen.getAllByText('Solo local · Se podrá subir después de crear la recepción.')).toHaveLength(2);
    expect(screen.queryByText(/Confirmado activo/)).toBeNull(); expect(screen.queryByRole('button', { name: 'Subir foto 1' })).toBeNull();
    expect(h.calls.some(call => call.url.pathname.includes('/media/'))).toBe(false);
    fireEvent.change(screen.getByLabelText('Kilometraje (km)'), { target: { value: '101' } });
    expect(screen.getByRole('button', { name: 'Crear recepción' }).hasAttribute('disabled')).toBe(false);
    const form = screen.getByRole('button', { name: 'Crear recepción' }).closest('form');
    if (!form) throw new Error('Missing intake form');
    expect(form).toBeDefined();
    expect(h.calls.some(call => call.init.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByLabelText(/Crear la recepción sin estos archivos locales/)); click('Crear recepción');
    await screen.findByRole('heading', { name: 'Detalle de recepción' });
    expect(revoke).toHaveBeenCalledTimes(2);
    const created = h.calls.find(call => call.init.method === 'POST');
    expect(typeof created?.init.body === 'string' ? JSON.parse(created.init.body) : null).toEqual({ vehicleId: IDS.vehicle, customerId: IDS.customer, privacyConsentId: IDS.consent, mileageKm: 101, fuelLevelPct: null, customerNotes: null, advisorNotes: null });
    expect(screen.queryByLabelText('Firmar recepción')).toBeNull();
  });
  it('does not persist selections or expose filenames', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem'); const open = vi.fn(); vi.stubGlobal('indexedDB', { open });
    fixture(); await privacy(); const same = file(); choosePhotos([same, same]); await chooseVideo();
    expect(screen.getAllByRole('img')).toHaveLength(2); expect(local).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText('same.private-filename')).toBeNull(); expect(screen.queryByText('private-video')).toBeNull();
  });
  it('keeps local photo/video selections through equivalent normalized permission refresh', async () => {
    const h = fixture(); await privacy(); choosePhotos(); await chooseVideo();
    h.update({ ...h.runtime, permissions: [...permissions].reverse().flatMap(grant => [grant, { ...grant, scopes: [...grant.scopes, ...grant.scopes] }]) }); await flush();
    expect(screen.getAllByRole('img')).toHaveLength(1); expect(screen.getByLabelText('Vista previa del video seleccionado')).toBeDefined(); expect(revoke).not.toHaveBeenCalled();
  });
  it('actual permission revocation clears local work and prevents new execution', async () => {
    const c = controlled(); const h = fixture(available(c.executor)); await privacy(); choosePhotos();
    h.update({ ...h.runtime, permissions: PERMISSIONS }); await flush();
    expect(screen.queryByRole('button', { name: /^Subir/ })).toBeNull(); expect(c.attempts).toHaveLength(0); expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe('F05 controller orchestration with synthetic executors', () => {
  it('starts F04 for the original file and displays indeterminate upload without saved copy', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); const original = file(); choosePhotos([original]);
    await startPhoto(); expect(attemptOf(c).blob).toBe(original);
    act(() => { attemptOf(c).observer.onPhase('uploading'); });
    expect(screen.getByText('Subiendo el archivo.')).toBeDefined(); expect(screen.getByRole('progressbar').hasAttribute('value')).toBe(false);
    expect(screen.queryByText(/Evidencia guardada|Guardado/)).toBeNull(); expect(screen.queryByText(/\d+%/)).toBeNull();
  });
  it('replaces only a confirmed active local item, revokes preview and releases controller ownership', async () => {
    const cells: execution.UploadExecution<unknown>[] = [];
    vi.spyOn(execution, 'createUploadExecution').mockImplementation(<Input,>(input: Input, blob: Blob) => { const cell = { payload: { input, blob } }; cells.push(cell); return cell; }); const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await startPhoto();
    await resolveAttempt(c, 0, { ok: true, data: active() });
    expect(screen.getByText(/Evidencia guardada/)).toBeDefined(); expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Solo local · Lista para subir.')).toBeNull(); expect(screen.getAllByRole('listitem')).toHaveLength(1); expect(revoke).toHaveBeenCalledTimes(1);
    expect(cells[0]?.payload).toBeNull();
  });
  it('keeps same filename and same File selections distinct; out-of-order completions preserve identity/order', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); const same = file(); choosePhotos([same, same]); await startPhoto(1); await startPhoto(2);
    expect(c.attempts.map(item => item.blob)).toEqual([same, same]);
    await resolveAttempt(c, 1, { ok: true, data: active(IDS.customer) });
    expect(screen.getByRole('button', { name: 'Cancelar carga de foto 1' })).toBeDefined(); expect(screen.getAllByRole('img')).toHaveLength(1);
    await resolveAttempt(c, 0, { ok: true, data: active(IDS.other) });
    expect(within(screen.getByRole('list', { name: 'Evidencia confirmada' })).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Foto 1 · Evidencia guardada', 'Foto 2 · Evidencia guardada']);
  });
  it('rejects a malformed successful executor result before any confirmed copy or replacement', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await startPhoto();
    const media = active(); Object.defineProperty(media, 'status', { value: 'uploaded' });
    await resolveAttempt(c, 0, { ok: true, data: media });
    expect(screen.getByText(/No se pudo confirmar el resultado/)).toBeDefined(); expect(screen.queryByText(/Guardado|Evidencia guardada/)).toBeNull(); expect(screen.getByRole('img')).toBeDefined(); expect(screen.queryByRole('button', { name: /Reiniciar|Subir/ })).toBeNull();
  });
  it('caps explicit concurrency at two across photo/video and never auto-starts queued files', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos([file(), file(), file()]); await chooseVideo();
    await startPhoto(1); await startPhoto(2);
    expect(screen.getByRole('button', { name: 'Subir foto 3' }).hasAttribute('disabled')).toBe(true); expect(screen.getByRole('button', { name: 'Subir video' }).hasAttribute('disabled')).toBe(true);
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(c.attempts).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Subir video' }).hasAttribute('disabled')).toBe(false);
  });
  it('cancel A leaves photo B running, preserves preview and ignores A late result', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos([file(), file()]); await startPhoto(1); await startPhoto(2);
    click('Cancelar carga de foto 1'); await flush(); expect(attemptOf(c).signal.aborted).toBe(true); expect(attemptOf(c, 1).signal.aborted).toBe(false);
    expect(screen.getByRole('button', { name: 'Reiniciar carga foto 1' })).toBeDefined(); expect(screen.getAllByRole('img')).toHaveLength(2);
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(screen.queryByText(/Evidencia guardada|Guardado/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancelar carga de foto 2' })).toBeDefined();
  });
  it('old attempt result cannot overwrite a safe restarted attempt', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await startPhoto(); click('Cancelar carga de foto 1'); await flush();
    click('Reiniciar carga foto 1'); await flush(); await resolveAttempt(c, 0, { ok: true, data: active(IDS.customer) });
    expect(screen.queryByText(/Evidencia guardada|Guardado/)).toBeNull(); await resolveAttempt(c, 1, { ok: true, data: active() }); expect(screen.getAllByText(/Evidencia guardada/)).toHaveLength(1);
  });
  it('preflight failure preserves File/preview and safe_local_restart explicitly starts a new attempt', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); const original = file(); choosePhotos([original]); await startPhoto();
    await resolveAttempt(c, 0, { ok: false, failure: { source: 'api', stage: 'create', failure: { kind: 'no_session', status: null, code: null, requestId: null } } });
    expect(screen.getByRole('img')).toBeDefined(); expect(revoke).not.toHaveBeenCalled(); click('Reiniciar carga foto 1'); await flush(); expect(attemptOf(c, 1).blob).toBe(original);
  });
  it.each([
    ['network', null, 'No se pudo confirmar'], ['signed_url_rejected', 403, 'El enlace de carga fue rechazado'],
    ['upload_conflict', 412, 'La carga requiere revisión'], ['payload_too_large', 413, 'Este archivo no se puede guardar'],
    ['unsupported_media_type', 415, 'Este archivo no se puede guardar'], ['unprocessable_upload', 422, 'Este archivo no se puede guardar'],
  ] as const)('storage %s/%s follows recovery without unsafe replay', async (kind, status, copy) => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await startPhoto();
    await resolveAttempt(c, 0, { ok: false, failure: { source: 'storage', kind, status } });
    expect(screen.getByText(new RegExp(copy))).toBeDefined(); expect(screen.queryByRole('button', { name: /Reiniciar|Reintentar|Subir/ })).toBeNull();
    expect(screen.queryByText(/No tienes permiso/)).toBeNull(); expect(screen.getByRole('img')).toBeDefined(); expect(revoke).not.toHaveBeenCalled();
  });
  it('cancel after dispatch preserves local work but offers no replay/restart', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await startPhoto();
    act(() => { attemptOf(c).observer.onDispatch('storage'); attemptOf(c).observer.onPhase('uploading'); }); click('Cancelar carga de foto 1'); await flush();
    expect(screen.getByText(/Carga cancelada. Es necesario/)).toBeDefined(); expect(screen.queryByRole('button', { name: /Reiniciar|Subir/ })).toBeNull(); expect(screen.getByRole('img')).toBeDefined();
  });
  it('freezes video removal while keeping photo/video cancellation isolated', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await chooseVideo(); await startPhoto(); click('Subir video'); await flush(); click('Quitar video'); await flush();
    expect(attemptOf(c).signal.aborted).toBe(false); expect(screen.getByRole('button', { name: 'Quitar video' }).hasAttribute('disabled')).toBe(true); expect(attemptOf(c, 1).signal.aborted).toBe(false); click('Cancelar carga de video'); await flush(); expect(attemptOf(c, 1).signal.aborted).toBe(true); await resolveAttempt(c, 1, { ok: true, data: active() }); expect(screen.queryByText(/Evidencia guardada|Guardado/)).toBeNull();
  });
  it.each(['tenant', 'identity', 'permissions', 'unmount'] as const)('%s change disposes tasks/subscriptions and rejects late results', async change => {
    const original = tasks.createUploadTask;
    const created: Pick<ReturnType<typeof tasks.createUploadTask>, 'getState' | 'dispose'>[] = [];
    vi.spyOn(tasks, 'createUploadTask').mockImplementation(<Input,>(executor: UploadExecutor<Input>) => { const task = original(executor); created.push(task); return task; }); const c = controlled(); const h = fixture(available(c.executor)); await privacy(); choosePhotos(); await startPhoto();
    const task = created[0]; if (!task) throw new Error('Missing task'); const dispose = vi.spyOn(task, 'dispose');
    if (change === 'unmount') h.unmount(); else h.update({ ...h.runtime,
      ...(change === 'tenant' ? { tenantId: IDS.other } : change === 'identity' ? { identity: 'new-user' } : { permissions: PERMISSIONS }),
    }); await flush();
    expect(dispose).toHaveBeenCalled(); expect(task.getState()).toEqual({ phase: 'disposed' }); expect(attemptOf(c).signal.aborted).toBe(true); expect(revoke).toHaveBeenCalledTimes(1);
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(screen.queryByText(/Evidencia guardada|Guardado/)).toBeNull(); expect(screen.queryByRole('img')).toBeNull();
  });
  it('cancellation restores keyboard focus to the allowed restart control', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await startPhoto();
    screen.getByRole('button', { name: 'Cancelar carga de foto 1' }).focus(); click('Cancelar carga de foto 1'); await flush();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reiniciar carga foto 1' }));
  });
  it('confirmation restores focus after removing the focused local card', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await startPhoto();
    screen.getByRole('button', { name: 'Cancelar carga de foto 1' }).focus(); await resolveAttempt(c, 0, { ok: true, data: active() });
    expect(document.activeElement).toBe(screen.getByRole('list', { name: 'Evidencia confirmada' }));
  });
  it('confirmation does not steal focus moved elsewhere during upload', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await startPhoto();
    screen.getByRole('heading', { name: 'Fotos' }).setAttribute('tabindex', '0'); screen.getByRole('heading', { name: 'Fotos' }).focus(); await resolveAttempt(c, 0, { ok: true, data: active() });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Fotos' }));
  });
  it('freezes photo removal and cancellation preserves the other original file', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); const second = file(); choosePhotos([file(), second]); await startPhoto(1); await startPhoto(2);
    click('Quitar foto 1'); await flush(); expect(attemptOf(c).signal.aborted).toBe(false); expect(screen.getByRole('button', { name: 'Quitar foto 1' }).hasAttribute('disabled')).toBe(true); click('Cancelar carga de foto 1'); await flush(); expect(attemptOf(c).signal.aborted).toBe(true); expect(attemptOf(c, 1).signal.aborted).toBe(false);
    expect(attemptOf(c, 1).blob).toBe(second); expect(screen.getAllByRole('img')).toHaveLength(2);
  });
  it('post-create clear is locked; unmount releases photo tasks and previews', async () => {
    const c = controlled(); const h = fixture(available(c.executor)); await privacy(); choosePhotos([file(), file()]); await startPhoto(1); await startPhoto(2);
    click('Quitar todas las fotos'); await flush(); expect(screen.getByRole('button', { name: 'Quitar todas las fotos' }).hasAttribute('disabled')).toBe(true); expect(c.attempts.every(item => !item.signal.aborted)).toBe(true); h.unmount(); await flush(); expect(c.attempts.every(item => item.signal.aborted)).toBe(true); expect(revoke).toHaveBeenCalledTimes(2); expect(h.pending).toHaveBeenLastCalledWith(false);
  });
  it('confirmed video releases local metadata/preview and leaves pending photo unchanged', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await chooseVideo(); click('Subir video'); await flush();
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(screen.getByText('Video · Evidencia guardada')).toBeDefined(); expect(screen.queryByLabelText('Vista previa del video seleccionado')).toBeNull();
    expect(screen.getByRole('img')).toBeDefined(); expect(screen.getByRole('button', { name: 'Subir foto 1' })).toBeDefined(); expect(revoke).toHaveBeenCalledTimes(1);
  });
  it('real byte progress changes only the progressbar; live copy stays stable', async () => {
    const c = controlled(); fixture(available(c.executor)); await privacy(); choosePhotos(); await startPhoto();
    act(() => { attemptOf(c).observer.onPhase('uploading'); attemptOf(c).observer.onProgress({ loadedBytes: 2, totalBytes: 10 }); });
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0.2'); expect(screen.getByText('Subiendo el archivo.')).toBeDefined(); expect(screen.queryByText(/Evidencia guardada|Guardado/)).toBeNull();
  });
  it('StrictMode lifecycle creates usable tasks with balanced final disposal', async () => {
    const c = controlled(); const h = fixture(available(c.executor), permissions, true); await privacy(); choosePhotos(); await startPhoto(); expect(c.attempts).toHaveLength(1); h.unmount(); await flush(); expect(attemptOf(c).signal.aborted).toBe(true);
  });
});

describe('F05 through F01 + F04, synthetic adapter only', () => {
  function realStack() {
    const put = deferred<{ ok: true; data: null }>(); const complete = deferred<{ ok: true; data: unknown }>();
    const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'no_session' }) });
    const api: MediaApiAdapter<ReceptionOperationalMediaInput> = {
      createUploadSession: vi.fn(() => Promise.resolve({ ok: true as const, data: { uploadSessionId: IDS.consent, mediaAssetId: IDS.other, status: 'pending', uploadMethod: 'PUT', uploadUrl: 'https://storage.example.test/synthetic', uploadHeaders: {}, objectKey: 'synthetic', expiresAt: '2099-01-01T00:00:00Z' } })),
      completeUploadSession: vi.fn(() => complete.promise),
    };
    const transport = vi.fn(() => put.promise);
    const executor = createMediaClient({ client, api, uploadTransport: transport });
    return { put, complete, api, transport, executor };
  }
  it('PUT 2xx alone shows confirming; parsed active followed by synthetic association replaces the local item', async () => {
    const stack = realStack(); fixture(available(stack.executor)); await privacy(); choosePhotos(); await startPhoto();
    expect(stack.transport).toHaveBeenCalledTimes(1); expect(screen.getByText('Subiendo el archivo.')).toBeDefined(); expect(screen.queryByText(/Evidencia guardada|Guardado/)).toBeNull();
    act(() => { stack.put.resolve({ ok: true, data: null }); }); await flush();
    expect(screen.getByText('Confirmando la carga.')).toBeDefined(); expect(screen.queryByText(/Evidencia guardada|Guardado/)).toBeNull(); expect(screen.getByRole('img')).toBeDefined();
    act(() => { stack.complete.resolve({ ok: true, data: active() }); }); await flush();
    expect(screen.getByText(/Evidencia guardada/)).toBeDefined(); expect(screen.queryByRole('img')).toBeNull();
  });
  it.each(['pending_upload', 'uploaded', 'quarantined', 'deleted'])('completion status %s remains ambiguous and never saved', async status => {
    const stack = realStack(); fixture(available(stack.executor)); await privacy(); choosePhotos(); await startPhoto();
    act(() => { stack.put.resolve({ ok: true, data: null }); }); await flush(); act(() => { stack.complete.resolve({ ok: true, data: { ...active(), status } }); }); await flush();
    expect(screen.getByText(/No se pudo confirmar el resultado/)).toBeDefined(); expect(screen.queryByText(/Evidencia guardada|Guardado/)).toBeNull(); expect(screen.queryByRole('button', { name: /Reiniciar|Subir/ })).toBeNull();
  });
});


describe('F05 focused review regressions', () => {
  it.each(['photo', 'video'] as const)('%s pre-create selection is released when adult is unchecked; rechecking starts empty', async kind => {
    const c = controlled(); const h = fixture(available(c.executor)); await privacy();
    if (kind === 'photo') choosePhotos(); else await chooseVideo();
    expect(h.pending).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByLabelText('El propietario declara ser mayor de edad para la captura de evidencia.')); await flush();
    expect(h.pending).toHaveBeenLastCalledWith(false); expect(revoke).toHaveBeenCalledTimes(1); expect(c.attempts).toHaveLength(0);
    expect(screen.queryByRole('img')).toBeNull(); expect(screen.queryByLabelText('Vista previa del video seleccionado')).toBeNull();
    expect(screen.queryByText(/Evidencia guardada/)).toBeNull();
    fireEvent.click(screen.getByLabelText('El propietario declara ser mayor de edad para la captura de evidencia.')); await flush();
    expect(screen.getByText('0 fotos seleccionadas')).toBeDefined(); expect(screen.getByText('Sin video seleccionado.')).toBeDefined();
    expect(screen.getAllByLabelText<HTMLInputElement>('He leído este aviso').every(input => !input.checked)).toBe(true);
    expect(h.pending).toHaveBeenLastCalledWith(false);
  });
  it.each(['photo', 'video'] as const)('%s adult invalidation removes the parent discard decision', async kind => {
    renderIntake(controlled().executor); await prepareIntake(); await privacy();
    if (kind === 'photo') choosePhotos(); else await chooseVideo();
    fireEvent.click(screen.getByLabelText(/Crear la recepción sin estos archivos locales/));
    fireEvent.click(screen.getByLabelText('El propietario declara ser mayor de edad para la captura de evidencia.')); await flush();
    expect(screen.queryByLabelText(/Crear la recepción sin estos archivos locales/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Crear recepción' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByLabelText('El propietario declara ser mayor de edad para la captura de evidencia.'));
    screen.getAllByLabelText('He leído este aviso').forEach(input => { fireEvent.click(input); });
    choosePhotos(); await flush();
    expect(screen.getByLabelText<HTMLInputElement>(/Crear la recepción sin estos archivos locales/).checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Crear recepción' }).hasAttribute('disabled')).toBe(false);
  });
  it('owner re-query invalidates media immediately, before the read settles, and revalidation starts clean', async () => {
    const ownerRead = deferred<FetchResponse>(); let reads = 0;
    const c = controlled(); renderIntake(c.executor, call => call.url.pathname.endsWith('/owners') && ++reads === 2 ? ownerRead.promise : defaults(call));
    await prepareIntake(); await privacy(); choosePhotos();
    fireEvent.click(screen.getByLabelText(/Crear la recepción sin estos archivos locales/)); click('Consultar propietario vigente'); await flush();
    expect(screen.queryByLabelText(/Crear la recepción sin estos archivos locales/)).toBeNull(); expect(screen.queryByRole('img')).toBeNull();
    expect(c.attempts).toHaveLength(0); expect(revoke).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Evidencia guardada/)).toBeNull();
    act(() => { ownerRead.resolve(jsonResponse({ owners: [OWNER] })); }); await flush();
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar propietario/ })); await privacy();
    expect(screen.queryByRole('img')).toBeNull(); expect(screen.queryByLabelText(/Crear la recepción sin estos archivos locales/)).toBeNull();
    choosePhotos(); expect(screen.getByLabelText<HTMLInputElement>(/Crear la recepción sin estos archivos locales/).checked).toBe(false);
  });
  it.each(['PRIVACY_CONSENT_NOT_ELIGIBLE', 'VEHICLE_OWNERSHIP_CONFLICT'])('create rejection %s clears media and pending/discard state', async code => {
    const c = controlled(); renderIntake(c.executor, call => call.init.method === 'POST' ? errorResponse(code) : defaults(call));
    await prepareIntake(); await privacy(); choosePhotos();
    fireEvent.click(screen.getByLabelText(/Crear la recepción sin estos archivos locales/)); click('Crear recepción'); await flush();
    expect(screen.queryByRole('img')).toBeNull(); expect(screen.queryByLabelText(/Crear la recepción sin estos archivos locales/)).toBeNull();
    expect(c.attempts).toHaveLength(0); expect(revoke).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Evidencia guardada/)).toBeNull();
  });
  it('ordinary failed create preserves media while eligibility stays valid', async () => {
    const c = controlled(); const h = renderIntake(c.executor, call => call.init.method === 'POST' ? errorResponse('INTERNAL_ERROR', 500) : defaults(call));
    await prepareIntake(); await privacy(); choosePhotos(); await chooseVideo();
    fireEvent.click(screen.getByLabelText(/Crear la recepción sin estos archivos locales/)); click('Crear recepción'); await flush();
    expect(screen.getByRole('img')).toBeDefined(); expect(screen.getByLabelText('Vista previa del video seleccionado')).toBeDefined(); expect(revoke).not.toHaveBeenCalled();
    expect(screen.getByLabelText<HTMLInputElement>(/Crear la recepción sin estos archivos locales/).checked).toBe(true);
    const post = h.calls.find(call => call.init.method === 'POST');
    expect(typeof post?.init.body === 'string' ? JSON.parse(post.init.body) : null).toEqual({ vehicleId: IDS.vehicle, customerId: IDS.customer, privacyConsentId: IDS.consent, mileageKm: 101, fuelLevelPct: null, customerNotes: null, advisorNotes: null });
  });
  it('unavailable capability offers product-safe copy only, without notice/adult/capture or API work', async () => {
    const h = fixture({ kind: 'unavailable' }); await flush();
    expect(screen.getByText('La carga de evidencia fotográfica y de video todavía no está disponible.')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull(); expect(screen.queryByRole('checkbox')).toBeNull(); expect(screen.queryByLabelText('Seleccionar fotos')).toBeNull(); expect(screen.queryByLabelText('Seleccionar video')).toBeNull();
    expect(document.body.textContent).not.toMatch(/CONTRACT_DEPENDENCY|adapter|endpoint|backend|contrato|reconciliación|Track A|DTO|HTTP/i);
    expect(h.calls).toHaveLength(0); expect(h.pending).toHaveBeenLastCalledWith(false);
  });
  it('production routes supply operational capability while selection stays local until create', async () => {
    const h = renderReception('/recepciones/nueva', defaults, permissions); await prepareIntake();
    await privacy();
    expect(screen.getByLabelText('Seleccionar fotos')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Subir/ })).toBeNull();
    expect(h.calls.some(call => call.url.pathname.includes('/media/'))).toBe(false);
    click('Crear recepción');
    await screen.findByRole('heading', { name: 'Detalle de recepción' });
    expect(h.calls.filter(call => call.init.method === 'POST')).toHaveLength(1);
    expect(h.calls.some(call => call.url.pathname.includes('/media/'))).toBe(false);
    expect(screen.queryByLabelText('Firmar recepción')).toBeNull();
  });
  it('production detail keeps media consultation unavailable after the reception loads', async () => {
    const create = vi.spyOn(tasks, 'createUploadTask'); const h = renderReception(`/recepciones/${IDS.reception}`, defaults, permissions);
    const evidence = await screen.findByRole('region', { name: 'Evidencia de recepción' });
    expect(within(evidence).getByText('La consulta de evidencia fotográfica y de video todavía no está disponible.')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Mostrar aviso|Subir/ })).toBeNull();
    expect(screen.queryByLabelText('El propietario declara ser mayor de edad para la captura de evidencia.')).toBeNull();
    expect(screen.queryByLabelText('Seleccionar fotos')).toBeNull(); expect(screen.queryByLabelText('Seleccionar video')).toBeNull();
    expect(document.body.textContent).not.toMatch(/contrato|reconciliación|Track A|DTO|HTTP/i);
    expect(create).not.toHaveBeenCalled(); expect(h.calls.some(call => call.url.pathname.includes('/media/'))).toBe(false);
  });
  it('reused component clears confirmed/local/task state on effective permission loss without provider remount', async () => {
    const original = tasks.createUploadTask;
    const created: Pick<ReturnType<typeof tasks.createUploadTask>, 'getState' | 'dispose'>[] = [];
    const unsubscribed = vi.fn();
    vi.spyOn(tasks, 'createUploadTask').mockImplementation(<Input,>(executor: UploadExecutor<Input>) => {
      const task = original(executor); created.push(task);
      const subscribe = task.subscribe.bind(task);
      vi.spyOn(task, 'subscribe').mockImplementation(listener => {
        const unsubscribe = subscribe(listener);
        return () => { unsubscribed(); unsubscribe(); };
      });
      return task;
    });
    const c = controlled(); const h = reusableFixture(c.executor); await privacy(); choosePhotos([file(), file()]); await startPhoto();
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(screen.getByText('Foto 1 · Evidencia guardada')).toBeDefined();
    await flush(); fireEvent.click(screen.getByRole('button', { name: /^Subir foto/ })); await flush(); expect(h.pending).toHaveBeenLastCalledWith(true);
    h.grants(PERMISSIONS); await flush(); expect(h.pending).toHaveBeenLastCalledWith(false); expect(screen.queryByText(/Evidencia guardada/)).toBeNull(); expect(screen.queryByRole('img')).toBeNull();
    expect(attemptOf(c, 1).signal.aborted).toBe(true); expect(revoke).toHaveBeenCalledTimes(2);
    expect(created[1]?.getState()).toEqual({ phase: 'disposed' }); expect(unsubscribed).toHaveBeenCalledTimes(2);
    await resolveAttempt(c, 1, { ok: true, data: active(IDS.customer) }); h.grants(permissions); await flush();
    expect(screen.queryByText(/Evidencia guardada/)).toBeNull(); expect(screen.queryByRole('img')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Mostrar aviso para capturar evidencia' }));
    expect((await screen.findByLabelText<HTMLInputElement>('El propietario declara ser mayor de edad para la captura de evidencia.')).disabled).toBe(true);
    expect(screen.queryByRole('img')).toBeNull(); expect(h.pending).toHaveBeenLastCalledWith(false);
  });
  it('reused component preserves acknowledgements, original URLs and running task on equivalent grants', async () => {
    const c = controlled(); const h = reusableFixture(c.executor); await privacy(); choosePhotos(); await chooseVideo(); await startPhoto();
    const url = screen.getByRole('img').getAttribute('src');
    h.grants([...permissions].reverse().flatMap(grant => [grant, { ...grant, scopes: [...grant.scopes, ...grant.scopes] }])); await flush();
    expect(screen.getByRole('img').getAttribute('src')).toBe(url); expect(revoke).not.toHaveBeenCalled(); expect(attemptOf(c).signal.aborted).toBe(false);
    expect(screen.getAllByLabelText<HTMLInputElement>('He leído este aviso').every(input => input.checked)).toBe(true); expect(h.pending).toHaveBeenLastCalledWith(true);
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(screen.getByText('Foto 1 · Evidencia guardada')).toBeDefined();
  });
  it('consent identity change releases pending state and starts a clean session', async () => {
    const c = controlled(); const h = reusableFixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    h.consent({ ...CONSENT, privacyConsentId: IDS.other }); await flush(); expect(h.pending).toHaveBeenLastCalledWith(false); expect(attemptOf(c).signal.aborted).toBe(true); expect(revoke).toHaveBeenCalledTimes(1);
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(screen.queryByRole('img')).toBeNull(); expect(screen.queryByText(/Evidencia guardada/)).toBeNull();
  });
  it('capability loss clears sensitive state and does not restore it if capability returns', async () => {
    const c = controlled(); const h = reusableFixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    h.capability({ kind: 'unavailable' }); await flush(); expect(h.pending).toHaveBeenLastCalledWith(false); expect(attemptOf(c).signal.aborted).toBe(true); expect(revoke).toHaveBeenCalledTimes(1);
    h.capability(available(c.executor)); await flush(); expect(screen.queryByRole('img')).toBeNull(); expect(screen.queryByLabelText('Seleccionar fotos')).toBeNull();
  });
  it('final unmount notifies parent false while releasing owned selections', async () => {
    const h = fixture(); await privacy(); choosePhotos(); await chooseVideo(); expect(h.pending).toHaveBeenLastCalledWith(true); h.unmount();
    expect(h.pending).toHaveBeenLastCalledWith(false); expect(revoke).toHaveBeenCalledTimes(2);
  });
  it('confirmed copy follows exactly one normal association attempt', async () => {
    const c = controlled(), capability = available(c.executor);
    if (capability.kind !== 'available') throw new Error('Expected synthetic capability');
    const attach = vi.spyOn(capability, 'attach');
    fixture(capability); await privacy(); choosePhotos(); await startPhoto();
    await resolveAttempt(c, 0, { ok: true, data: active() });
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith(IDS.reception, { mediaAssetId: IDS.other, sortOrder: 0 }, expect.any(AbortSignal));
    expect(screen.getByText('Foto 1 · Evidencia guardada')).toBeDefined();
  });
});


describe('F07-B invalidation is distinct from association', () => {
  it('clearing post-create media on capability loss does not claim evidence was saved', async () => {
    const c = controlled(), h = renderIntake(c.executor); await prepareIntake(); await privacy(); choosePhotos();
    click('Crear recepción'); await screen.findByText('Recepción creada. Ahora puedes completar la carga de la evidencia.');
    click('Subir foto 1'); await flush(); h.loseCapability(); await flush();
    expect(attemptOf(c).signal.aborted).toBe(true); expect(screen.queryByRole('img')).toBeNull(); expect(revoke).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Toda la evidencia seleccionada está guardada en la recepción.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Continuar a la recepción sin completar esta evidencia' })).toBeDefined();
    expect(h.calls.filter(call => call.init.method === 'POST' && call.url.pathname === '/api/v1/receptions')).toHaveLength(1);
  });
  it('session signal abort clears Files even when the outer consumer stays mounted', async () => {
    const c = controlled(), h = reusableFixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    act(() => { h.abort(); }); await flush();
    expect(attemptOf(c).signal.aborted).toBe(true); expect(screen.queryByRole('img')).toBeNull(); expect(revoke).toHaveBeenCalledTimes(1);
    expect(h.pending).toHaveBeenLastCalledWith(false);
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(screen.queryByText(/Evidencia guardada/)).toBeNull();
  });
});
