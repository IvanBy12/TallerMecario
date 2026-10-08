import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createMediaClient } from '@/shared/media/media-client';
import type { MediaApiAdapter, MediaResult, ConfirmedMedia } from '@/shared/media/media-types';
import type { UploadExecutor, UploadObserver } from '@/shared/media/upload-task-types';
import { ReceptionProvider, type ReceptionRuntime, type EffectivePermissions } from './reception-context';
import { ReceptionMedia } from './reception-media';
import { CONSENT, DETAIL, IDS, NOTICE, OWNER, PERMISSIONS, RECEPTION, VEHICLE, jsonResponse, renderReception, type Call } from '@/test/render-reception';
import { createApiClient } from '@/shared/api/http-client';
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
beforeEach(() => {
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
function fixture(executor?: UploadExecutor<undefined>, initial: EffectivePermissions = permissions, strict = false) {
  const calls: Call[] = [];
  const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }),
    fetchImpl: (url, init) => { const call = { url: new URL(url), init }; calls.push(call); return Promise.resolve(defaults(call)); } });
  const runtime: ReceptionRuntime = { apiClient: client, identity: 'synthetic', tenantId: IDS.tenant, permissions: initial };
  const pending = vi.fn();
  const view = (next: ReceptionRuntime) => <ReceptionProvider runtime={next}><ReceptionMedia consent={CONSENT} executor={executor} onPendingChange={pending}/></ReceptionProvider>;
  const wrapped = (next: ReceptionRuntime) => strict ? <StrictMode>{view(next)}</StrictMode> : view(next);
  const result = render(wrapped(runtime));
  return { ...result, calls, runtime, client, pending, update: (next: ReceptionRuntime) => { result.rerender(wrapped(next)); } };
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
const click = (name: string) => { fireEvent.click(screen.getByRole('button', { name })); };
function controlled() {
  const attempts: { readonly blob: Blob; readonly signal: AbortSignal; readonly observer: UploadObserver; readonly result: ReturnType<typeof deferred<MediaResult>> }[] = [];
  const executor: UploadExecutor<undefined> = { upload: vi.fn((_input: undefined, blob: Blob, signal: AbortSignal, observer: UploadObserver) => {
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
  it('keeps real intake media absent until owner/consent validation, then prevents orphan uploads', async () => {
    const h = renderReception('/recepciones/nueva', defaults, permissions);
    await screen.findByLabelText('Buscar vehículo por placa'); expect(screen.queryByRole('button', { name: /Mostrar aviso/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Buscar vehículo por placa'), { target: { value: 'ABC123' } });
    click('Buscar vehículo'); fireEvent.click(await screen.findByRole('button', { name: /ABC123 —/ }));
    click('Consultar propietario vigente'); fireEvent.click(await screen.findByRole('button', { name: /Confirmar propietario/ }));
    await privacy(); choosePhotos(); await chooseVideo();
    expect(screen.getAllByText('Solo local · Lista para subir.')).toHaveLength(2);
    expect(screen.queryByText(/Confirmado activo/)).toBeNull(); expect(screen.queryByRole('button', { name: /^Subir/ })).toBeNull();
    expect(h.calls.some(call => call.url.pathname.includes('/media/'))).toBe(false);
    fireEvent.change(screen.getByLabelText('Kilometraje (km)'), { target: { value: '101' } });
    expect(screen.getByRole('button', { name: 'Crear recepción' }).hasAttribute('disabled')).toBe(true);
    const form = screen.getByRole('button', { name: 'Crear recepción' }).closest('form');
    if (!form) throw new Error('Missing intake form');
    fireEvent.submit(form);
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
    const c = controlled(); const h = fixture(c.executor); await privacy(); choosePhotos();
    h.update({ ...h.runtime, permissions: PERMISSIONS }); await flush();
    expect(screen.queryByRole('button', { name: /^Subir/ })).toBeNull(); expect(c.attempts).toHaveLength(0); expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe('F05 controller orchestration with synthetic executors', () => {
  it('starts F04 for the original file and displays indeterminate upload without saved copy', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); const original = file(); choosePhotos([original]);
    await startPhoto(); expect(attemptOf(c).blob).toBe(original);
    act(() => { attemptOf(c).observer.onPhase('uploading'); });
    expect(screen.getByText('Subiendo el archivo.')).toBeDefined(); expect(screen.getByRole('progressbar').hasAttribute('value')).toBe(false);
    expect(screen.queryByText(/Guardado/)).toBeNull(); expect(screen.queryByText(/\d+%/)).toBeNull();
  });
  it('replaces only a confirmed active local item, revokes preview and releases controller ownership', async () => {
    const cells: execution.UploadExecution<unknown>[] = [];
    vi.spyOn(execution, 'createUploadExecution').mockImplementation(<Input,>(input: Input, blob: Blob) => { const cell = { payload: { input, blob } }; cells.push(cell); return cell; }); const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    await resolveAttempt(c, 0, { ok: true, data: active() });
    expect(screen.getByText(/Guardado · Confirmado activo/)).toBeDefined(); expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Solo local · Lista para subir.')).toBeNull(); expect(screen.getAllByRole('listitem')).toHaveLength(1); expect(revoke).toHaveBeenCalledTimes(1);
    expect(cells[0]?.payload).toBeNull();
  });
  it('keeps same filename and same File selections distinct; out-of-order completions preserve identity/order', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); const same = file(); choosePhotos([same, same]); await startPhoto(1); await startPhoto(2);
    expect(c.attempts.map(item => item.blob)).toEqual([same, same]);
    await resolveAttempt(c, 1, { ok: true, data: active(IDS.customer) });
    expect(screen.getByRole('button', { name: 'Cancelar carga de foto 1' })).toBeDefined(); expect(screen.getAllByRole('img')).toHaveLength(1);
    await resolveAttempt(c, 0, { ok: true, data: active(IDS.other) });
    expect(within(screen.getByRole('list', { name: 'Evidencia confirmada' })).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Foto 1 · Guardado · Confirmado activo', 'Foto 2 · Guardado · Confirmado activo']);
  });
  it('rejects a malformed successful executor result before any confirmed copy or replacement', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    const media = active(); Object.defineProperty(media, 'status', { value: 'uploaded' });
    await resolveAttempt(c, 0, { ok: true, data: media });
    expect(screen.getByText(/No se pudo confirmar el resultado/)).toBeDefined(); expect(screen.queryByText(/Guardado|Carga confirmada/)).toBeNull(); expect(screen.getByRole('img')).toBeDefined(); expect(screen.queryByRole('button', { name: /Reiniciar|Subir/ })).toBeNull();
  });
  it('caps explicit concurrency at two across photo/video and never auto-starts queued files', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos([file(), file(), file()]); await chooseVideo();
    await startPhoto(1); await startPhoto(2);
    expect(screen.getByRole('button', { name: 'Subir foto 3' }).hasAttribute('disabled')).toBe(true); expect(screen.getByRole('button', { name: 'Subir video' }).hasAttribute('disabled')).toBe(true);
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(c.attempts).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Subir video' }).hasAttribute('disabled')).toBe(false);
  });
  it('cancel A leaves photo B running, preserves preview and ignores A late result', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos([file(), file()]); await startPhoto(1); await startPhoto(2);
    click('Cancelar carga de foto 1'); await flush(); expect(attemptOf(c).signal.aborted).toBe(true); expect(attemptOf(c, 1).signal.aborted).toBe(false);
    expect(screen.getByRole('button', { name: 'Reiniciar carga foto 1' })).toBeDefined(); expect(screen.getAllByRole('img')).toHaveLength(2);
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(screen.queryByText(/Guardado/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancelar carga de foto 2' })).toBeDefined();
  });
  it('old attempt result cannot overwrite a safe restarted attempt', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await startPhoto(); click('Cancelar carga de foto 1'); await flush();
    click('Reiniciar carga foto 1'); await flush(); await resolveAttempt(c, 0, { ok: true, data: active(IDS.customer) });
    expect(screen.queryByText(/Guardado/)).toBeNull(); await resolveAttempt(c, 1, { ok: true, data: active() }); expect(screen.getAllByText(/Guardado/)).toHaveLength(1);
  });
  it('preflight failure preserves File/preview and safe_local_restart explicitly starts a new attempt', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); const original = file(); choosePhotos([original]); await startPhoto();
    await resolveAttempt(c, 0, { ok: false, failure: { source: 'api', stage: 'create', failure: { kind: 'no_session', status: null, code: null, requestId: null } } });
    expect(screen.getByRole('img')).toBeDefined(); expect(revoke).not.toHaveBeenCalled(); click('Reiniciar carga foto 1'); await flush(); expect(attemptOf(c, 1).blob).toBe(original);
  });
  it.each([
    ['network', null, 'No se pudo confirmar'], ['signed_url_rejected', 403, 'El enlace de carga fue rechazado'],
    ['upload_conflict', 412, 'La carga requiere revisión'], ['payload_too_large', 413, 'Quita este archivo'],
    ['unsupported_media_type', 415, 'Quita este archivo'], ['unprocessable_upload', 422, 'Quita este archivo'],
  ] as const)('storage %s/%s follows recovery without unsafe replay', async (kind, status, copy) => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    await resolveAttempt(c, 0, { ok: false, failure: { source: 'storage', kind, status } });
    expect(screen.getByText(new RegExp(copy))).toBeDefined(); expect(screen.queryByRole('button', { name: /Reiniciar|Reintentar|Subir/ })).toBeNull();
    expect(screen.queryByText(/No tienes permiso/)).toBeNull(); expect(screen.getByRole('img')).toBeDefined(); expect(revoke).not.toHaveBeenCalled();
  });
  it('cancel after dispatch preserves local work but offers no replay/restart', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    act(() => { attemptOf(c).observer.onDispatch('storage'); attemptOf(c).observer.onPhase('uploading'); }); click('Cancelar carga de foto 1'); await flush();
    expect(screen.getByText(/Carga cancelada. Es necesario/)).toBeDefined(); expect(screen.queryByRole('button', { name: /Reiniciar|Subir/ })).toBeNull(); expect(screen.getByRole('img')).toBeDefined();
  });
  it('photo and video tasks remain isolated when video is removed during execution', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await chooseVideo(); await startPhoto(); click('Subir video'); await flush(); click('Quitar video'); await flush();
    expect(attemptOf(c).signal.aborted).toBe(false); expect(attemptOf(c, 1).signal.aborted).toBe(true); await resolveAttempt(c, 1, { ok: true, data: active() }); expect(screen.queryByText(/Guardado/)).toBeNull();
  });
  it.each(['tenant', 'identity', 'permissions', 'unmount'] as const)('%s change disposes tasks/subscriptions and rejects late results', async change => {
    const original = tasks.createUploadTask;
    const created: Pick<ReturnType<typeof tasks.createUploadTask>, 'getState' | 'dispose'>[] = [];
    vi.spyOn(tasks, 'createUploadTask').mockImplementation(<Input,>(executor: UploadExecutor<Input>) => { const task = original(executor); created.push(task); return task; }); const c = controlled(); const h = fixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    const task = created[0]; if (!task) throw new Error('Missing task'); const dispose = vi.spyOn(task, 'dispose');
    if (change === 'unmount') h.unmount(); else h.update({ ...h.runtime,
      ...(change === 'tenant' ? { tenantId: IDS.other } : change === 'identity' ? { identity: 'new-user' } : { permissions: PERMISSIONS }),
    }); await flush();
    expect(dispose).toHaveBeenCalled(); expect(task.getState()).toEqual({ phase: 'disposed' }); expect(attemptOf(c).signal.aborted).toBe(true); expect(revoke).toHaveBeenCalledTimes(1);
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(screen.queryByText(/Guardado/)).toBeNull(); expect(screen.queryByRole('img')).toBeNull();
  });
  it('cancellation restores keyboard focus to the allowed restart control', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    screen.getByRole('button', { name: 'Cancelar carga de foto 1' }).focus(); click('Cancelar carga de foto 1'); await flush();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reiniciar carga foto 1' }));
  });
  it('confirmation restores focus after removing the focused local card', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    screen.getByRole('button', { name: 'Cancelar carga de foto 1' }).focus(); await resolveAttempt(c, 0, { ok: true, data: active() });
    expect(document.activeElement).toBe(screen.getByRole('list', { name: 'Evidencia confirmada' }));
  });
  it('confirmation does not steal focus moved elsewhere during upload', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    screen.getByLabelText('Seleccionar fotos').focus(); await resolveAttempt(c, 0, { ok: true, data: active() });
    expect(document.activeElement).toBe(screen.getByLabelText('Seleccionar fotos'));
  });
  it('removing a photo disposes only its task and preserves the other original file', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); const second = file(); choosePhotos([file(), second]); await startPhoto(1); await startPhoto(2);
    click('Quitar foto 1'); await flush(); expect(attemptOf(c).signal.aborted).toBe(true); expect(attemptOf(c, 1).signal.aborted).toBe(false);
    expect(attemptOf(c, 1).blob).toBe(second); expect(screen.getAllByRole('img')).toHaveLength(1);
  });
  it('clear/reset releases all local photo tasks and preview ownership', async () => {
    const c = controlled(); const h = fixture(c.executor); await privacy(); choosePhotos([file(), file()]); await startPhoto(1); await startPhoto(2);
    click('Quitar todas las fotos'); await flush(); expect(c.attempts.every(item => item.signal.aborted)).toBe(true); expect(revoke).toHaveBeenCalledTimes(2); expect(h.pending).toHaveBeenLastCalledWith(false);
  });
  it('confirmed video releases local metadata/preview and leaves pending photo unchanged', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await chooseVideo(); click('Subir video'); await flush();
    await resolveAttempt(c, 0, { ok: true, data: active() }); expect(screen.getByText('Video · Guardado · Confirmado activo')).toBeDefined(); expect(screen.queryByLabelText('Vista previa del video seleccionado')).toBeNull();
    expect(screen.getByRole('img')).toBeDefined(); expect(screen.getByRole('button', { name: 'Subir foto 1' })).toBeDefined(); expect(revoke).toHaveBeenCalledTimes(1);
  });
  it('real byte progress changes only the progressbar; live copy stays stable', async () => {
    const c = controlled(); fixture(c.executor); await privacy(); choosePhotos(); await startPhoto();
    act(() => { attemptOf(c).observer.onPhase('uploading'); attemptOf(c).observer.onProgress({ loadedBytes: 2, totalBytes: 10 }); });
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('0.2'); expect(screen.getByText('Subiendo el archivo.')).toBeDefined(); expect(screen.queryByText(/Guardado/)).toBeNull();
  });
  it('StrictMode lifecycle creates usable tasks with balanced final disposal', async () => {
    const c = controlled(); const h = fixture(c.executor, permissions, true); await privacy(); choosePhotos(); await startPhoto(); expect(c.attempts).toHaveLength(1); h.unmount(); await flush(); expect(attemptOf(c).signal.aborted).toBe(true);
  });
});

describe('F05 through F01 + F04, synthetic adapter only', () => {
  function realStack() {
    const put = deferred<{ ok: true; data: null }>(); const complete = deferred<{ ok: true; data: unknown }>();
    const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'no_session' }) });
    const api: MediaApiAdapter<undefined> = {
      createUploadSession: vi.fn(() => Promise.resolve({ ok: true as const, data: { uploadSessionId: IDS.consent, mediaAssetId: IDS.other, status: 'pending', uploadMethod: 'PUT', uploadUrl: 'https://storage.example.test/synthetic', uploadHeaders: {}, objectKey: 'synthetic', expiresAt: '2099-01-01T00:00:00Z' } })),
      completeUploadSession: vi.fn(() => complete.promise),
    };
    const transport = vi.fn(() => put.promise);
    const executor = createMediaClient({ client, api, uploadTransport: transport });
    return { put, complete, api, transport, executor };
  }
  it('PUT 2xx alone shows confirming; only parsed active completion replaces the local item', async () => {
    const stack = realStack(); fixture(stack.executor); await privacy(); choosePhotos(); await startPhoto();
    expect(stack.transport).toHaveBeenCalledTimes(1); expect(screen.getByText('Subiendo el archivo.')).toBeDefined(); expect(screen.queryByText(/Guardado/)).toBeNull();
    act(() => { stack.put.resolve({ ok: true, data: null }); }); await flush();
    expect(screen.getByText('Confirmando la carga.')).toBeDefined(); expect(screen.queryByText(/Guardado/)).toBeNull(); expect(screen.getByRole('img')).toBeDefined();
    act(() => { stack.complete.resolve({ ok: true, data: active() }); }); await flush();
    expect(screen.getByText(/Guardado · Confirmado activo/)).toBeDefined(); expect(screen.queryByRole('img')).toBeNull();
  });
  it.each(['pending_upload', 'uploaded', 'quarantined', 'deleted'])('completion status %s remains ambiguous and never saved', async status => {
    const stack = realStack(); fixture(stack.executor); await privacy(); choosePhotos(); await startPhoto();
    act(() => { stack.put.resolve({ ok: true, data: null }); }); await flush(); act(() => { stack.complete.resolve({ ok: true, data: { ...active(), status } }); }); await flush();
    expect(screen.getByText(/No se pudo confirmar el resultado/)).toBeDefined(); expect(screen.queryByText(/Guardado/)).toBeNull(); expect(screen.queryByRole('button', { name: /Reiniciar|Subir/ })).toBeNull();
  });
});
