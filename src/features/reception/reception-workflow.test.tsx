import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReceptionProvider } from './reception-context';
import { ReceptionDetailPage } from './reception-detail-page';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type FetchResponse } from '@/shared/api/http-client';
import { DETAIL, TECH, SUMMARY, IDS, TIME, PERMISSIONS, jsonResponse, errorResponse, renderReception, type Call } from '@/test/render-reception';
import { normalizePermissions } from '@/shared/auth/effective-permissions';
import { createReceptionApi } from './reception-api';
import { RECEPTION_ACCEPTANCE } from './reception-acceptance';
import { putSignature } from './reception-media-upload';
import { canvasPng } from './reception-signature-pad';
import { parseReceptionDetail, type ReceptionDetail } from './reception-contract';
import { parseActiveMedia, parseAttachedSignature, parseClosedReception, parseUploadSession } from './reception-workflow-contract';
const MEDIA = IDS.other, SESSION = IDS.consent;
const SIGNATURE = { signatureId: IDS.membership, documentVersion: RECEPTION_ACCEPTANCE.documentVersion, signedAt: TIME };
const ATTACHED = { ...SIGNATURE, receptionId: IDS.reception, signatureMediaId: MEDIA };
const ORDER = { id: IDS.other, receptionId: IDS.reception, vehicleId: IDS.vehicle, customerId: IDS.customer, orderNumber: '123', status: 'reception', openedAt: TIME, version: 1 };
const CLOSED = { reception: { id: IDS.reception, status: 'closed', closedAt: TIME, updatedAt: TIME }, serviceOrder: ORDER };
const SIGNED = { ...DETAIL, signature: SIGNATURE };
const FINAL = { ...SIGNED, status: 'closed' as const, closedAt: TIME, serviceOrder: { id: ORDER.id, orderNumber: ORDER.orderNumber, status: ORDER.status } };
const UPLOAD = { uploadSessionId: SESSION, mediaAssetId: MEDIA, status: 'pending' as const, uploadUrl: 'https://storage.example.test/signature?presigned=opaque', uploadMethod: 'PUT' as const, uploadHeaders: { 'Content-Type': 'image/png', 'x-amz-meta-test': 'opaque', 'If-None-Match': '*' }, objectKey: 'internal', expiresAt: TIME };
const BLOB = new Blob(['synthetic ink'], { type: 'image/png' });
const ACTIVE = { mediaAssetId: MEDIA, status: 'active', sizeBytes: BLOB.size, checksumSha256: null };
const permissions = [...PERMISSIONS, ...['signatures.capture', 'media.upload', 'receptions.close'].map(code => ({ code, scopes: ['tenant'] }))];
const route = '/recepciones/' + IDS.reception;
const body = (call: Call | undefined): unknown => typeof call?.init.body === 'string' ? JSON.parse(call.init.body) : undefined;
const mutation = (calls: Call[], suffix: string) => calls.filter(call => call.init.method === 'POST' && call.url.pathname.endsWith(suffix));
const originalContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
const originalDialog = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const uuidMatcher: unknown = expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const signalMatcher: unknown = expect.any(AbortSignal);
let clearCanvas = vi.fn();
let pngExport = vi.fn<(callback: BlobCallback, type?: string) => void>();
let current: ReceptionDetail;
let storage = vi.fn<(url: string, init: RequestInit) => Promise<FetchResponse>>();
function defaults(call: Call): FetchResponse {
    if (call.url.pathname === '/api/v1/reception-acceptance-document') return jsonResponse({ acceptanceDocument: RECEPTION_ACCEPTANCE });
    if (call.init.method === 'GET') return jsonResponse({ reception: current });
    if (call.url.pathname.endsWith('/complete')) return jsonResponse(ACTIVE);
    if (call.url.pathname.endsWith('/upload-sessions')) return jsonResponse(UPLOAD);
    if (call.url.pathname.endsWith('/signature')) { current = SIGNED; return jsonResponse({ signature: ATTACHED }, 201); }
    if (call.url.pathname.endsWith('/close')) { current = FINAL; return jsonResponse(CLOSED); }
    return jsonResponse(null);
}
beforeEach(() => {
    current = DETAIL;
    storage = vi.fn(() => Promise.resolve(jsonResponse(null)));
    vi.stubGlobal('fetch', storage);
    Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });

    // The adapter is mocked at the browser boundary; real pointer handlers and export path remain exercised.
    clearCanvas = vi.fn();
    const context = { clearRect: clearCanvas, beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), lineWidth: 1, lineCap: 'round', lineJoin: 'round', strokeStyle: '' };
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: vi.fn(() => context) });
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 10, y: 20, top: 20, left: 10, bottom: 220, right: 310, width: 300, height: 200, toJSON: () => ({}) });
    pngExport = vi.fn(callback => { callback(BLOB); });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(pngExport);
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
});
afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    if (originalContext) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalContext);
    if (originalDialog) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalDialog);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    Reflect.deleteProperty(HTMLCanvasElement.prototype, 'setPointerCapture');
});
async function draw() {
    const canvas = await screen.findByLabelText('Firma manuscrita de recepción');
    await waitFor(() => { expect(canvas.getAttribute('aria-disabled')).toBe('false'); });
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 35, clientY: 70, pointerType: 'touch' });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 55, clientY: 90, pointerType: 'touch' });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
}
async function prepare(document = '') {
    await draw();
    fireEvent.change(screen.getByLabelText('Nombre del firmante *'), { target: { value: 'Persona de prueba' } });
    if (document) fireEvent.change(screen.getByLabelText('Documento del firmante (opcional)'), { target: { value: document } });
    fireEvent.click(screen.getByLabelText('He leído el documento de aceptación mostrado.'));
}
function sign() { fireEvent.click(screen.getByRole('button', { name: 'Registrar firma' })); }
async function confirmation() {
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar recepción' }));
    return await screen.findByRole('dialog');
}
async function confirmClose() { fireEvent.click(within(await confirmation()).getByRole('button', { name: 'Cerrar recepción' })); }
describe('immutable published acceptance', () => {
    it('pins the exact v1 text independently of the implementation', () => {
        expect(Object.isFrozen(RECEPTION_ACCEPTANCE)).toBe(true);
        expect(RECEPTION_ACCEPTANCE.documentVersion).toBe('reception_acceptance_es-CO_v1');
        expect(RECEPTION_ACCEPTANCE.text).toBe(`ACEPTACIÓN DE RECEPCIÓN DEL VEHÍCULO

Declaro que entrego voluntariamente al taller el vehículo identificado en esta recepción y que tuve la oportunidad de revisar la información registrada al momento de la entrega, incluyendo kilometraje, nivel de combustible, observaciones y el estado o daños que hayan sido consignados.

Autorizo al taller a realizar las inspecciones y actividades de diagnóstico necesarias para evaluar el vehículo y preparar una cotización. Esta aceptación no autoriza reparaciones, instalación de repuestos, trabajos adicionales ni cargos; cualquiera de esas actuaciones requerirá una autorización posterior e independiente cuando corresponda.

Reconozco que esta firma se conserva como evidencia de la recepción del vehículo y del contenido exacto de esta aceptación.

Esta aceptación no sustituye autorizaciones de tratamiento de datos personales, marketing, WhatsApp, cotizaciones, reparaciones ni otros consentimientos o autorizaciones que deban obtenerse por separado.`);
    });
});
describe('signature wire and UI', () => {
    it.each(['', 'DOC-SINTETICO'])('uploads a real PNG and attaches with optional document "%s"', async document => {
        const h = renderReception(route, defaults, permissions);
        await prepare(document); sign();
        await screen.findByText('Firma registrada');
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(1);
        const payload = body(mutation(h.calls, '/upload-sessions')[0]);
        expect(payload).toEqual({ mediaType: 'signature', mimeType: 'image/png', retentionClass: 'authorization_evidence', expectedSizeBytes: BLOB.size, idempotencyKey: uuidMatcher });
        expect(storage).toHaveBeenCalledExactlyOnceWith(UPLOAD.uploadUrl, { method: 'PUT', headers: UPLOAD.uploadHeaders, body: BLOB, credentials: 'omit', redirect: 'error', signal: signalMatcher });
        expect(mutation(h.calls, '/complete')[0]?.url.pathname).toBe('/api/v1/media/upload-sessions/' + SESSION + '/complete');
        expect(body(mutation(h.calls, '/signature')[0])).toEqual({ signatureMediaId: MEDIA, signedByName: 'Persona de prueba', signedByDocument: document || null, documentVersion: 'reception_acceptance_es-CO_v1' });
        expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
        expect(screen.queryByDisplayValue('Persona de prueba')).toBeNull();
    });
    it('empty canvas, missing name and unchecked reading never submit; clearing removes ink', async () => {
        const h = renderReception(route, defaults, permissions);
        const send = await screen.findByRole('button', { name: 'Registrar firma' });
        fireEvent.click(send); expect(mutation(h.calls, '/upload-sessions')).toHaveLength(0);
        await draw(); expect(send.hasAttribute('disabled')).toBe(true);
        fireEvent.change(screen.getByLabelText('Nombre del firmante *'), { target: { value: 'Prueba' } });
        expect(send.hasAttribute('disabled')).toBe(true);
        fireEvent.click(screen.getByLabelText('He leído el documento de aceptación mostrado.'));
        expect(send.hasAttribute('disabled')).toBe(false);
        fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
        expect(send.hasAttribute('disabled')).toBe(true);
        fireEvent.click(send); expect(mutation(h.calls, '/upload-sessions')).toHaveLength(0);
        expect(pngExport).not.toHaveBeenCalled();
    });
    it('adapter exports only nonempty image/png', async () => {
        const canvas = document.createElement('canvas');
        expect(await canvasPng(canvas, true)).toBeNull();
        expect(await canvasPng(canvas, false)).toBe(BLOB);
        expect(pngExport).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    });
    it.each([
        [{ code: 'receptions.read', scopes: ['tenant'] }, { code: 'signatures.capture', scopes: ['tenant'] }],
        [{ code: 'receptions.read', scopes: ['assigned'] }, { code: 'signatures.capture', scopes: ['assigned'] }, { code: 'media.upload', scopes: ['assigned'] }],
    ].map(grants => ({ grants })))('requires both tenant grants and never promotes assigned', async ({ grants }) => {
        renderReception(route, () => jsonResponse({ reception: TECH }), grants);
        await screen.findByRole('heading', { name: 'Firma de recepción' });
        expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
    });
    it.each([SIGNED, FINAL])('existing signature and closed reception have no canvas', async detail => {
        renderReception(route, () => jsonResponse({ reception: detail }), permissions);
        await screen.findByText('Firma registrada');
        expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
        expect(screen.queryByRole('img')).toBeNull();
    });
    it('double click makes one upload and blocks new capture during upload', async () => {
        let resolve: ((r: FetchResponse) => void) | undefined;
        storage.mockImplementation(() => new Promise(r => { resolve = r; }));
        const h = renderReception(route, defaults, permissions);
        await prepare(); const button = screen.getByRole('button', { name: 'Registrar firma' });
        fireEvent.click(button); fireEvent.click(button);
        await screen.findByText('Subiendo firma…');
        expect(screen.getByRole('button', { name: 'Limpiar' }).hasAttribute('disabled')).toBe(true);
        expect(mutation(h.calls, '/signature')).toHaveLength(0);
        await act(() => { resolve?.(jsonResponse(null)); return Promise.resolve(); });
        await screen.findByText('Firma registrada');
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(1);
    });
    it('upload failure preserves the Blob and idempotency key for explicit retry', async () => {
        storage.mockRejectedValueOnce(new Error('synthetic failure'));
        const h = renderReception(route, defaults, permissions);
        await prepare(); sign();
        await screen.findByText(/No hay conexión/);
        expect(mutation(h.calls, '/signature')).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro de firma' }));
        await screen.findByText('Firma registrada');
        const keys = mutation(h.calls, '/upload-sessions').map(c => body(c));
        expect(keys).toHaveLength(1); expect(storage).toHaveBeenCalledTimes(2);
        expect(storage.mock.calls[0]?.[1].body).toBe(BLOB); expect(storage.mock.calls[1]?.[1].body).toBe(BLOB);
    });
    it.each(['UPLOAD_SESSION_EXPIRED', 'UPLOAD_SESSION_FAILED'])('explicit restart after %s creates a new key with the same Blob', async code => {
        let failed = false;
        const h = renderReception(route, call => {
            if (call.url.pathname.endsWith('/complete') && !failed) { failed = true; return errorResponse(code); }
            return defaults(call);
        }, permissions);
        await prepare(); sign(); await screen.findByRole('button', { name: 'Reiniciar subida' });
        fireEvent.click(screen.getByRole('button', { name: 'Reiniciar subida' }));
        await screen.findByText('Firma registrada');
        const payloads = mutation(h.calls, '/upload-sessions').map(c => body(c));
        expect(payloads[0]).not.toEqual(payloads[1]); expect(storage.mock.calls[1]?.[1].body).toBe(BLOB);
    });
    it('attach failure retries the same active media without another upload', async () => {
        let count = 0;
        const h = renderReception(route, call => call.url.pathname.endsWith('/signature') && ++count === 1 ? errorResponse('REQUEST_VALIDATION_FAILED', 400) : defaults(call), permissions);
        await prepare(); sign(); await screen.findByText('Revisa los datos ingresados.');
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro de firma' }));
        await screen.findByText('Firma registrada');
        expect(storage).toHaveBeenCalledTimes(1);
        expect(mutation(h.calls, '/complete')).toHaveLength(1);
        expect(mutation(h.calls, '/signature').map(c => body(c))).toEqual([body(mutation(h.calls, '/signature')[0]), body(mutation(h.calls, '/signature')[0])]);
    });
    it.each(['network', 'RECEPTION_ALREADY_SIGNED', 'SIGNATURE_MEDIA_ALREADY_USED'])('reconciles %s through GET before duplicating attach', async error => {
        const h = renderReception(route, call => {
            if (call.url.pathname.endsWith('/signature')) { current = SIGNED; if (error === 'network') return Promise.reject(new Error('ambiguous')); return errorResponse(error); }
            return defaults(call);
        }, permissions);
        await prepare(); sign(); await screen.findByText('Firma registrada');
        expect(mutation(h.calls, '/signature')).toHaveLength(1); expect(storage).toHaveBeenCalledTimes(1);
    });
    it('network ambiguity with no signature permits explicit attach retry only', async () => {
        let count = 0;
        const h = renderReception(route, call => call.url.pathname.endsWith('/signature') && ++count === 1 ? Promise.reject(new Error('ambiguous')) : defaults(call), permissions);
        await prepare(); sign(); await screen.findByText(/No hay conexión/);
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro de firma' }));
        await screen.findByText('Firma registrada'); expect(storage).toHaveBeenCalledTimes(1);
        expect(mutation(h.calls, '/signature')).toHaveLength(2);
    });
    it.each(['tenantId', 'identity', 'permissions'] as const)('invalidates a pending upload when %s changes', async field => {
        let resolve: ((r: FetchResponse) => void) | undefined;
        storage.mockImplementation(() => new Promise(r => { resolve = r; }));
        const h = renderReception(route, defaults, permissions);
        await prepare(); sign(); await screen.findByText('Subiendo firma…');
        h.updateRuntime({ ...h.runtime, ...(field === 'tenantId' ? { tenantId: IDS.other } : field === 'identity' ? { identity: 'next-session' } : { permissions: PERMISSIONS }) });
        expect(storage.mock.calls[0]?.[1].signal?.aborted).toBe(true);
        expect(screen.queryByDisplayValue('Persona de prueba')).toBeNull();
        if (field === 'permissions') {
            expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
            expect(screen.queryByRole('button', { name: 'Registrar firma' })).toBeNull();
            expect(screen.queryByRole('button', { name: 'Cerrar recepción' })).toBeNull();
        }
        await act(() => { resolve?.(jsonResponse(null)); return Promise.resolve(); });
        expect(storage.mock.calls[0]?.[1].signal?.aborted).toBe(true);
        expect(mutation(h.calls, '/complete')).toHaveLength(0); expect(mutation(h.calls, '/signature')).toHaveLength(0);
        expect(screen.queryByDisplayValue('Persona de prueba')).toBeNull();
    });
    it('rejects inactive or mismatched media before attach', async () => {
        const h = renderReception(route, call => call.url.pathname.endsWith('/complete') ? jsonResponse({ ...ACTIVE, mediaAssetId: IDS.vehicle }) : defaults(call), permissions);
        await prepare(); sign(); await screen.findByRole('alert');
        expect(mutation(h.calls, '/signature')).toHaveLength(0);
    });
    it('works under StrictMode', async () => {
        renderReception(route, defaults, permissions, true); await prepare(); sign(); await screen.findByText('Firma registrada');
    });
});
describe('close and handoff', () => {
    it.each([
        [{ code: 'receptions.read', scopes: ['tenant'] }],
        [{ code: 'receptions.read', scopes: ['assigned'] }, { code: 'receptions.close', scopes: ['assigned'] }],
    ].map(grants => ({ grants })))('no functional close without tenant close grant', async ({ grants }) => {
        renderReception(route, () => jsonResponse({ reception: SIGNED }), grants);
        await screen.findByText('Firma registrada'); expect(screen.queryByRole('button', { name: 'Cerrar recepción' })).toBeNull();
    });
    it('missing signature blocks close independently of checklist and damages', async () => {
        renderReception(route, defaults, permissions);
        await screen.findByText('Registra la firma de recepción antes de cerrarla.');
        expect(screen.queryByRole('button', { name: 'Cerrar recepción' })).toBeNull();
    });
    it('requires confirmation, sends no body, closes once and shows real order', async () => {
        current = SIGNED;
        const h = renderReception(route, defaults, permissions);
        const dialog = await confirmation();
        expect(mutation(h.calls, '/close')).toHaveLength(0);
        expect(within(dialog).getByText(/Al cerrar la recepción se creará/)).toBeDefined();
        const button = within(dialog).getByRole('button', { name: 'Cerrar recepción' });
        fireEvent.click(button); fireEvent.click(button);
        await screen.findByText('Orden #123');
        expect(mutation(h.calls, '/close')).toHaveLength(1);
        expect(mutation(h.calls, '/close')[0]?.init.body).toBeUndefined();
        expect(mutation(h.calls, '/close')[0]?.init.headers).not.toHaveProperty('Content-Type');
        expect(screen.getByText('Cerrada')).toBeDefined(); expect(screen.getByText('Estado: Recepción')).toBeDefined();
        expect(screen.getByText('Fecha de apertura: ' + TIME)).toBeDefined();
        expect(screen.queryByRole('button', { name: 'Editar recepción' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cerrar recepción' })).toBeNull();
        expect(document.querySelector('a[href^="/ordenes"]')).toBeNull();
    });
    it('cancel confirmation does not POST', async () => {
        current = SIGNED; const h = renderReception(route, defaults, permissions);
        fireEvent.click(within(await confirmation()).getByRole('button', { name: 'Cancelar' }));
        expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar recepción' })); expect(mutation(h.calls, '/close')).toHaveLength(0);
    });
    it.each(['RECEPTION_SIGNATURE_REQUIRED', 'RECEPTION_MILEAGE_CONFLICT', 'RECEPTION_NOT_FOUND', 'RECEPTION_NOT_CLOSABLE', 'RECEPTION_ORDER_INTEGRITY_ERROR'])('handles %s safely with request reference', async code => {
        current = SIGNED;
        const h = renderReception(route, call => call.url.pathname.endsWith('/close') ? errorResponse(code, code === 'RECEPTION_ORDER_INTEGRITY_ERROR' ? 500 : 409) : defaults(call), permissions);
        await confirmClose(); await screen.findAllByText('request-test');
        expect(screen.queryByText('PRIVATE BACKEND COPY MUST NEVER APPEAR')).toBeNull();
        if (code === 'RECEPTION_MILEAGE_CONFLICT') {
            const edit = screen.getByRole('button', { name: 'Volver a edición' });
            fireEvent.click(edit); await screen.findByRole('button', { name: 'Guardar cambios' });
        }
        expect(mutation(h.calls, '/close')).toHaveLength(1);
    });
    it.each([true, false])('network ambiguity refetches; closed=%s', async closed => {
        current = SIGNED; let count = 0;
        const h = renderReception(route, call => {
            if (call.url.pathname.endsWith('/close') && ++count === 1) { if (closed) current = FINAL; return Promise.reject(new Error('ambiguous')); }
            return defaults(call);
        }, permissions);
        await confirmClose();
        if (closed) await screen.findByText('Orden #123');
        else {
            await waitFor(() => { expect(screen.getAllByText(/No hay conexión/).length).toBeGreaterThan(0); });
            const dialog = screen.getByRole('dialog');
            fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar recepción' }));
            await screen.findByText('Orden #123');
        }
        expect(mutation(h.calls, '/close')).toHaveLength(closed ? 1 : 2);
    });
    it('closed GET renders summary without mutable actions or invented openedAt', async () => {
        current = FINAL; renderReception(route, defaults, permissions);
        await screen.findByText('Orden #123');
        expect(screen.queryByRole('button', { name: 'Editar recepción' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cerrar recepción' })).toBeNull();
        expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
        expect(screen.queryByText(/Fecha de apertura/)).toBeNull();
    });
    it('discards stale close response after tenant change', async () => {
        current = SIGNED; let resolve: ((r: FetchResponse) => void) | undefined;
        const h = renderReception(route, call => call.url.pathname.endsWith('/close') ? new Promise(r => { resolve = r; }) : defaults(call), permissions);
        await confirmClose(); await waitFor(() => { expect(resolve).toBeDefined(); });
        current = DETAIL; h.updateRuntime({ ...h.runtime, tenantId: IDS.other });
        await act(() => { resolve?.(jsonResponse(CLOSED)); return Promise.resolve(); });
        expect(screen.queryByText('Orden #123')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull();
        await screen.findByLabelText('Firma manuscrita de recepción');
    });
});
describe('workflow response validation and isolated storage', () => {
    it('parses only actual signature and serviceOrder summaries', () => {
        expect(parseReceptionDetail({ reception: SIGNED })?.signature).toEqual(SIGNATURE);
        expect(parseReceptionDetail({ reception: { ...DETAIL, signature: { signedByName: 'invented' } } })).toBeNull();
        expect(parseReceptionDetail({ reception: FINAL })?.serviceOrder).toEqual(FINAL.serviceOrder);
    });
    it.each([
        { ...UPLOAD, uploadMethod: 'POST' }, { ...UPLOAD, uploadUrl: 'http://insecure.test' },
        { ...UPLOAD, uploadHeaders: { Authorization: 'forbidden' } }, { ...UPLOAD, uploadHeaders: { 'X-Tenant-Id': IDS.tenant } },
    ])('rejects unsafe session response', value => { expect(parseUploadSession(value)).toBeNull(); });
    it('complete must be active; signature and close identities are validated', () => {
        expect(parseActiveMedia({ ...ACTIVE, status: 'pending' })).toBeNull();
        expect(parseAttachedSignature(ATTACHED)).toEqual(ATTACHED);
        expect(parseClosedReception({ ...CLOSED, serviceOrder: { ...ORDER, receptionId: IDS.other } })).toBeNull();
    });
    it('storage fetch does not copy auth/context headers or cookies and never reads error body', async () => {
        const send = vi.fn(() => Promise.resolve(jsonResponse({ internal: 'private' }, 403)));
        const result = await putSignature(UPLOAD, BLOB, new AbortController().signal, send);
        expect(result.ok).toBe(false);
        expect(send).toHaveBeenCalledWith(UPLOAD.uploadUrl, expect.objectContaining({ headers: UPLOAD.uploadHeaders, credentials: 'omit' }));
    });
    it('API rejects a mismatched complete media ID and signature target', async () => {
        const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }), fetchImpl: url => Promise.resolve(jsonResponse(url.endsWith('/complete') ? { ...ACTIVE, mediaAssetId: IDS.vehicle } : { signature: { ...ATTACHED, receptionId: IDS.other } })) });
        const signal = new AbortController().signal, api = createReceptionApi(client, IDS.tenant, signal);
        expect((await api.completeSignatureUpload(SESSION, MEDIA, signal)).ok).toBe(false);
        expect((await api.attachSignature(IDS.reception, MEDIA, 'Prueba', null, RECEPTION_ACCEPTANCE.documentVersion, signal)).ok).toBe(false);
    });
});

describe('additional recovery and cancellation boundaries', () => {
    it.each([
        ['REQUEST_VALIDATION_FAILED', 400], ['SIGNATURE_MEDIA_NOT_FOUND', 404], ['SIGNATURE_MEDIA_NOT_ELIGIBLE', 409],
        ['RECEPTION_NOT_EDITABLE', 409], ['ACCEPTANCE_DOCUMENT_VERSION_MISMATCH', 409],
        ['AUTHENTICATION_REQUIRED', 401], ['PERMISSION_DENIED', 403], ['RATE_LIMIT_EXCEEDED', 429], ['INTERNAL_ERROR', 500],
    ] as const)('preserves safe reference for attach %s without uploading again', async (code, status) => {
        const h = renderReception(route, call => call.url.pathname.endsWith('/signature') ? errorResponse(code, status, '1') : defaults(call), permissions);
        await prepare(); sign(); await screen.findByText('request-test');
        expect(storage).toHaveBeenCalledTimes(1); expect(mutation(h.calls, '/signature')).toHaveLength(1);
        expect(screen.queryByText('PRIVATE BACKEND COPY MUST NEVER APPEAR')).toBeNull();
    });
    it.each(['UPLOAD_SESSION_ALREADY_COMPLETED', 'MEDIA_SIZE_TOO_LARGE', 'MEDIA_SIZE_INVALID', 'MEDIA_TYPE_NOT_ALLOWED', 'MIME_TYPE_NOT_ALLOWED', 'RETENTION_CLASS_NOT_ALLOWED'])('handles %s without attaching inactive media', async code => {
        const h = renderReception(route, call => call.url.pathname.endsWith('/complete') ? errorResponse(code, 400) : defaults(call), permissions);
        await prepare(); sign(); await screen.findByText('request-test');
        expect(mutation(h.calls, '/signature')).toHaveLength(0);
    });
    it('rejects canvas Blob over 2 MB before any upload', async () => {
        pngExport.mockImplementation(callback => { callback(new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/png' })); });
        const h = renderReception(route, defaults, permissions);
        await prepare(); sign(); await screen.findByText('Dibuja una firma PNG de hasta 2 MB.');
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(0);
    });
    it('lost reconciliation GET must succeed before another signature POST', async () => {
        let attachCount = 0, lookupCount = 0;
        const h = renderReception(route, call => {
            if (call.url.pathname.endsWith('/signature') && ++attachCount === 1) return Promise.reject(new Error('ambiguous'));
            if (call.init.method === 'GET' && call.url.pathname !== '/api/v1/reception-acceptance-document' && ++lookupCount === 2) return Promise.reject(new Error('offline'));
            return defaults(call);
        }, permissions);
        await prepare(); sign(); await screen.findByText(/No hay conexión/);
        expect(mutation(h.calls, '/signature')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro de firma' }));
        await screen.findByText('Firma registrada');
        const secondAttach = h.calls.findIndex((call, index) => index > h.calls.findIndex(c => c.url.pathname.endsWith('/signature')) && call.url.pathname.endsWith('/signature'));
        expect(h.calls[secondAttach - 1]?.init.method).toBe('GET'); expect(storage).toHaveBeenCalledTimes(1);
    });
    it('changing reception during upload clears the evidence and prevents continuation', async () => {
        let resolve: ((r: FetchResponse) => void) | undefined;
        storage.mockImplementation(() => new Promise(r => { resolve = r; }));
        const h = renderReception(route, call => call.url.pathname === '/api/v1/receptions'
            ? jsonResponse({ receptions: [{ ...SUMMARY, receptionId: IDS.other }], nextCursor: null })
            : call.init.method === 'GET' && call.url.pathname.endsWith(IDS.other) ? jsonResponse({ reception: { ...DETAIL, receptionId: IDS.other } }) : defaults(call), permissions);
        await prepare(); sign(); await screen.findByText('Subiendo firma…');
        fireEvent.click(screen.getByRole('link', { name: 'Volver a recepciones' }));
        fireEvent.click(await screen.findByRole('link', { name: /Abrir recepción/ }));
        await screen.findByLabelText('Firma manuscrita de recepción');
        await act(() => { resolve?.(jsonResponse(null)); return Promise.resolve(); });
        expect(mutation(h.calls, '/complete')).toHaveLength(0); expect(mutation(h.calls, '/signature')).toHaveLength(0);
        expect(screen.queryByDisplayValue('Persona de prueba')).toBeNull();
    });
});

it('retains a confirmed signature if the following GET temporarily lacks its summary', async () => {
    const h = renderReception(route, call => call.url.pathname.endsWith('/signature') ? jsonResponse({ signature: ATTACHED }, 201) : defaults(call), permissions);
    await prepare(); sign(); await screen.findByText('Firma registrada');
    expect(mutation(h.calls, '/signature')).toHaveLength(1);
    expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
});

it('a closed reception without signature never exposes the capture workflow', async () => {
    renderReception(route, () => jsonResponse({ reception: { ...FINAL, signature: null } }), permissions);
    await screen.findByText('Orden #123');
    expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
});
it.each(['signatures.capture', 'media.upload'])('an assigned %s grant cannot combine with another tenant grant to enable capture', async code => {
    const grants = permissions.map(grant => grant.code === code ? { ...grant, scopes: ['assigned'] } : grant);
    renderReception(route, defaults, grants);
    await screen.findByRole('heading', { name: 'Firma de recepción' });
    expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
});

it('signature-required close error refreshes stale evidence and restores the actual capture state', async () => {
    current = SIGNED;
    const h = renderReception(route, call => {
        if (call.url.pathname.endsWith('/close')) { current = DETAIL; return errorResponse('RECEPTION_SIGNATURE_REQUIRED'); }
        return defaults(call);
    }, permissions);
    await confirmClose(); await screen.findAllByText('request-test');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    await screen.findByLabelText('Firma manuscrita de recepción');
    expect(screen.queryByRole('button', { name: 'Cerrar recepción' })).toBeNull();
    expect(mutation(h.calls, '/close')).toHaveLength(1);
});


const equivalentPermissions = () => [...permissions].reverse().flatMap(grant => [
    { code: grant.code, scopes: [...grant.scopes, ...grant.scopes].reverse() },
    { code: grant.code, scopes: [...grant.scopes] },
]);

describe('S3-UI-04 signature regression fixes', () => {
    it.each([false, true])('equivalent grants preserve drawing and all signer fields; StrictMode=%s', async strict => {
        const h = renderReception(route, defaults, permissions, strict);
        await prepare('DOC-SINTETICO');
        const canvas = screen.getByLabelText('Firma manuscrita de recepción');
        const clears = clearCanvas.mock.calls.length;
        h.updateRuntime({ ...h.runtime, permissions: equivalentPermissions() });
        expect(screen.getByLabelText('Firma manuscrita de recepción')).toBe(canvas);
        expect(screen.getByLabelText('Nombre del firmante *')).toMatchObject({ value: 'Persona de prueba' });
        expect(screen.getByLabelText('Documento del firmante (opcional)')).toMatchObject({ value: 'DOC-SINTETICO' });
        expect(screen.getByLabelText('He leído el documento de aceptación mostrado.')).toMatchObject({ checked: true });
        expect(clearCanvas.mock.calls.length).toBe(clears);
        expect(screen.getByRole('button', { name: 'Registrar firma' }).hasAttribute('disabled')).toBe(false);
        sign(); await screen.findByText('Firma registrada');
        expect(mutation(h.calls, '/signature')).toHaveLength(1);
    });
    it('permission normalization merges codes and scopes as sets with stable ordering', () => {
        const a = [{ code: 'b', scopes: ['tenant', 'assigned', 'tenant'] }, { code: 'a', scopes: ['quality_control'] }, { code: 'b', scopes: ['assigned'] }];
        const b = [{ code: 'b', scopes: ['assigned'] }, { code: 'b', scopes: ['tenant'] }, { code: 'a', scopes: ['quality_control', 'quality_control'] }];
        expect(JSON.stringify(normalizePermissions(a))).toBe(JSON.stringify(normalizePermissions(b)));
        expect(normalizePermissions(a)).toEqual([{ code: 'a', scopes: ['quality_control'] }, { code: 'b', scopes: ['assigned', 'tenant'] }]);
    });
    it('equivalent refresh during PUT preserves the session, Blob and pending progress without abort', async () => {
        let resolve: ((r: FetchResponse) => void) | undefined;
        storage.mockImplementation(() => new Promise(r => { resolve = r; }));
        const h = renderReception(route, defaults, permissions);
        await prepare('DOC-SINTETICO'); sign(); await screen.findByText('Subiendo firma…');
        const canvas = screen.getByLabelText('Firma manuscrita de recepción');
        h.updateRuntime({ ...h.runtime, permissions: equivalentPermissions() });
        expect(storage.mock.calls[0]?.[1].signal?.aborted).toBe(false);
        expect(screen.getByText('Subiendo firma…')).toBeDefined();
        expect(screen.getByLabelText('Firma manuscrita de recepción')).toBe(canvas);
        expect(screen.getByLabelText('Nombre del firmante *')).toMatchObject({ value: 'Persona de prueba' });
        expect(screen.getByLabelText('Documento del firmante (opcional)')).toMatchObject({ value: 'DOC-SINTETICO' });
        expect(screen.getByLabelText('He leído el documento de aceptación mostrado.')).toMatchObject({ checked: true });
        expect(screen.getByRole('button', { name: 'Nueva firma' }).hasAttribute('disabled')).toBe(true);
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(1);
        expect(mutation(h.calls, '/complete')).toHaveLength(0);
        await act(() => { resolve?.(jsonResponse(null)); return Promise.resolve(); });
        await screen.findByText('Firma registrada');
        expect(storage).toHaveBeenCalledTimes(1); expect(storage.mock.calls[0]?.[1].body).toBe(BLOB);
        expect(mutation(h.calls, '/complete')).toHaveLength(1);
        expect(mutation(h.calls, '/signature')).toHaveLength(1);
        expect(pngExport).toHaveBeenCalledTimes(1);
    });
    it.each(['REQUEST_VALIDATION_FAILED', 'SIGNATURE_MEDIA_NOT_ELIGIBLE'])('equivalent refresh after active media and attach %s preserves the media for attach retry', async code => {
        let attaches = 0;
        const h = renderReception(route, call => call.url.pathname.endsWith('/signature') && ++attaches === 1 ? errorResponse(code, 400) : defaults(call), permissions);
        await prepare(); sign(); await screen.findByText('request-test');
        h.updateRuntime({ ...h.runtime, permissions: equivalentPermissions() });
        expect(screen.queryByRole('button', { name: 'Reiniciar subida' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro de firma' }));
        await screen.findByText('Firma registrada');
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(1);
        expect(mutation(h.calls, '/complete')).toHaveLength(1); expect(storage).toHaveBeenCalledTimes(1);
        expect(mutation(h.calls, '/signature').map(c => body(c))).toEqual([body(mutation(h.calls, '/signature')[0]), body(mutation(h.calls, '/signature')[0])]);
    });
    it('equivalent refresh preserves close confirmation; actual close revocation removes it', async () => {
        current = SIGNED;
        const h = renderReception(route, defaults, permissions);
        const dialog = await confirmation();
        h.updateRuntime({ ...h.runtime, permissions: equivalentPermissions() });
        expect(screen.getByRole('dialog')).toBe(dialog);
        expect(within(dialog).getByRole('button', { name: 'Cerrar recepción' }).hasAttribute('disabled')).toBe(false);
        h.updateRuntime({ ...h.runtime, permissions: permissions.filter(g => g.code !== 'receptions.close') });
        await screen.findByText('Firma registrada');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cerrar recepción' })).toBeNull();
        expect(mutation(h.calls, '/close')).toHaveLength(0);
    });
    it('contractual 201 confirms and releases evidence before refresh, and failed GET cannot undo it', async () => {
        let refresh: ((r: FetchResponse) => void) | undefined, lookups = 0;
        const h = renderReception(route, call => call.init.method === 'GET' && call.url.pathname !== '/api/v1/reception-acceptance-document' && ++lookups > 1 ? new Promise(r => { refresh = r; }) : defaults(call), permissions);
        await prepare(); sign(); await screen.findByText('Firma registrada');
        await waitFor(() => { expect(refresh).toBeDefined(); });
        expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
        expect(screen.queryByDisplayValue('Persona de prueba')).toBeNull();
        await act(() => { refresh?.(errorResponse('INTERNAL_ERROR', 500)); return Promise.resolve(); });
        await screen.findByText('La firma está registrada; no se pudo actualizar el detalle de recepción.');
        await waitFor(() => { expect(screen.getByRole('button', { name: 'Cerrar recepción' }).hasAttribute('disabled')).toBe(false); });
        expect(screen.getByText('Firma registrada')).toBeDefined();
        expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
        expect(screen.queryByText(/Firma pendiente/)).toBeNull();
        expect(screen.queryByRole('button', { name: 'Reintentar registro de firma' })).toBeNull();
        expect(mutation(h.calls, '/signature')).toHaveLength(1);
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(1); expect(storage).toHaveBeenCalledTimes(1);
    });
    it('stored S1 with lost PUT response and retry 412 explicitly restarts as S2 with identical evidence', async () => {
        const second = { ...UPLOAD, uploadSessionId: IDS.vehicle, mediaAssetId: IDS.customer, uploadUrl: 'https://storage.example.test/signature-2?presigned=opaque', objectKey: 'internal-2' };
        const objects = new Map<string, RequestInit['body']>();
        storage.mockImplementation((url, init) => {
            if (objects.has(url)) return Promise.resolve(jsonResponse(null, 412));
            objects.set(url, init.body);
            return url === UPLOAD.uploadUrl ? Promise.reject(new Error('response lost after write')) : Promise.resolve(jsonResponse(null, 201));
        });
        let sessions = 0;
        const h = renderReception(route, call => {
            if (call.url.pathname.endsWith('/upload-sessions')) return jsonResponse(++sessions === 1 ? UPLOAD : second, 201);
            if (call.url.pathname.endsWith('/complete')) return jsonResponse({ ...ACTIVE, mediaAssetId: second.mediaAssetId });
            if (call.url.pathname.endsWith('/signature')) { current = SIGNED; return jsonResponse({ signature: { ...ATTACHED, signatureMediaId: second.mediaAssetId } }, 201); }
            return defaults(call);
        }, permissions);
        await prepare('DOC-SINTETICO'); sign(); await screen.findByRole('button', { name: 'Reiniciar subida' });
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(1); expect(storage).toHaveBeenCalledTimes(1);
        expect(mutation(h.calls, '/complete')).toHaveLength(0); expect(mutation(h.calls, '/signature')).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro de firma' }));
        await screen.findByText('La subida actual no admite sobrescritura. Reinicia la subida para registrar esta misma firma.');
        expect(storage).toHaveBeenCalledTimes(2); expect(mutation(h.calls, '/upload-sessions')).toHaveLength(1);
        expect(mutation(h.calls, '/complete')).toHaveLength(0); expect(mutation(h.calls, '/signature')).toHaveLength(0);
        expect(screen.getByRole('button', { name: 'Reintentar registro de firma' }).hasAttribute('disabled')).toBe(true);
        h.updateRuntime({ ...h.runtime, permissions: equivalentPermissions() });
        expect(screen.getByLabelText('Nombre del firmante *')).toMatchObject({ value: 'Persona de prueba' });
        expect(screen.getByLabelText('Documento del firmante (opcional)')).toMatchObject({ value: 'DOC-SINTETICO' });
        expect(screen.getByLabelText('He leído el documento de aceptación mostrado.')).toMatchObject({ checked: true });
        const restart = screen.getByRole('button', { name: 'Reiniciar subida' });
        fireEvent.click(restart); fireEvent.click(restart);
        await screen.findByText('Firma registrada');
        const sessionCalls = mutation(h.calls, '/upload-sessions');
        expect(sessionCalls).toHaveLength(2);
        expect(body(sessionCalls[0])).not.toEqual(body(sessionCalls[1]));
        expect(body(sessionCalls[0])).toMatchObject({ idempotencyKey: uuidMatcher });
        expect(body(sessionCalls[1])).toMatchObject({ idempotencyKey: uuidMatcher });
        expect(objects.get(UPLOAD.uploadUrl)).toBe(BLOB); expect(objects.get(second.uploadUrl)).toBe(BLOB);
        expect(storage.mock.calls.map(c => c[1].body)).toEqual([BLOB, BLOB, BLOB]);
        expect(storage).toHaveBeenCalledTimes(3); expect(pngExport).toHaveBeenCalledTimes(1);
        expect(mutation(h.calls, '/complete')).toHaveLength(1);
        expect(mutation(h.calls, '/complete')[0]?.url.pathname).toBe('/api/v1/media/upload-sessions/' + second.uploadSessionId + '/complete');
        expect(mutation(h.calls, '/signature')).toHaveLength(1);
        expect(body(mutation(h.calls, '/signature')[0])).toEqual({ signatureMediaId: second.mediaAssetId, signedByName: 'Persona de prueba', signedByDocument: 'DOC-SINTETICO', documentVersion: RECEPTION_ACCEPTANCE.documentVersion });
    });
    it.each([403, 412, 500])('PUT HTTP %s stops before complete and offers explicit restart with preserved evidence', async status => {
        storage.mockResolvedValueOnce(jsonResponse(null, status));
        const h = renderReception(route, defaults, permissions);
        await prepare(); sign(); await screen.findByRole('button', { name: 'Reiniciar subida' });
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(1); expect(storage).toHaveBeenCalledTimes(1);
        expect(mutation(h.calls, '/complete')).toHaveLength(0); expect(mutation(h.calls, '/signature')).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Reiniciar subida' }));
        await screen.findByText('Firma registrada');
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(2);
        expect(storage.mock.calls[1]?.[1].body).toBe(BLOB); expect(pngExport).toHaveBeenCalledTimes(1);
    });
    it('classifies storage 412 by HTTP status without reading the body or inventing an API code', async () => {
        const response = jsonResponse(null, 412);
        const json = vi.fn(() => response.json());
        const result = await putSignature(UPLOAD, BLOB, new AbortController().signal, () => Promise.resolve({ ...response, json }));
        expect(result).toMatchObject({ ok: false, failure: { kind: 'unexpected_status', status: 412, code: null } });
        expect(json).not.toHaveBeenCalled();
    });
    it('accepts only the real signature envelope and validates every required field', async () => {
        const values: unknown[] = [ATTACHED, null, {}, { signature: null },
            ...['signatureId', 'receptionId', 'signatureMediaId', 'documentVersion', 'signedAt'].map(field => ({ signature: { ...ATTACHED, [field]: null } })),
            { signature: { ...ATTACHED, receptionId: IDS.other } }, { signature: { ...ATTACHED, signatureMediaId: IDS.vehicle } },
            { signature: { ...ATTACHED, documentVersion: 'wrong_version' } }, { signature: { ...ATTACHED, signedAt: 'invalid' } }];
        for (const value of values) {
            const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }), fetchImpl: () => Promise.resolve(jsonResponse(value, 201)) });
            const signal = new AbortController().signal;
            expect(await createReceptionApi(client, IDS.tenant, signal).attachSignature(IDS.reception, MEDIA, 'Prueba', null, RECEPTION_ACCEPTANCE.documentVersion, signal)).toMatchObject({ ok: false, failure: { kind: 'contract_violation' } });
        }
        const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }), fetchImpl: () => Promise.resolve(jsonResponse({ signature: ATTACHED }, 201)) });
        const signal = new AbortController().signal;
        expect(await createReceptionApi(client, IDS.tenant, signal).attachSignature(IDS.reception, MEDIA, 'Prueba', null, RECEPTION_ACCEPTANCE.documentVersion, signal)).toEqual({ ok: true, data: ATTACHED });
    });
});


it('ambiguous creation of a session retries with the same key and Blob until explicit restart', async () => {
    let creations = 0;
    const h = renderReception(route, call => call.url.pathname.endsWith('/upload-sessions') && ++creations === 1 ? Promise.reject(new Error('lost session response')) : defaults(call), permissions);
    await prepare(); sign(); await screen.findByText(/No hay conexión/);
    expect(storage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Reiniciar subida' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar registro de firma' }));
    await screen.findByText('Firma registrada');
    const sessions = mutation(h.calls, '/upload-sessions');
    expect(sessions).toHaveLength(2); expect(body(sessions[0])).toEqual(body(sessions[1]));
    expect(storage).toHaveBeenCalledTimes(1); expect(storage.mock.calls[0]?.[1].body).toBe(BLOB);
    expect(pngExport).toHaveBeenCalledTimes(1);
});

describe('runtime acceptance document', () => {
    const backendDocument = { documentVersion: 'server_version_exact_v9', text: ' Texto exacto del backend\n\nSegunda línea.\n' };
    it('GETs the real endpoint, renders exact text/version and signs with that same version', async () => {
        const h = renderReception(route, call => {
            if (call.url.pathname === '/api/v1/reception-acceptance-document') return jsonResponse({ acceptanceDocument: backendDocument });
            if (call.url.pathname.endsWith('/signature')) { current = { ...DETAIL, signature: { ...SIGNATURE, documentVersion: backendDocument.documentVersion } }; return jsonResponse({ signature: { ...ATTACHED, documentVersion: backendDocument.documentVersion } }, 201); }
            return defaults(call);
        }, permissions);
        await prepare();
        const text = screen.getByText(/Texto exacto del backend/);
        expect(text.textContent).toBe(backendDocument.text);
        expect(screen.getByText('Versión: ' + backendDocument.documentVersion)).toBeDefined();
        sign(); await screen.findByText('Firma registrada');
        expect(body(mutation(h.calls, '/signature')[0])).toMatchObject({ documentVersion: backendDocument.documentVersion });
        const get = h.calls.filter(call => call.url.pathname === '/api/v1/reception-acceptance-document');
        expect(get).toHaveLength(1); expect(get[0]?.init.method).toBe('GET'); expect(get[0]?.url.search).toBe('');
    });
    it.each([jsonResponse(null), errorResponse('INTERNAL_ERROR', 500), errorResponse('PERMISSION_DENIED', 403)])('failed GET disables signature with no local fallback; explicit retry recovers', async response => {
        let attempts = 0;
        const h = renderReception(route, call => call.url.pathname === '/api/v1/reception-acceptance-document' ? ++attempts === 1 ? response : jsonResponse({ acceptanceDocument: backendDocument }) : defaults(call), permissions);
        await screen.findByRole('button', { name: 'Reintentar documento de aceptación' });
        expect(screen.getByRole('button', { name: 'Registrar firma' }).hasAttribute('disabled')).toBe(true);
        expect(screen.queryByText(RECEPTION_ACCEPTANCE.text)).toBeNull();
        expect(attempts).toBe(1); sign(); expect(mutation(h.calls, '/upload-sessions')).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Reintentar documento de aceptación' }));
        await screen.findByText('Versión: ' + backendDocument.documentVersion);
        expect(attempts).toBe(2);
    });
    it.each([SIGNED, FINAL])('signed reception displays summary without requesting acceptance', async data => {
        const h = renderReception(route, () => jsonResponse({ reception: data }), permissions);
        await screen.findByText('Firma registrada');
        expect(h.calls.some(call => call.url.pathname === '/api/v1/reception-acceptance-document')).toBe(false);
    });
});
describe('shared inspection/signature/close coordination', () => {
    const checklist = { checkItemId: IDS.other, code: 'lights', label: 'Luces', status: 'ok' as const, notes: null, createdAt: TIME };
    it.each([
        { signed: true, failure: 'conflict' }, { signed: false, failure: 'conflict' },
        { signed: true, failure: 'network' }, { signed: false, failure: 'network' },
        { signed: true, failure: 'server_error' }, { signed: false, failure: 'server_error' },
        { signed: true, failure: 'contract_violation' }, { signed: false, failure: 'contract_violation' },
    ])('inspection recovery survives exit after failed GET and blocks workflow until GET + review: %j', async ({ signed, failure }) => {
        let lookups = 0;
        current = { ...(signed ? SIGNED : DETAIL), checklist: [checklist] };
        const h = renderReception(route, call => {
            if (call.init.method === 'PATCH') {
                if (failure === 'network') return Promise.reject(new Error('lost response'));
                if (failure === 'server_error') return errorResponse('INTERNAL_ERROR', 500);
                if (failure === 'contract_violation') return jsonResponse(null);
                return errorResponse('RESOURCE_VERSION_CONFLICT');
            }
            if (call.init.method === 'GET' && call.url.pathname === '/api/v1/receptions/' + IDS.reception) {
                lookups++;
                if (lookups === 2) return errorResponse('INTERNAL_ERROR', 500);
                if (lookups > 2) current = { ...current, updatedAt: '2026-10-03T12:13:14.456789Z' };
            }
            return defaults(call);
        }, permissions);
        if (!signed) await prepare();
        fireEvent.click(await screen.findByRole('button', { name: 'Editar elemento Luces' }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar checklist' }));
        await screen.findByRole('button', { name: 'Volver a consultar inspección' });
        await waitFor(() => { expect(screen.getByRole('button', { name: 'Salir de inspección' }).hasAttribute('disabled')).toBe(false); });
        fireEvent.click(screen.getByRole('button', { name: 'Salir de inspección' }));
        expect(screen.queryByRole('form', { name: 'Edición de checklist' })).toBeNull();
        const blockedWorkflow = () => {
            const button = screen.getByRole('button', { name: signed ? 'Cerrar recepción' : 'Registrar firma' });
            expect(button.hasAttribute('disabled')).toBe(true); fireEvent.click(button);
            expect(screen.getByRole('button', { name: 'Editar recepción' }).hasAttribute('disabled')).toBe(true);
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(mutation(h.calls, '/close')).toHaveLength(0);
            expect(mutation(h.calls, '/signature')).toHaveLength(0);
            expect(mutation(h.calls, '/upload-sessions')).toHaveLength(0);
            if (!signed) expect(screen.getByLabelText('Firma manuscrita de recepción').getAttribute('aria-disabled')).toBe('true');
        };
        blockedWorkflow();
        fireEvent.click(screen.getByRole('button', { name: 'Volver a consultar inspección' }));
        await screen.findByRole('button', { name: 'He revisado la inspección actual' });
        blockedWorkflow();
        fireEvent.click(screen.getByRole('button', { name: 'He revisado la inspección actual' }));
        expect(screen.getByRole('button', { name: 'Editar recepción' }).hasAttribute('disabled')).toBe(false);
        expect(screen.getByRole('button', { name: signed ? 'Cerrar recepción' : 'Registrar firma' }).hasAttribute('disabled')).toBe(false);
        expect(lookups).toBe(3);
        if (signed) { await confirmClose(); await screen.findByText('Generada correctamente'); expect(mutation(h.calls, '/close')).toHaveLength(1); }
        else { sign(); await screen.findByText('Firma registrada'); expect(mutation(h.calls, '/signature')).toHaveLength(1); }
    });
    it('RECEPTION_NOT_EDITABLE stays locked after leaving inspection even if a later GET reports open', async () => {
        let lookups = 0;
        current = { ...SIGNED, checklist: [checklist] };
        const h = renderReception(route, call => {
            if (call.init.method === 'PATCH') return errorResponse('RECEPTION_NOT_EDITABLE');
            if (call.url.pathname === '/api/v1/receptions/' + IDS.reception && ++lookups === 2) return errorResponse('INTERNAL_ERROR', 500);
            return defaults(call);
        }, permissions);
        fireEvent.click(await screen.findByRole('button', { name: 'Editar elemento Luces' }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar checklist' }));
        await screen.findByRole('button', { name: 'Volver a consultar inspección' });
        await waitFor(() => { expect(screen.getByRole('button', { name: 'Salir de inspección' }).hasAttribute('disabled')).toBe(false); });
        fireEvent.click(screen.getByRole('button', { name: 'Salir de inspección' }));
        fireEvent.click(screen.getByRole('button', { name: 'Volver a consultar inspección' }));
        await waitFor(() => { expect(lookups).toBe(3); });
        expect(screen.queryByRole('button', { name: 'He revisado la inspección actual' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Editar recepción' })).toBeNull();
        const close = screen.getByRole('button', { name: 'Cerrar recepción' });
        expect(close.hasAttribute('disabled')).toBe(true); fireEvent.click(close);
        expect(mutation(h.calls, '/close')).toHaveLength(0);
    });
    it('direct A to B navigation isolates B from the late pending inspection PATCH for A', async () => {
        let resolve: ((response: FetchResponse) => void) | undefined;
        const calls: Call[] = [];
        const other = { ...SIGNED, receptionId: IDS.other, customerNotes: 'Sólo recepción B', mileageKm: 202 };
        const apiClient = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic' }), fetchImpl: (url, init) => {
            const call = { url: new URL(url), init }; calls.push(call);
            if (init.method === 'PATCH') return new Promise(r => { resolve = r; });
            return Promise.resolve(jsonResponse({ reception: call.url.pathname.endsWith(IDS.other) ? other : { ...SIGNED, checklist: [checklist], customerNotes: 'Sólo recepción A' } }));
        } });
        render(<MemoryRouter initialEntries={[route]}><Link to={'/recepciones/' + IDS.other}>Ir directamente a B</Link>
            <ReceptionProvider runtime={{ apiClient, tenantId: IDS.tenant, identity: 'synthetic-session', permissions }}>
                <Routes><Route path="/recepciones/:receptionId" element={<ReceptionDetailPage/>}/></Routes>
            </ReceptionProvider></MemoryRouter>);
        await screen.findByText('Sólo recepción A');
        fireEvent.click(screen.getByRole('button', { name: 'Editar elemento Luces' }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar checklist' }));
        await screen.findByText('Guardando inspección…');
        expect(calls.filter(call => call.init.method === 'PATCH')).toHaveLength(1);
        fireEvent.click(screen.getByRole('link', { name: 'Ir directamente a B' }));
        await screen.findByText('Sólo recepción B');
        expect(calls.filter(call => call.init.method === 'GET' && call.url.pathname === '/api/v1/receptions/' + IDS.other)).toHaveLength(1);
        await act(() => { resolve?.(jsonResponse({ reception: { ...SIGNED, checklist: [checklist], customerNotes: 'Respuesta tardía de A', mileageKm: 909 } })); return Promise.resolve(); });
        expect(screen.getByText('Sólo recepción B')).toBeDefined();
        expect(screen.getByText('202 km')).toBeDefined();
        expect(screen.queryByText('Respuesta tardía de A')).toBeNull();
        expect(screen.queryByText('Sólo recepción A')).toBeNull();
        expect(screen.queryByText('909 km')).toBeNull();
        expect(screen.queryByText('Luces: Correcto')).toBeNull();
        expect(screen.queryByRole('form', { name: 'Edición de checklist' })).toBeNull();
    });
    it.each([false, true])('checklist saving disables signature/close, signed=%s', async signed => {
        let resolve: ((r: FetchResponse) => void) | undefined;
        current = signed ? { ...SIGNED, checklist: [checklist] } : { ...DETAIL, checklist: [checklist] };
        const h = renderReception(route, call => call.init.method === 'PATCH' ? new Promise(r => { resolve = r; }) : defaults(call), permissions);
        if (!signed) await prepare();
        fireEvent.click(await screen.findByRole('button', { name: 'Editar elemento Luces' }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar checklist' }));
        await screen.findByText('Guardando inspección…');
        const button = screen.getByRole('button', { name: signed ? 'Cerrar recepción' : 'Registrar firma' });
        expect(button.hasAttribute('disabled')).toBe(true); fireEvent.click(button);
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(0); expect(mutation(h.calls, '/close')).toHaveLength(0);
        await act(() => { resolve?.(jsonResponse({ reception: { ...current, updatedAt: '2026-10-03T12:13:14.456789Z' } })); return Promise.resolve(); });
        await waitFor(() => { expect(screen.queryByText('Guardando inspección…')).toBeNull(); });
    });
    it.each(['signature', 'close'] as const)('%s blocks checklist, damages and general editing throughout mutation', async operation => {
        let resolve: ((r: FetchResponse) => void) | undefined;
        if (operation === 'close') current = SIGNED;
        else storage.mockImplementation(() => new Promise(r => { resolve = r; }));
        const h = renderReception(route, call => operation === 'close' && call.url.pathname.endsWith('/close') ? new Promise(r => { resolve = r; }) : defaults(call), permissions);
        if (operation === 'signature') { await prepare(); sign(); await screen.findByText('Subiendo firma…'); }
        else { await confirmClose(); await screen.findAllByText('Cerrando recepción…'); }
        for (const name of ['Agregar elemento de checklist', 'Agregar daño', 'Editar recepción']) {
            const button = screen.getByRole('button', { name });
            expect(button.hasAttribute('disabled')).toBe(true); fireEvent.click(button);
        }
        expect(h.calls.some(call => call.init.method === 'PATCH')).toBe(false);
        await act(() => { resolve?.(operation === 'close' ? jsonResponse(CLOSED) : jsonResponse(null)); return Promise.resolve(); });
        await screen.findByText(operation === 'close' ? 'Generada correctamente' : 'Firma registrada');
    });
});

it('close keeps updatedAt opaque even during validation', () => {
    const parse = vi.spyOn(Date, 'parse');
    const exact = '2026-10-03T15:04:05.987654Z';
    const result = parseClosedReception({ ...CLOSED, reception: { ...CLOSED.reception, updatedAt: exact } });
    expect(result?.reception.updatedAt).toBe(exact);
    expect(parse.mock.calls.some(([value]) => value === exact)).toBe(false);
});
it('acceptance rate-limit remains an explicit retry and never reloads automatically', async () => {
    let requests = 0;
    renderReception(route, call => call.url.pathname === '/api/v1/reception-acceptance-document' ? (++requests, errorResponse('RATE_LIMIT_EXCEEDED', 429, '0')) : defaults(call), permissions);
    await screen.findByRole('button', { name: 'Reintentar documento de aceptación' });
    expect(requests).toBe(1);
    expect(screen.getByRole('button', { name: 'Registrar firma' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar documento de aceptación' }));
    await waitFor(() => { expect(requests).toBe(2); });
});
