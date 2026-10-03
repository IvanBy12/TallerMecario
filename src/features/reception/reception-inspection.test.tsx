import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { record, parseReceptionDetail, type ReceptionDetail } from './reception-contract';
import { createReceptionApi } from './reception-api';
import { createApiClient, type JsonObject, type FetchResponse } from '@/shared/api/http-client';
import { DETAIL, TECH, IDS, TIME, PERMISSIONS, jsonResponse, errorResponse, renderReception, type Call } from '@/test/render-reception';
const route = '/recepciones/' + IDS.reception;
const NEXT = '2026-10-03T10:11:12.987654Z';
const ITEM = { checkItemId: IDS.other, code: 'lights', label: 'Luces', status: 'ok' as const, notes: null, createdAt: TIME };
const DAMAGE = { damageId: IDS.consent, zoneCode: 'front', damageType: 'scratch', severity: 'minor' as const, description: null, createdAt: TIME };
const initial = { ...DETAIL, checklist: [ITEM], damages: [DAMAGE] };
const patches = (calls: readonly Call[]) => calls.filter(call => call.init.method === 'PATCH');
const payload = (call: Call | undefined): JsonObject => {
    const parsed: unknown = typeof call?.init.body === 'string' ? JSON.parse(call.init.body) : null;
    if (!record(parsed)) throw new Error('Expected JSON object');
    // HTTP requests have already passed the shared JSON serializer.
    return parsed as JsonObject;
};
const change = (name: string, value: string) => { fireEvent.change(screen.getByLabelText(name), { target: { value } }); };
const click = (name: string) => { fireEvent.click(screen.getByRole('button', { name })); };
function server(start: ReceptionDetail = initial) {
    let current = start;
    return (call: Call) => {
        if (call.init.method !== 'PATCH') return jsonResponse({ reception: current });
        const body = payload(call);
        let value: unknown;
        if (call.url.pathname.endsWith('/checklist')) {
            const items = body['items'];
            if (!Array.isArray(items)) throw new Error('Missing items');
            value = items[0];
            if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid item');
            const parsed = parseReceptionDetail({ reception: { ...current, updatedAt: NEXT, checklist: [{ ...ITEM, ...value }] } });
            if (parsed === null) throw new Error('Invalid canonical checklist');
            current = parsed;
        } else {
            const entries = body['damages'];
            if (!Array.isArray(entries)) throw new Error('Missing damages');
            value = entries[0];
            if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid damage');
            const parsed = parseReceptionDetail({ reception: { ...current, updatedAt: NEXT, damages: [{ ...DAMAGE, ...value }] } });
            if (parsed === null) throw new Error('Invalid canonical damages');
            current = parsed;
        }
        return jsonResponse({ reception: current });
    };
}
describe('inspection permissions and canonical writes', () => {
    it.each([
        { grants: [{ code: 'receptions.read', scopes: ['tenant'] }], detail: initial },
        { grants: [{ code: 'receptions.read', scopes: ['assigned'] }, { code: 'receptions.update_open', scopes: ['assigned'] }], detail: { ...TECH, checklist: [ITEM], damages: [DAMAGE] } },
        { grants: PERMISSIONS, detail: { ...initial, status: 'closed' as const, closedAt: TIME } },
    ])('renders read-only inspection without a tenant/open grant: $grants', async ({ grants, detail }) => {
        const h = renderReception(route, () => jsonResponse({ reception: detail }), grants);
        await screen.findByText('Luces: Correcto');
        expect(screen.queryByRole('button', { name: /Agregar|Editar elemento|Editar daño/ })).toBeNull();
        expect(patches(h.calls)).toHaveLength(0);
        expect(screen.getByText(/front · scratch · Leve/)).toBeDefined();
    });
    it.each(['ok', 'issue', 'not_checked', 'not_applicable'] as const)('tenant captures %s and sends null notes with the exact OCC token', async status => {
        const h = renderReception(route, server(DETAIL));
        await screen.findByRole('button', { name: 'Agregar elemento de checklist' });
        click('Agregar elemento de checklist');
        change('Código del elemento', 'lights'); change('Elemento del checklist', 'Luces');
        change('Estado del elemento', status); change('Notas del checklist (opcional)', '  ');
        expect(within(screen.getByLabelText('Estado del elemento')).getAllByRole('option').map(option => option.textContent)).toEqual(['Correcto', 'Novedad', 'Sin revisar', 'No aplica']);
        click('Guardar checklist');
        await waitFor(() => { expect(screen.queryByRole('form', { name: 'Edición de checklist' })).toBeNull(); });
        expect(payload(patches(h.calls)[0])).toEqual({ expectedUpdatedAt: TIME, items: [{ code: 'lights', label: 'Luces', status, notes: null }] });
        click('Agregar daño'); change('Zona', 'rear'); change('Tipo de daño', 'dent'); click('Guardar daño');
        await waitFor(() => { expect(patches(h.calls)).toHaveLength(2); });
        expect(payload(patches(h.calls)[1])['expectedUpdatedAt']).toBe(NEXT);
    });
    it('edits a checklist by its unchanged code and immediately uses the new version for general editing', async () => {
        const respond = server();
        const h = renderReception(route, call => call.url.pathname === '/api/v1/receptions/' + IDS.reception && call.init.method === 'PATCH' ? jsonResponse({ reception: { ...DETAIL, updatedAt: NEXT, mileageKm: 101 } }) : respond(call));
        fireEvent.click(await screen.findByRole('button', { name: 'Editar elemento Luces' }));
        expect(screen.getByLabelText('Código del elemento').hasAttribute('readonly')).toBe(true);
        change('Notas del checklist (opcional)', 'Observación'); click('Guardar checklist');
        await screen.findByText('Observación');
        click('Editar recepción'); change('Kilometraje (km)', '101'); click('Guardar cambios');
        await waitFor(() => { expect(patches(h.calls)).toHaveLength(2); });
        expect(payload(patches(h.calls)[1])['expectedUpdatedAt']).toBe(NEXT);
    });
    it.each(['minor', 'moderate', 'severe'] as const)('creates %s without damageId and updates the same damageId', async severity => {
        const h = renderReception(route, server(DETAIL));
        await screen.findByRole('button', { name: 'Agregar daño' }); click('Agregar daño');
        change('Zona', 'front'); change('Tipo de daño', 'scratch'); change('Severidad', severity); change('Descripción opcional', ' ');
        expect(within(screen.getByLabelText('Severidad')).getAllByRole('option').map(option => option.textContent)).toEqual(['Leve', 'Moderado', 'Grave']);
        click('Guardar daño');
        await screen.findByRole('button', { name: 'Editar daño front · scratch' });
        expect(payload(patches(h.calls)[0])).toEqual({ expectedUpdatedAt: TIME, damages: [{ operation: 'create', zoneCode: 'front', damageType: 'scratch', severity, description: null }] });
        click('Editar daño front · scratch'); change('Zona', 'rear'); change('Descripción opcional', 'Golpe existente'); click('Guardar daño');
        await waitFor(() => { expect(screen.queryByRole('form', { name: 'Edición de daño' })).toBeNull(); });
        expect(payload(patches(h.calls)[1])).toEqual({ expectedUpdatedAt: NEXT, damages: [{ operation: 'update', damageId: DAMAGE.damageId, zoneCode: 'rear', damageType: 'scratch', severity, description: 'Golpe existente' }] });
        expect(h.calls.some(call => call.init.method === 'DELETE')).toBe(false);
    });
});
describe('inspection concurrency and recovery', () => {
    it.each(['checklist', 'damages'] as const)('%s double click creates one PATCH and blocks the other editors', async kind => {
        let resolve: ((response: FetchResponse) => void) | undefined;
        const h = renderReception(route, call => call.init.method === 'PATCH' ? new Promise(r => { resolve = r; }) : jsonResponse({ reception: initial }));
        await screen.findByRole('button', { name: 'Agregar daño' });
        click(kind === 'checklist' ? 'Editar elemento Luces' : 'Editar daño front · scratch');
        const button = screen.getByRole('button', { name: kind === 'checklist' ? 'Guardar checklist' : 'Guardar daño' });
        fireEvent.click(button); fireEvent.click(button);
        await screen.findByText('Guardando inspección…');
        expect(patches(h.calls)).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Editar recepción' }).hasAttribute('disabled')).toBe(true);
        expect(screen.getByRole('button', { name: 'Agregar daño' }).hasAttribute('disabled')).toBe(true);
        await act(() => { resolve?.(jsonResponse({ reception: { ...initial, updatedAt: NEXT } })); return Promise.resolve(); });
        await waitFor(() => { expect(screen.queryByText('Guardando inspección…')).toBeNull(); });
    });
    it.each(['checklist', 'damages'] as const)('%s stale OCC refetches, preserves drafts and requires explicit review before another PATCH', async kind => {
        let writes = 0;
        const h = renderReception(route, call => call.init.method === 'PATCH' ?
            ++writes === 1 ? errorResponse('RESOURCE_VERSION_CONFLICT') : jsonResponse({ reception: { ...initial, updatedAt: NEXT } }) :
            jsonResponse({ reception: { ...initial, updatedAt: writes === 0 ? TIME : NEXT } }));
        await screen.findByRole('button', { name: 'Agregar daño' });
        click(kind === 'checklist' ? 'Editar elemento Luces' : 'Editar daño front · scratch');
        const field = kind === 'checklist' ? 'Notas del checklist (opcional)' : 'Descripción opcional';
        const save = kind === 'checklist' ? 'Guardar checklist' : 'Guardar daño';
        change(field, 'Conservar entrada'); click(save);
        await screen.findByRole('button', { name: 'He revisado la inspección actual' });
        expect(patches(h.calls)).toHaveLength(1);
        expect(h.calls.filter(call => call.init.method === 'GET')).toHaveLength(2);
        expect(screen.getByLabelText<HTMLTextAreaElement>(field).value).toBe('Conservar entrada');
        expect(screen.getByRole('button', { name: save }).hasAttribute('disabled')).toBe(true);
        click(save); expect(patches(h.calls)).toHaveLength(1);
        click('He revisado la inspección actual'); click(save);
        await waitFor(() => { expect(patches(h.calls)).toHaveLength(2); });
        expect(payload(patches(h.calls)[1])['expectedUpdatedAt']).toBe(NEXT);
    });
    it.each(['checklist', 'damages'] as const)('%s RECEPTION_NOT_EDITABLE refetches and locks all writes', async kind => {
        let writes = 0;
        const h = renderReception(route, call => call.init.method === 'PATCH' ? (writes++, errorResponse('RECEPTION_NOT_EDITABLE')) :
            jsonResponse({ reception: writes === 0 ? initial : { ...initial, status: 'closed', closedAt: TIME, updatedAt: NEXT } }));
        await screen.findByRole('button', { name: 'Agregar daño' });
        click(kind === 'checklist' ? 'Editar elemento Luces' : 'Editar daño front · scratch');
        click(kind === 'checklist' ? 'Guardar checklist' : 'Guardar daño');
        await screen.findByText('Cerrada');
        expect(patches(h.calls)).toHaveLength(1);
        expect(screen.getByRole('button', { name: /Guardar checklist|Guardar daño/ }).hasAttribute('disabled')).toBe(true);
        expect(screen.queryByRole('button', { name: 'Editar recepción' })).toBeNull();
    });
});
describe('inspection HTTP boundary', () => {
    it.each<{ kind: 'checklist' | 'damages'; body: JsonObject }>([
        { kind: 'checklist' as const, body: { expectedUpdatedAt: TIME, items: [] } },
        { kind: 'checklist' as const, body: { expectedUpdatedAt: TIME, items: [{ code: 'x', label: 'x', status: 'invalid', notes: null }] } },
        { kind: 'damages' as const, body: { expectedUpdatedAt: TIME, damages: [{ operation: 'create', damageId: IDS.other, zoneCode: 'x', damageType: 'x', severity: 'minor', description: null }] } },
        { kind: 'damages' as const, body: { expectedUpdatedAt: TIME, damages: [{ operation: 'update', zoneCode: 'x', damageType: 'x', severity: 'minor', description: null }] } },
    ])('rejects invalid $kind before network', async ({ kind, body }) => {
        let calls = 0;
        const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'test' }), fetchImpl: () => { calls++; return Promise.resolve(jsonResponse(null)); } });
        const api = createReceptionApi(client, IDS.tenant, new AbortController().signal);
        const result = await (kind === 'checklist' ? api.patchChecklist(IDS.reception, body) : api.patchDamages(IDS.reception, body));
        expect(result).toMatchObject({ ok: false, failure: { kind: 'client_bug' } }); expect(calls).toBe(0);
    });
    it.each([401, 403, 429, 500])('PATCH %s is never retried and carries exact auth/context headers', async status => {
        const h = renderReception(route, call => call.init.method === 'PATCH' ? errorResponse('KNOWN_CODE', status) : jsonResponse({ reception: initial }));
        await screen.findByRole('button', { name: 'Editar elemento Luces' }); click('Editar elemento Luces'); click('Guardar checklist');
        await screen.findByText(/Referencia de solicitud:/);
        expect(patches(h.calls)).toHaveLength(1);
        expect(patches(h.calls)[0]?.url.pathname).toBe('/api/v1/receptions/' + IDS.reception + '/checklist');
        const headers = new Headers(patches(h.calls)[0]?.init.headers);
        expect(headers.get('Authorization')).toBe('Bearer test-token'); expect(headers.get('X-Tenant-Id')).toBe(IDS.tenant);
        expect(headers.get('Content-Type')).toBe('application/json'); expect(headers.has('Idempotency-Key')).toBe(false);
    });
});

describe('inspection recovery boundaries', () => {
    it('failed conflict refresh blocks save until an explicit successful GET and review', async () => {
        let writes = 0, lookups = 0;
        const h = renderReception(route, call => {
            if (call.init.method === 'PATCH') { writes++; return errorResponse('RESOURCE_VERSION_CONFLICT'); }
            lookups++;
            return lookups === 2 ? errorResponse('INTERNAL_ERROR', 500) : jsonResponse({ reception: { ...initial, updatedAt: lookups > 2 ? NEXT : TIME } });
        });
        await screen.findByRole('button', { name: 'Editar elemento Luces' }); click('Editar elemento Luces');
        change('Notas del checklist (opcional)', 'Mi borrador'); click('Guardar checklist');
        await screen.findByRole('button', { name: 'Volver a consultar inspección' });
        expect(writes).toBe(1); expect(lookups).toBe(2);
        click('Guardar checklist'); expect(writes).toBe(1);
        click('Volver a consultar inspección');
        await screen.findByRole('button', { name: 'He revisado la inspección actual' });
        expect(lookups).toBe(3);
        expect(screen.getByLabelText<HTMLTextAreaElement>('Notas del checklist (opcional)').value).toBe('Mi borrador');
        expect(patches(h.calls)).toHaveLength(1);
    });
    it('not-editable remains locked even when its detail GET fails, but allows a read-only refresh', async () => {
        let writes = 0, lookups = 0;
        const h = renderReception(route, call => {
            if (call.init.method === 'PATCH') { writes++; return errorResponse('RECEPTION_NOT_EDITABLE'); }
            lookups++;
            return lookups === 2 ? errorResponse('INTERNAL_ERROR', 500) : jsonResponse({ reception: lookups > 2 ? { ...initial, status: 'closed', closedAt: TIME } : initial });
        });
        await screen.findByRole('button', { name: 'Editar daño front · scratch' }); click('Editar daño front · scratch'); click('Guardar daño');
        await screen.findByRole('button', { name: 'Volver a consultar inspección' });
        expect(screen.queryByRole('button', { name: 'Editar recepción' })).toBeNull();
        click('Guardar daño'); expect(writes).toBe(1);
        click('Volver a consultar inspección'); await screen.findByText('Cerrada');
        expect(patches(h.calls)).toHaveLength(1);
    });
    it('ambiguous damage create performs GET, preserves draft and never retries automatically', async () => {
        let lookups = 0;
        const h = renderReception(route, call => call.init.method === 'PATCH' ? Promise.reject(new Error('lost PATCH response')) : (lookups++, jsonResponse({ reception: { ...initial, updatedAt: lookups === 1 ? TIME : NEXT } })));
        await screen.findByRole('button', { name: 'Agregar daño' }); click('Agregar daño');
        change('Zona', 'rear'); change('Tipo de daño', 'dent'); click('Guardar daño');
        await screen.findByRole('button', { name: 'He revisado la inspección actual' });
        expect(patches(h.calls)).toHaveLength(1); expect(lookups).toBe(2);
        expect(screen.getByLabelText<HTMLInputElement>('Zona').value).toBe('rear');
        expect(screen.getByRole('button', { name: 'Guardar daño' }).hasAttribute('disabled')).toBe(true);
    });
    it.each([{ reception: { ...initial, receptionId: IDS.vehicle } }, { reception: TECH }, { reception: DETAIL, checklist: [] }, null])('rejects incomplete/foreign PATCH response %j', async response => {
        const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'test' }), fetchImpl: () => Promise.resolve(jsonResponse(response)) });
        const api = createReceptionApi(client, IDS.tenant, new AbortController().signal);
        const result = await api.patchChecklist(IDS.reception, { expectedUpdatedAt: TIME, items: [{ code: 'lights', label: 'Luces', status: 'ok', notes: null }] });
        // DETAIL is a full valid DTO; extra envelope fields never become a replacement collection.
        expect(result.ok).toBe(response !== null && 'reception' in response && response.reception === DETAIL);
    });
});
