import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReceptionProvider } from './reception-context';
import { ReceptionDetailPage } from './reception-detail-page';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type FetchResponse } from '@/shared/api/http-client';
import { DETAIL, IDS, TIME, PERMISSIONS, jsonResponse, errorResponse, renderReception, type Call } from '@/test/render-reception';
import { createReceptionApi } from './reception-api';
import { RECEPTION_ACCEPTANCE } from './reception-acceptance';
import { putSignature } from './reception-media-upload';
import { parseReceptionDetail, type ReceptionDetail } from './reception-contract';
import { parseActiveMedia, parseAttachedSignature, parseClosedReception, parseUploadSession } from './reception-workflow-contract';
const MEDIA = IDS.other, SESSION = IDS.consent;
const SIGNATURE = { signatureId: IDS.membership, documentVersion: RECEPTION_ACCEPTANCE.documentVersion, signedAt: TIME };
const ATTACHED = { ...SIGNATURE, receptionId: IDS.reception, signatureMediaId: MEDIA };
const ORDER = { id: IDS.other, receptionId: IDS.reception, vehicleId: IDS.vehicle, customerId: IDS.customer, orderNumber: '123', status: 'reception', openedAt: TIME, version: 1 };
const CLOSED = { reception: { id: IDS.reception, status: 'closed', closedAt: TIME, updatedAt: TIME }, serviceOrder: ORDER };
const SIGNED = { ...DETAIL, signature: SIGNATURE };
const FINAL = { ...DETAIL, status: 'closed' as const, closedAt: TIME, serviceOrder: { id: ORDER.id, orderNumber: ORDER.orderNumber, status: ORDER.status } };
const UPLOAD = { uploadSessionId: SESSION, mediaAssetId: MEDIA, status: 'pending' as const, uploadUrl: 'https://storage.example.test/signature?presigned=opaque', uploadMethod: 'PUT' as const, uploadHeaders: { 'Content-Type': 'image/png', 'If-None-Match': '*' }, objectKey: 'internal', expiresAt: TIME };
const BLOB = new Blob(['synthetic ink'], { type: 'image/png' });
const ACTIVE = { mediaAssetId: MEDIA, status: 'active', sizeBytes: BLOB.size, checksumSha256: null };
const permissions = [...PERMISSIONS, { code: 'receptions.close', scopes: ['tenant'] }];
const route = '/recepciones/' + IDS.reception;
const mutation = (calls: Call[], suffix: string) => calls.filter(call => call.init.method === 'POST' && call.url.pathname.endsWith(suffix));
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
const originalDialog = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
let current: ReceptionDetail;
let storage = vi.fn<() => Promise<FetchResponse>>();
function defaults(call: Call): FetchResponse {
    if (call.init.method === 'GET') return jsonResponse({ reception: current });
    if (call.url.pathname.endsWith('/close')) { current = { ...FINAL, signature: current.signature }; return jsonResponse(CLOSED); }
    return jsonResponse(null);
}
beforeEach(() => {
    current = DETAIL;
    storage = vi.fn(() => Promise.resolve(jsonResponse(null)));
    vi.stubGlobal('fetch', storage);
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute('open'); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
});
afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    if (originalDialog) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalDialog);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
async function confirmation() {
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar recepción' }));
    return await screen.findByRole('dialog');
}
async function confirmClose() { fireEvent.click(within(await confirmation()).getByRole('button', { name: 'Cerrar recepción' })); }
it('keeps historical signatures visible without any capture controls or requests', async () => {
    current = SIGNED;
    const h = renderReception(route, defaults, permissions);
    await screen.findByText('Firma registrada');
    expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar firma' })).toBeNull();
    expect(h.calls.every(call => call.init.method === 'GET' && call.url.pathname.endsWith(IDS.reception))).toBe(true);
});
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
describe('close and handoff', () => {
    it.each([
        [{ code: 'receptions.read', scopes: ['tenant'] }],
        [{ code: 'receptions.read', scopes: ['assigned'] }, { code: 'receptions.close', scopes: ['assigned'] }],
    ].map(grants => ({ grants })))('no functional close without tenant close grant', async ({ grants }) => {
        renderReception(route, () => jsonResponse({ reception: SIGNED }), grants);
        await screen.findByText('Firma registrada'); expect(screen.queryByRole('button', { name: 'Cerrar recepción' })).toBeNull();
    });
    it.each([false, true])('unsigned reception closes without acceptance, media or signature requests; StrictMode=%s', async strict => {
        const h = renderReception(route, defaults, permissions, strict);
        await screen.findByRole('button', { name: 'Cerrar recepción' });
        expect(screen.queryByLabelText('Firma manuscrita de recepción')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Registrar firma' })).toBeNull();
        await confirmClose();
        await screen.findByText('Orden #123');
        expect(current.signature).toBeNull();
        expect(h.calls.some(call => /acceptance-document|upload-sessions|\/signature$/.test(call.url.pathname))).toBe(false);
        expect(storage).not.toHaveBeenCalled();
    });
    it('requires confirmation, sends no body, closes once and shows real order', async () => {
        current = DETAIL;
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
        current = DETAIL; const h = renderReception(route, defaults, permissions);
        fireEvent.click(within(await confirmation()).getByRole('button', { name: 'Cancelar' }));
        expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar recepción' })); expect(mutation(h.calls, '/close')).toHaveLength(0);
    });
    it.each(['RECEPTION_MILEAGE_CONFLICT', 'RECEPTION_NOT_FOUND', 'RECEPTION_NOT_CLOSABLE', 'RECEPTION_ORDER_INTEGRITY_ERROR'])('handles %s safely with request reference', async code => {
        current = DETAIL;
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
        current = DETAIL; let count = 0;
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
        current = DETAIL; let resolve: ((r: FetchResponse) => void) | undefined;
        const h = renderReception(route, call => call.url.pathname.endsWith('/close') ? new Promise(r => { resolve = r; }) : defaults(call), permissions);
        await confirmClose(); await waitFor(() => { expect(resolve).toBeDefined(); });
        current = DETAIL; h.updateRuntime({ ...h.runtime, tenantId: IDS.other });
        await act(() => { resolve?.(jsonResponse(CLOSED)); return Promise.resolve(); });
        expect(screen.queryByText('Orden #123')).toBeNull(); expect(screen.queryByRole('dialog')).toBeNull();
        await screen.findByRole('button', { name: 'Cerrar recepción' });
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

describe('close permission refresh', () => {
    it('equivalent refresh preserves close confirmation; actual close revocation removes it', async () => {
        current = SIGNED;
        const h = renderReception(route, defaults, permissions);
        const dialog = await confirmation();
        h.updateRuntime({ ...h.runtime, permissions: permissions.flatMap(grant => [grant, { ...grant, scopes: [...grant.scopes] }]).reverse() });
        expect(screen.getByRole('dialog')).toBe(dialog);
        expect(within(dialog).getByRole('button', { name: 'Cerrar recepción' }).hasAttribute('disabled')).toBe(false);
        h.updateRuntime({ ...h.runtime, permissions: permissions.filter(g => g.code !== 'receptions.close') });
        await screen.findByText('Firma registrada');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cerrar recepción' })).toBeNull();
        expect(mutation(h.calls, '/close')).toHaveLength(0);
    });
});
describe('shared inspection/close coordination', () => {
    const checklist = { checkItemId: IDS.other, code: 'lights', label: 'Luces', status: 'ok' as const, notes: null, createdAt: TIME };
    it.each([false, true])('another session creates an identical third damage; no auto-association and workflow remains blocked, signed=%s', async signed => {
        const similar = { damageId: IDS.consent, zoneCode: 'rear', damageType: 'dent', severity: 'minor' as const, description: null, createdAt: TIME };
        const otherExisting = { ...similar, damageId: IDS.membership };
        const concurrent = { ...similar, damageId: IDS.vehicle };
        current = { ...(signed ? SIGNED : DETAIL), damages: [similar, otherExisting] };
        const h = renderReception(route, call => {
            if (call.init.method === 'PATCH') {
                // The other session consumes OCC=A; our conflict response is lost.
                current = { ...current, updatedAt: '2026-10-04T12:13:14.654321Z', damages: [similar, otherExisting, concurrent] };
                return Promise.reject(new Error('lost conflict response, original create never applied'));
            }
            return defaults(call);
        }, permissions);
        fireEvent.click(await screen.findByRole('button', { name: 'Agregar daño' }));
        fireEvent.change(screen.getByLabelText('Zona'), { target: { value: similar.zoneCode } });
        fireEvent.change(screen.getByLabelText('Tipo de daño'), { target: { value: similar.damageType } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar daño' }));
        const candidate = await screen.findByRole('button', { name: 'Usar este daño como el registrado: ' + concurrent.damageId });
        expect(screen.getByText('Nuevo daño')).toBeDefined();
        expect(screen.queryByText('Editar daño existente')).toBeNull();
        expect(screen.queryByRole('button', { name: 'He revisado la inspección actual' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Reintentar el daño original' })).toBeNull();
        const blockedWorkflow = () => {
            const button = screen.getByRole('button', { name: 'Cerrar recepción' });
            expect(button.hasAttribute('disabled')).toBe(true); fireEvent.click(button);
            for (const name of ['Editar recepción', 'Agregar daño', 'Agregar elemento de checklist']) {
                expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
            }
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(h.calls.filter(call => call.init.method === 'PATCH')).toHaveLength(1);
            expect(h.calls.some(call => call.init.method === 'POST')).toBe(false);
        };
        fireEvent.click(screen.getByRole('button', { name: 'Guardar daño' })); blockedWorkflow();
        fireEvent.click(screen.getByRole('button', { name: 'Salir de inspección' })); blockedWorkflow();
        fireEvent.click(screen.getByRole('button', { name: 'Volver a consultar inspección' }));
        await waitFor(() => { expect(screen.getByRole('button', { name: candidate.getAttribute('aria-label') ?? '' }).hasAttribute('disabled')).toBe(false); });
        blockedWorkflow();
        fireEvent.click(screen.getByRole('button', { name: 'Usar este daño como el registrado: ' + concurrent.damageId }));
        await waitFor(() => { expect(screen.queryByRole('region', { name: 'Asociación explícita de daño' })).toBeNull(); });
        // The editor stays open on the chosen damage; leaving it performs no write and frees the workflow.
        expect(screen.getByRole('form', { name: 'Edición de daño' })).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: 'Salir de inspección' }));
        expect(screen.getByRole('button', { name: 'Cerrar recepción' }).hasAttribute('disabled')).toBe(false);
        expect(screen.getByRole('button', { name: 'Editar recepción' }).hasAttribute('disabled')).toBe(false);
        expect(h.calls.filter(call => call.init.method === 'PATCH')).toHaveLength(1);
        expect(h.calls.some(call => call.init.method === 'POST')).toBe(false);
    });
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
        fireEvent.click(await screen.findByRole('button', { name: 'Editar elemento Luces' }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar checklist' }));
        await screen.findByRole('button', { name: 'Volver a consultar inspección' });
        await waitFor(() => { expect(screen.getByRole('button', { name: 'Salir de inspección' }).hasAttribute('disabled')).toBe(false); });
        fireEvent.click(screen.getByRole('button', { name: 'Salir de inspección' }));
        expect(screen.queryByRole('form', { name: 'Edición de checklist' })).toBeNull();
        const blockedWorkflow = () => {
            const button = screen.getByRole('button', { name: 'Cerrar recepción' });
            expect(button.hasAttribute('disabled')).toBe(true); fireEvent.click(button);
            expect(screen.getByRole('button', { name: 'Editar recepción' }).hasAttribute('disabled')).toBe(true);
            expect(screen.queryByRole('dialog')).toBeNull();
            expect(mutation(h.calls, '/close')).toHaveLength(0);
            expect(mutation(h.calls, '/signature')).toHaveLength(0);
            expect(mutation(h.calls, '/upload-sessions')).toHaveLength(0);
        };
        blockedWorkflow();
        fireEvent.click(screen.getByRole('button', { name: 'Volver a consultar inspección' }));
        await screen.findByRole('button', { name: 'He revisado la inspección actual' });
        blockedWorkflow();
        fireEvent.click(screen.getByRole('button', { name: 'He revisado la inspección actual' }));
        expect(screen.getByRole('button', { name: 'Editar recepción' }).hasAttribute('disabled')).toBe(false);
        expect(screen.getByRole('button', { name: 'Cerrar recepción' }).hasAttribute('disabled')).toBe(false);
        expect(lookups).toBe(3);
        await confirmClose(); await screen.findByText('Generada correctamente'); expect(mutation(h.calls, '/close')).toHaveLength(1);
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
        fireEvent.click(await screen.findByRole('button', { name: 'Editar elemento Luces' }));
        fireEvent.click(screen.getByRole('button', { name: 'Guardar checklist' }));
        await screen.findByText('Guardando inspección…');
        const button = screen.getByRole('button', { name: 'Cerrar recepción' });
        expect(button.hasAttribute('disabled')).toBe(true); fireEvent.click(button);
        expect(mutation(h.calls, '/upload-sessions')).toHaveLength(0); expect(mutation(h.calls, '/close')).toHaveLength(0);
        await act(() => { resolve?.(jsonResponse({ reception: { ...current, updatedAt: '2026-10-03T12:13:14.456789Z' } })); return Promise.resolve(); });
        await waitFor(() => { expect(screen.queryByText('Guardando inspección…')).toBeNull(); });
    });
    it('close blocks checklist, damages and general editing throughout the mutation', async () => {
        let resolve: ((r: FetchResponse) => void) | undefined;
        const h = renderReception(route, call => call.url.pathname.endsWith('/close') ? new Promise(r => { resolve = r; }) : defaults(call), permissions);
        await confirmClose(); await screen.findAllByText('Cerrando recepción…');
        for (const name of ['Agregar elemento de checklist', 'Agregar daño', 'Editar recepción']) {
            const button = screen.getByRole('button', { name });
            expect(button.hasAttribute('disabled')).toBe(true); fireEvent.click(button);
        }
        expect(h.calls.some(call => call.init.method === 'PATCH')).toBe(false);
        await act(() => { resolve?.(jsonResponse(CLOSED)); return Promise.resolve(); });
        await screen.findByText('Generada correctamente');
    });
});

it('close keeps updatedAt opaque even during validation', () => {
    const parse = vi.spyOn(Date, 'parse');
    const exact = '2026-10-03T15:04:05.987654Z';
    const result = parseClosedReception({ ...CLOSED, reception: { ...CLOSED.reception, updatedAt: exact } });
    expect(result?.reception.updatedAt).toBe(exact);
    expect(parse.mock.calls.some(([value]) => value === exact)).toBe(false);
});
