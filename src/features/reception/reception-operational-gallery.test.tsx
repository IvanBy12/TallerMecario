import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DETAIL, IDS, PERMISSIONS, TIME, jsonResponse, renderReception, type Call } from '@/test/render-reception';
import type { FetchResponse } from '@/shared/api/http-client';
const asset = '88888888-8888-4888-8888-888888888888';
const signed = 'https://storage.example.test/object?signature=synthetic-private';
const permissions = [...PERMISSIONS, { code: 'media.read', scopes: ['tenant' as const] }];
const dto = { mediaAssetId: asset, mediaType: 'photo', mimeType: 'image/png', sizeBytes: 3,
  capturedAt: TIME, uploadedAt: TIME, purpose: 'intake_evidence', sortOrder: 9 };
function download(expiresAt = new Date(Date.now() + 60000).toISOString(), downloadUrl = signed) {
  return jsonResponse({ mediaAssetId: asset, downloadUrl, expiresAt });
}
function setup(media: unknown = [dto], read: (call: Call) => FetchResponse | Promise<FetchResponse> = () => download()) {
  return renderReception(`/recepciones/${IDS.reception}`, call =>
    call.url.pathname.endsWith('/download-url') ? read(call) :
      call.url.pathname.endsWith('/media') ? jsonResponse({ media }) : jsonResponse({ reception: DETAIL }), permissions, true);
}
async function open() { fireEvent.click(await screen.findByRole('button', { name: 'Ver Foto 1' })); }
function fail(status: number) {
  return jsonResponse({ error: { code: status === 403 ? 'PERMISSION_DENIED' : 'MEDIA_ASSET_NOT_FOUND', message: signed, request_id: signed } }, status);
}
afterEach(() => { vi.useRealTimers(); });
describe('operational gallery in reception detail with production provider/client/parser', () => {
  it('shows empty and preserves reception/history without binary or download requests', async () => {
    const h = setup([]);
    await screen.findByText('No hay evidencias asociadas a esta recepción.');
    expect(screen.getByText(`${String(DETAIL.mileageKm)} km`)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver a recepciones' })).toBeTruthy();
    expect(h.calls.some(c => c.url.pathname.endsWith('/download-url'))).toBe(false);
    expect(screen.queryByRole('img')).toBeNull();
  });
  it('preserves backend order/types including null metadata; requests only selected asset', async () => {
    const h = setup([{ ...dto, mediaAssetId: IDS.other, mediaType: 'video360', mimeType: 'video/mp4', sortOrder: 20 },
      dto, { ...dto, mediaAssetId: IDS.vehicle, mediaType: 'video', mimeType: 'video/mp4', sortOrder: 0,
        sizeBytes: null, capturedAt: null, uploadedAt: null }]);
    await screen.findByRole('button', { name: 'Ver Foto 2' });
    const gallery = screen.getByRole('region', { name: 'Evidencia de recepción' });
    expect(within(gallery).getAllByRole('heading', { level: 3 }).map(e => e.textContent)).toEqual(['Video 360° 1', 'Foto 2', 'Video 3']);
    expect(h.calls.every(c => !c.url.pathname.endsWith('/download-url'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ver Foto 2' }));
    const img = await screen.findByRole('img');
    expect(img.getAttribute('src')).toBe(signed);
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img.getAttribute('crossorigin')).toBe('anonymous');
    expect(h.calls.filter(c => c.url.pathname.endsWith('/download-url'))).toHaveLength(1);
    expect(h.calls.at(-1)?.init).toMatchObject({ cache: 'no-store', headers: { 'X-Tenant-Id': IDS.tenant } });
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Foto 2' }));
    expect(screen.queryByRole('img')).toBeNull();
  });
  it.each(['video', 'video360'])('shows %s with controls and no preload/autoplay', async mediaType => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    const h = setup([{ ...dto, mediaType, mimeType: 'video/mp4' }]);
    fireEvent.click(await screen.findByRole('button', { name: mediaType === 'video' ? 'Ver Video 1' : 'Ver Video 360° 1' }));
    await waitFor(() => { expect(h.container.querySelector('video')).toBeTruthy(); });
    const video = h.container.querySelector('video');
    expect(video?.getAttribute('preload')).toBe('none');
    expect(video?.hasAttribute('controls')).toBe(true);
    expect(video?.hasAttribute('autoplay')).toBe(false);
    if (video === null) throw new Error("Expected video element");
    fireEvent.error(video);
    expect(h.container.querySelector('video')).toBeNull();
    expect(video.hasAttribute('src')).toBe(false);
    expect(pause).toHaveBeenCalled(); expect(load).toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('No se pudo visualizar');
  });
  it.each([null, {}, [{ ...dto, mediaType: 'signature' }], [dto, { ...dto, purpose: 'invalid' }]])('rejects whole malformed list %#', async media => {
    const h = setup(media);
    await screen.findByRole('button', { name: 'Consultar evidencias de nuevo' });
    expect(screen.queryByRole('button', { name: /Ver Foto/ })).toBeNull();
    expect(h.calls.some(c => c.url.pathname.endsWith('/download-url'))).toBe(false);
  });
  it.each(['http://unsafe.test', 'https://user:pass@unsafe.test/object', 'https://unsafe.test/#private'])('rejects invalid signed URL %s', async url => {
    setup([dto], () => download(undefined, url)); await open();
    await screen.findByRole('alert'); expect(screen.queryByRole('img')).toBeNull();
    expect(document.body.textContent).not.toContain(url);
  });
  it('rejects already expired URL and only reacquires upon another user action', async () => {
    let count = 0;
    const h = setup([dto], () => ++count === 1 ? download('2020-01-01T00:00:00Z') : download());
    await open(); await screen.findByText(/El acceso temporal expiró/);
    expect(screen.queryByRole('img')).toBeNull(); expect(count).toBe(1);
    await open(); await screen.findByRole('img'); expect(count).toBe(2);
    expect(h.calls.filter(c => c.url.pathname.endsWith('/download-url'))).toHaveLength(2);
  });
  it('removes displayed URL at expiry and checks expiry after tab resume', async () => {
    vi.useFakeTimers();
    let calls: readonly Call[] = [];
    await act(() => Promise.resolve().then(() => { calls = setup([dto], () => download(new Date(Date.now() + 1000).toISOString())).calls; }));
    await act(() => Promise.resolve().then(() => { fireEvent.click(screen.getByRole('button', { name: 'Ver Foto 1' })); }));
    expect(screen.getByRole('img')).toBeTruthy();
    act(() => { vi.setSystemTime(Date.now() + 1001); window.dispatchEvent(new Event('focus')); });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/El acceso temporal expiró/)).toBeTruthy();
    expect(calls.filter(c => c.url.pathname.endsWith('/download-url'))).toHaveLength(1);
  });
  it('expires on timer without any user interaction', async () => {
    vi.useFakeTimers();
    await act(() => Promise.resolve().then(() => { setup([dto], () => download(new Date(Date.now() + 1000).toISOString())); }));
    await act(() => Promise.resolve().then(() => { fireEvent.click(screen.getByRole('button', { name: 'Ver Foto 1' })); }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.queryByRole('img')).toBeNull(); expect(screen.getByText(/El acceso temporal expiró/)).toBeTruthy();
  });
  it.each([401, 403, 404])('download HTTP %s shows safe error, no URL or unsafe request reference', async status => {
    const log = vi.spyOn(console, 'log'), error = vi.spyOn(console, 'error');
    const h = setup([dto], () => fail(status)); await open(); await screen.findByRole('alert');
    expect(screen.queryByRole('img')).toBeNull();
    expect(h.container.innerHTML).not.toContain(signed);
    expect(JSON.stringify([log.mock.calls, error.mock.calls])).not.toContain(signed);
    expect(h.calls.filter(c => c.url.pathname.endsWith('/download-url'))).toHaveLength(status === 401 ? 2 : 1);
    expect(JSON.stringify(localStorage)).not.toContain(signed); expect(JSON.stringify(sessionStorage)).not.toContain(signed);
  });
  it('removes inaccessible binary URL and never retries storage automatically', async () => {
    const h = setup(); await open(); fireEvent.error(await screen.findByRole('img'));
    expect(screen.queryByRole('img')).toBeNull(); expect(h.container.innerHTML).not.toContain(signed);
    await screen.findByText(/No se pudo visualizar/);
    expect(h.calls.filter(c => c.url.pathname.endsWith('/download-url'))).toHaveLength(1);
  });
  it('does not consult media without tenant permission (assigned remains fail closed)', async () => {
    const h = renderReception(`/recepciones/${IDS.reception}`, () => jsonResponse({ reception: DETAIL }),
      [...PERMISSIONS, { code: 'media.read', scopes: ['assigned'] }]);
    await screen.findByText('No tienes permiso para consultar evidencias.');
    expect(h.calls.some(c => c.url.pathname.endsWith('/media'))).toBe(false);
  });
  it.each(['identity', 'tenantId', 'permissions'] as const)('invalidates displayed URL on %s change', async field => {
    const h = setup(); await open(); await screen.findByRole('img');
    act(() => { h.updateRuntime({ ...h.runtime, [field]: field === 'permissions' ? PERMISSIONS : IDS.other }); });
    expect(screen.queryByRole('img')).toBeNull(); expect(h.container.innerHTML).not.toContain(signed);
  });
  it.each(['list', 'download'] as const)('aborts %s on unmount and discards late success', async stage => {
    let resolve!: (value: FetchResponse) => void;
    const pending = new Promise<FetchResponse>(done => { resolve = done; });
    const h = renderReception(`/recepciones/${IDS.reception}`, call => call.url.pathname.endsWith('/media') ?
      stage === 'list' ? pending : jsonResponse({ media: [dto] }) :
      call.url.pathname.endsWith('/download-url') ? pending : jsonResponse({ reception: DETAIL }), permissions);
    if (stage === 'download') await open();
    await waitFor(() => { expect(h.calls.some(c => c.url.pathname.endsWith(stage === 'list' ? '/media' : '/download-url'))).toBe(true); });
    const request = h.calls.find(c => c.url.pathname.endsWith(stage === 'list' ? '/media' : '/download-url'));
    h.unmount(); expect(request?.init.signal?.aborted).toBe(true);
    await act(() => Promise.resolve().then(() => { resolve(stage === 'list' ? jsonResponse({ media: [dto] }) : download()); }));
    expect(h.container.innerHTML).not.toContain(signed);
  });
  it.each([401, 403, 404])('list HTTP %s retains reception and safely reports rejection', async status => {
    const h = renderReception(`/recepciones/${IDS.reception}`, call => call.url.pathname.endsWith('/media') ?
      fail(status) : jsonResponse({ reception: DETAIL }), permissions);
    await screen.findByRole('button', { name: 'Consultar evidencias de nuevo' });
    expect(screen.getByText(`${String(DETAIL.mileageKm)} km`)).toBeTruthy();
    expect(h.container.innerHTML).not.toContain(signed);
    expect(h.calls.filter(c => c.url.pathname.endsWith('/media'))).toHaveLength(status === 401 ? 2 : 1);
  });
  it('shows loading then an error, and retries list only on explicit action', async () => {
    let resolve!: (value: FetchResponse) => void;
    const pending = new Promise<FetchResponse>(done => { resolve = done; });
    let count = 0;
    const h = renderReception(`/recepciones/${IDS.reception}`, call => call.url.pathname.endsWith('/media') ?
      ++count === 1 ? pending : jsonResponse({ media: [] }) : jsonResponse({ reception: DETAIL }), permissions);
    await screen.findByText('Consultando evidencias…');
    await act(() => Promise.resolve().then(() => { resolve(fail(404)); }));
    expect(count).toBe(1);
    fireEvent.click(await screen.findByRole('button', { name: 'Consultar evidencias de nuevo' }));
    await screen.findByText('No hay evidencias asociadas a esta recepción.'); expect(count).toBe(2);
    expect(h.calls.some(c => c.url.pathname.endsWith('/download-url'))).toBe(false);
  });
  it.each(['identity', 'tenantId'] as const)('cancels pending list on %s change and cannot populate new context', async field => {
    let resolve!: (value: FetchResponse) => void;
    const pending = new Promise<FetchResponse>(done => { resolve = done; });
    let changed = false;
    const h = renderReception(`/recepciones/${IDS.reception}`, call => call.url.pathname.endsWith('/media') ?
      changed ? jsonResponse({ media: [] }) : pending : jsonResponse({ reception: DETAIL }), permissions);
    await screen.findByText('Consultando evidencias…');
    const old = h.calls.find(c => c.url.pathname.endsWith('/media'));
    changed = true;
    act(() => { h.updateRuntime({ ...h.runtime, [field]: IDS.other }); });
    expect(old?.init.signal?.aborted).toBe(true);
    await screen.findByText('No hay evidencias asociadas a esta recepción.');
    await act(() => Promise.resolve().then(() => { resolve(jsonResponse({ media: [dto] })); }));
    expect(screen.queryByRole('button', { name: 'Ver Foto 1' })).toBeNull();
    if (field === 'tenantId') expect(h.calls.at(-1)?.init.headers).toMatchObject({ 'X-Tenant-Id': IDS.other });
  });
  it.each(['identity', 'tenantId'] as const)('cancels pending download on %s change and discards late URL', async field => {
    let resolve!: (value: FetchResponse) => void;
    const pending = new Promise<FetchResponse>(done => { resolve = done; });
    const h = setup([dto], () => pending); await open();
    await screen.findByText('Solicitando acceso temporal…');
    const old = h.calls.find(c => c.url.pathname.endsWith('/download-url'));
    act(() => { h.updateRuntime({ ...h.runtime, [field]: IDS.other }); });
    expect(old?.init.signal?.aborted).toBe(true);
    await act(() => Promise.resolve().then(() => { resolve(download()); }));
    expect(screen.queryByRole('img')).toBeNull(); expect(h.container.innerHTML).not.toContain(signed);
  });
  it('canceling a pending view discards late capability; re-opening requests a fresh URL', async () => {
    let resolve!: (value: FetchResponse) => void;
    const pending = new Promise<FetchResponse>(done => { resolve = done; });
    let count = 0;
    const h = setup([dto], () => ++count === 1 ? pending : download()); await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Ocultar Foto 1' }));
    const old = h.calls.find(c => c.url.pathname.endsWith('/download-url'));
    expect(old?.init.signal?.aborted).toBe(true);
    await act(() => Promise.resolve().then(() => { resolve(download()); }));
    expect(screen.queryByRole('img')).toBeNull();
    await open(); await screen.findByRole('img'); expect(count).toBe(2);
  });
  it('success never writes the signed URL to storage, logs or API requests', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    const h = setup(); await open(); await screen.findByRole('img');
    expect(storage).not.toHaveBeenCalled();
    expect(JSON.stringify(logs.map(log => log.mock.calls))).not.toContain(signed);
    expect(JSON.stringify(h.calls)).not.toContain(signed);
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Foto 1' }));
    expect(h.container.innerHTML).not.toContain(signed);
  });
  it('historical closed reception keeps checklist/damages/order while gallery is empty', async () => {
    renderReception(`/recepciones/${IDS.reception}`, call => call.url.pathname.endsWith('/media') ? jsonResponse({ media: [] }) :
      jsonResponse({ reception: { ...DETAIL, status: 'closed', closedAt: TIME,
        serviceOrder: { id: IDS.other, orderNumber: 'OS-TEST', status: 'open' } } }), permissions);
    await screen.findByText('No hay evidencias asociadas a esta recepción.');
    expect(screen.getByText('Cerrada')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Checklist' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Daños' })).toBeTruthy();
    expect(document.body.textContent).toContain('OS-TEST');
  });

  it.each(['list', 'download'] as const)('honors Retry-After for %s without automatic retries', async stage => {
    vi.useFakeTimers();
    let calls: readonly Call[] = [];
    await act(() => Promise.resolve().then(() => {
      calls = renderReception(`/recepciones/${IDS.reception}`, call =>
        call.url.pathname.endsWith(stage === 'list' ? '/media' : '/download-url') ?
          jsonResponse({ error: { code: 'RATE_LIMIT_EXCEEDED' } }, 429, '1') :
          call.url.pathname.endsWith('/media') ? jsonResponse({ media: [dto] }) : jsonResponse({ reception: DETAIL }), permissions).calls;
    }));
    if (stage === 'download') await act(() => Promise.resolve().then(() => { fireEvent.click(screen.getByRole('button', { name: 'Ver Foto 1' })); }));
    const button = screen.getByRole('button', { name: stage === 'list' ? 'Consultar evidencias de nuevo' : 'Ver Foto 1' });
    expect(button.hasAttribute('disabled')).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(calls.filter(c => c.url.pathname.endsWith(stage === 'list' ? '/media' : '/download-url'))).toHaveLength(1);
  });

});
