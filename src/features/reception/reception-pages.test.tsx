import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CONSENT, CUSTOMER, DETAIL, errorResponse, IDS, jsonResponse, NOTICE, OWNER, RECEPTION, renderReception, SUMMARY, TECH, TIME, VEHICLE, type Call } from '@/test/render-reception';
import type { FetchResponse } from '@/shared/api/http-client';
async function click(name: string) { fireEvent.click(await screen.findByRole('button', { name })); }
function fill(name: string, value: string) { fireEvent.change(screen.getByLabelText(name), { target: { value } }); }
const bodyOf = (call: Call | undefined): unknown => typeof call?.init.body === 'string' ? JSON.parse(call.init.body) : null;
function defaults(call: Call): FetchResponse {
    const path = call.url.pathname;
    if (path === '/api/v1/vehicles')
        return jsonResponse({ vehicles: [VEHICLE], nextCursor: null });
    if (path === '/api/v1/customers')
        return jsonResponse({ customers: [CUSTOMER], nextCursor: null });
    if (path.endsWith('/owners'))
        return jsonResponse({ owners: [OWNER] });
    if (path.endsWith('/privacy-consents'))
        return call.init.method === 'POST' ? jsonResponse({ privacyConsent: CONSENT }, 201) : jsonResponse({ privacyConsents: [CONSENT] });
    if (path === '/api/v1/privacy-notice')
        return jsonResponse({ privacyNotice: NOTICE });
    if (path === '/api/v1/receptions')
        return call.init.method === 'POST' ? jsonResponse({ reception: RECEPTION }, 201) : jsonResponse({ receptions: [SUMMARY], nextCursor: null });
    return jsonResponse({ reception: DETAIL });
}
async function chooseVehicle() {
    fill('Buscar vehículo por placa', 'abc-123');
    await click('Buscar vehículo');
    await click('ABC123 — Marca de prueba Modelo de prueba');
    await click('Consultar propietario vigente');
    await screen.findByRole('heading', { name: 'Propietario: Ana Prueba' });
    await click('Confirmar propietario y consultar autorización');
}
async function prepareExistingConsent() { await chooseVehicle(); await screen.findByText('Autorización vigente para la prestación del servicio.'); fill('Kilometraje (km)', '101'); }
async function grantConsent() {
    fireEvent.click(await screen.findByLabelText('El propietario declara expresamente que es mayor de edad.'));
    fireEvent.click(screen.getByLabelText('El propietario autoriza el tratamiento descrito para la prestación del servicio.'));
    await click('Registrar autorización');
    await screen.findByText('Autorización vigente para la prestación del servicio.');
}
describe('reception list and routing', () => {
    it('renders real list and accumulates the opaque next page', async () => {
        const h = renderReception('/recepciones', (call) => jsonResponse({ receptions: [{ ...SUMMARY, receptionId: call.url.searchParams.has('cursor') ? IDS.other : IDS.reception }], nextCursor: call.url.searchParams.has('cursor') ? null : 'cursor_one' }));
        await screen.findByRole('link', { name: /Abrir recepción/ });
        await click('Cargar más');
        await waitFor(() => { expect(screen.getAllByRole('link', { name: /Abrir recepción/ })).toHaveLength(2); });
        expect(h.calls[1]?.url.search).toBe('?limit=25&cursor=cursor_one');
        expect(screen.queryByRole('button', { name: 'Cargar más' })).toBeNull();
    });
    it('shows empty state and loads status filter from the first page', async () => {
        const h = renderReception('/recepciones', () => jsonResponse({ receptions: [], nextCursor: null }));
        await screen.findByText('No hay recepciones para estos filtros.');
        fill('Estado', 'closed');
        await waitFor(() => { expect(h.calls.some((c) => c.url.search === '?limit=25&status=closed')).toBe(true); });
    });
    it('selects vehicle/customer filters through approved CRM searches', async () => {
        const h = renderReception('/recepciones', defaults);
        await screen.findByRole('link', { name: /Abrir recepción/ });
        fill('Buscar vehículo por placa', 'ABC123');
        await click('Buscar vehículo');
        await click('ABC123 — Marca de prueba Modelo de prueba');
        await waitFor(() => { expect(h.calls.some((c) => c.url.searchParams.get('vehicleId') === IDS.vehicle)).toBe(true); });
        fill('Buscar cliente por nombre', 'Ana');
        await click('Buscar cliente');
        await click('Ana Prueba');
        await waitFor(() => { expect(h.calls.some((c) => c.url.searchParams.get('vehicleId') === IDS.vehicle && c.url.searchParams.get('customerId') === IDS.customer)).toBe(true); });
        await click('Quitar vehículo');
        await waitFor(() => { expect(h.calls.at(-1)?.url.searchParams.has('vehicleId')).toBe(false); });
    });
    it('shows error with request reference and retries without backend copy', async () => {
        let count = 0;
        const h = renderReception('/recepciones', () => ++count === 1 ? errorResponse('INTERNAL_ERROR', 500) : jsonResponse({ receptions: [], nextCursor: null }));
        await screen.findByText('request-test');
        expect(screen.queryByText('PRIVATE BACKEND COPY MUST NEVER APPEAR')).toBeNull();
        await click('Reintentar');
        await screen.findByText('No hay recepciones para estos filtros.');
        expect(h.calls).toHaveLength(2);
    });
    it('enforces Retry-After before enabling retry', async () => {
        renderReception('/recepciones', () => errorResponse('RATE_LIMIT_EXCEEDED', 429, '1'));
        const button = await screen.findByRole('button', { name: 'Reintentar' });
        expect(button.hasAttribute('disabled')).toBe(true);
        await waitFor(() => { expect(button.hasAttribute('disabled')).toBe(false); }, { timeout: 2000 });
    });
    it('does not call list with assigned-only or missing permissions', async () => {
        const h = renderReception('/recepciones', defaults, [{ code: 'receptions.read', scopes: ['assigned'] }]);
        await screen.findByText(/El listado requiere acceso/);
        expect(h.calls).toHaveLength(0);
        expect(screen.queryByRole('link', { name: 'Nueva recepción' })).toBeNull();
    });
    it('does not expose create or update actions when their permissions are absent', async () => {
        renderReception('/recepciones/nueva', defaults, [{ code: 'receptions.read', scopes: ['tenant'] }]);
        await screen.findByText('No tienes permiso para crear recepciones.');
        expect(screen.queryByRole('button', { name: 'Crear recepción' })).toBeNull();
    });
    it('works under application StrictMode', async () => {
        renderReception('/recepciones', defaults, undefined, true);
        await screen.findByRole('link', { name: /Abrir recepción/ });
    });
});
describe('reception detail and edits', () => {
    it('displays tenant detail and inspection editing actions', async () => {
        renderReception(`/recepciones/${IDS.reception}`, () => jsonResponse({ reception: { ...DETAIL, checklist: [{ checkItemId: IDS.other, code: 'lights', label: 'Luces', status: 'issue', notes: 'Revisar luz', createdAt: TIME }], damages: [{ damageId: IDS.other, zoneCode: 'front', damageType: 'scratch', severity: 'minor', description: 'Daño de prueba', createdAt: TIME }] } }));
        await screen.findByText('Luces: Novedad');
        expect(screen.getByText('Daño de prueba')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Agregar elemento de checklist' })).toBeDefined();
        expect(screen.getByRole('button', { name: 'Agregar daño' })).toBeDefined();
    });
    it('renders assigned DTO without internal notes or edition', async () => {
        renderReception(`/recepciones/${IDS.reception}`, () => jsonResponse({ reception: TECH }), [{ code: 'receptions.read', scopes: ['assigned'] }]);
        await screen.findByText('100 km');
        expect(screen.queryByRole('heading', { name: 'Notas del asesor' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Editar recepción' })).toBeNull();
    });
    it('PATCH sends only modified fields and the exact token', async () => {
        const h = renderReception(`/recepciones/${IDS.reception}`, (c) => c.init.method === 'PATCH' ? jsonResponse({ reception: { ...RECEPTION, mileageKm: 101 } }) : defaults(c));
        await click('Editar recepción');
        fill('Kilometraje (km)', '101');
        await click('Guardar cambios');
        await screen.findByText('101 km');
        expect(bodyOf(h.calls.find((c) => c.init.method === 'PATCH'))).toEqual({ expectedUpdatedAt: TIME, mileageKm: 101 });
    });
    it('conflict rereads, preserves input and only retries after reviewing current values', async () => {
        let patches = 0, reads = 0;
        const fresh = '2026-10-01T15:04:05.999999Z';
        const h = renderReception(`/recepciones/${IDS.reception}`, (c) => {
            if (c.init.method === 'PATCH')
                return ++patches === 1 ? errorResponse('RESOURCE_VERSION_CONFLICT') : jsonResponse({ reception: { ...RECEPTION, mileageKm: 101, customerNotes: 'Nota nueva del servidor', updatedAt: fresh } });
            return jsonResponse({ reception: ++reads === 1 ? DETAIL : { ...DETAIL, mileageKm: 90, customerNotes: 'Nota nueva del servidor', updatedAt: fresh } });
        });
        await click('Editar recepción');
        fill('Kilometraje (km)', '101');
        await click('Guardar cambios');
        await screen.findByRole('button', { name: 'He revisado la versión actual' });
        expect(screen.getByLabelText<HTMLInputElement>('Kilometraje (km)').value).toBe('101');
        expect(screen.getByRole('button', { name: 'Guardar cambios' }).hasAttribute('disabled')).toBe(true);
        expect(patches).toBe(1);
        await click('He revisado la versión actual');
        await click('Guardar cambios');
        await screen.findByText('101 km');
        expect(bodyOf(h.calls.filter((c) => c.init.method === 'PATCH')[1])).toEqual({ expectedUpdatedAt: fresh, mileageKm: 101 });
    });
    it('RECEPTION_NOT_EDITABLE rereads and locks edition while preserving entered notes', async () => {
        let reads = 0;
        renderReception(`/recepciones/${IDS.reception}`, (c) => c.init.method === 'PATCH' ? errorResponse('RECEPTION_NOT_EDITABLE') : jsonResponse({ reception: ++reads === 1 ? DETAIL : { ...DETAIL, status: 'closed', closedAt: TIME } }));
        await click('Editar recepción');
        fill('Notas internas del asesor', 'Texto conservado');
        await click('Guardar cambios');
        await screen.findByText('Cerrada');
        expect(screen.getByLabelText<HTMLTextAreaElement>('Notas internas del asesor').value).toBe('Texto conservado');
        expect(screen.getByRole('button', { name: 'Guardar cambios' }).hasAttribute('disabled')).toBe(true);
    });
    it.each([401, 403, 500])('handles status %i safely at detail', async (status) => {
        const h = renderReception(`/recepciones/${IDS.reception}`, () => errorResponse(status === 401 ? 'AUTHENTICATION_REQUIRED' : status === 403 ? 'PERMISSION_DENIED' : 'INTERNAL_ERROR', status));
        await screen.findByText('request-test');
        expect(screen.queryByText('PRIVATE BACKEND COPY MUST NEVER APPEAR')).toBeNull();
        expect(h.calls).toHaveLength(status === 401 ? 2 : 1);
    });
});
describe('new reception and privacy', () => {
    it('searches normalized plate, uses primary owner and existing consent to create', async () => {
        const h = renderReception('/recepciones/nueva', defaults);
        await prepareExistingConsent();
        await click('Crear recepción');
        await screen.findByRole('heading', { name: 'Detalle de recepción' });
        expect(h.calls[0]?.url.search).toBe('?limit=25&plate=ABC123');
        expect(bodyOf(h.calls.find((c) => c.init.method === 'POST'))).toEqual({ vehicleId: IDS.vehicle, customerId: IDS.customer, privacyConsentId: IDS.consent, mileageKm: 101, fuelLevelPct: null, customerNotes: null, advisorNotes: null });
    });
    it.each([[], [{ ...OWNER, isPrimary: false }], [OWNER, { ...OWNER, ownershipId: IDS.reception }]].map((owners) => ({ owners })))('blocks missing or conflicting primary owner', async ({ owners }) => {
        renderReception('/recepciones/nueva', (c) => c.url.pathname.endsWith('/owners') ? jsonResponse({ owners }) : defaults(c));
        fill('Buscar vehículo por placa', 'ABC123');
        await click('Buscar vehículo');
        await click('ABC123 — Marca de prueba Modelo de prueba');
        await click('Consultar propietario vigente');
        await screen.findByText(/No hay un único propietario/);
        expect(screen.getByRole('button', { name: 'Crear recepción' }).hasAttribute('disabled')).toBe(true);
    });
    it('shows exact notice/controller and requires adult plus authorization before capture', async () => {
        const h = renderReception('/recepciones/nueva', (c) => c.url.pathname.endsWith('/privacy-consents') && c.init.method === 'GET' ? jsonResponse({ privacyConsents: [] }) : defaults(c));
        await chooseVehicle();
        await screen.findByRole('heading', { name: 'Autorización de datos personales' });
        expect(screen.getByText('Taller de prueba')).toBeDefined();
        expect(screen.getByText(/Aviso exacto/).textContent).toBe(NOTICE.privacyNoticeText);
        expect(screen.getByRole('button', { name: 'Registrar autorización' }).hasAttribute('disabled')).toBe(true);
        await grantConsent();
        expect(bodyOf(h.calls.find((c) => c.init.method === 'POST'))).toEqual({ purposeCode: 'service_provision', privacyNoticeVersion: NOTICE.privacyNoticeVersion, authorizationTextVersion: NOTICE.authorizationTextVersion, channel: 'in_person', adultAttestationConfirmed: true });
        expect(h.calls.some((c) => c.init.method === 'POST' && c.url.pathname === '/api/v1/receptions')).toBe(false);
    });
    it('PRIVACY_CONSENT_ALREADY_GRANTED rereads and reuses valid consent', async () => {
        let reads = 0;
        const h = renderReception('/recepciones/nueva', (c) => c.url.pathname.endsWith('/privacy-consents') ? c.init.method === 'POST' ? errorResponse('PRIVACY_CONSENT_ALREADY_GRANTED') : jsonResponse({ privacyConsents: ++reads === 1 ? [] : [CONSENT] }) : defaults(c));
        await chooseVehicle();
        await grantConsent();
        expect(reads).toBe(2);
        expect(h.calls.filter((c) => c.init.method === 'POST')).toHaveLength(1);
    });
    it.each(['PRIVACY_CONSENT_NOT_ELIGIBLE', 'PRIVACY_CONSENT_NOT_FOUND'])('%s preserves intake and allows explicit recapture', async (code) => {
        const h = renderReception('/recepciones/nueva', (c) => c.url.pathname === '/api/v1/receptions' && c.init.method === 'POST' ? errorResponse(code, code === 'PRIVACY_CONSENT_NOT_FOUND' ? 404 : 409) : defaults(c));
        await prepareExistingConsent();
        fill('Observaciones del cliente', 'Conservar texto');
        await click('Crear recepción');
        await screen.findByRole('heading', { name: 'Autorización de datos personales' });
        expect(screen.getByLabelText<HTMLTextAreaElement>('Observaciones del cliente').value).toBe('Conservar texto');
        await grantConsent();
        expect(h.calls.filter((c) => c.init.method === 'POST' && c.url.pathname === '/api/v1/receptions')).toHaveLength(1);
    });
    it('RECEPTION_ALREADY_OPEN retrieves an existing reception and offers its link', async () => {
        const h = renderReception('/recepciones/nueva', (c) => c.url.pathname === '/api/v1/receptions' && c.init.method === 'POST' ? errorResponse('RECEPTION_ALREADY_OPEN') : defaults(c));
        await prepareExistingConsent();
        await click('Crear recepción');
        const link = await screen.findByRole('link', { name: /Abrir recepción existente/ });
        expect(link.getAttribute('href')).toBe(`/recepciones/${IDS.reception}`);
        expect(h.calls.some((c) => c.url.search === `?limit=25&status=open&vehicleId=${IDS.vehicle}`)).toBe(true);
        await click('Buscar recepción abierta');
        await screen.findByRole('link', { name: /Abrir recepción existente/ });
    });
    it('VEHICLE_OWNERSHIP_CONFLICT rereads owner, clears consent and keeps typed data', async () => {
        let owners = 0;
        renderReception('/recepciones/nueva', (c) => {
            if (c.url.pathname.endsWith('/owners'))
                return jsonResponse({ owners: [++owners === 1 ? OWNER : { ...OWNER, customerId: IDS.other, customer: { firstName: 'Nuevo', lastName: 'Dueño' } }] });
            if (c.url.pathname === '/api/v1/receptions' && c.init.method === 'POST')
                return errorResponse('VEHICLE_OWNERSHIP_CONFLICT');
            return defaults(c);
        });
        await prepareExistingConsent();
        await click('Crear recepción');
        await screen.findByRole('heading', { name: 'Propietario: Nuevo Dueño' });
        expect(screen.getByLabelText<HTMLInputElement>('Kilometraje (km)').value).toBe('101');
        expect(screen.getByRole('button', { name: 'Crear recepción' }).hasAttribute('disabled')).toBe(true);
        expect(owners).toBe(2);
    });
    it('RECEPTION_MILEAGE_CONFLICT preserves input for correction without automatic POST retry', async () => {
        const h = renderReception('/recepciones/nueva', (c) => c.url.pathname === '/api/v1/receptions' && c.init.method === 'POST' ? errorResponse('RECEPTION_MILEAGE_CONFLICT') : defaults(c));
        await prepareExistingConsent();
        await click('Crear recepción');
        await screen.findByText(/El kilometraje es menor/);
        expect(screen.getByLabelText<HTMLInputElement>('Kilometraje (km)').value).toBe('101');
        expect(h.calls.filter((c) => c.init.method === 'POST')).toHaveLength(1);
    });
});
describe('context and asynchronous isolation', () => {
    it('aborts previous tenant requests and discards a late response', async () => {
        let resolveOld: (value: FetchResponse) => void = () => { throw new Error('old request not started'); };
        const h = renderReception('/recepciones', (call) => call.init.headers !== undefined && new Headers(call.init.headers).get('X-Tenant-Id') === IDS.tenant ? new Promise<FetchResponse>((resolve) => { resolveOld = resolve; }) : jsonResponse({ receptions: [{ ...SUMMARY, receptionId: IDS.other }], nextCursor: null }));
        await waitFor(() => { expect(h.calls).toHaveLength(1); });
        expect(screen.getByRole('status').textContent).toBe('Cargando recepciones…');
        const runtime = { ...h.runtime, tenantId: IDS.other };
        h.updateRuntime(runtime);
        const link = await screen.findByRole('link', { name: /Abrir recepción/ });
        expect(h.calls[0]?.init.signal?.aborted).toBe(true);
        await act(async () => { resolveOld(jsonResponse({ receptions: [SUMMARY], nextCursor: null })); await Promise.resolve(); });
        expect(link.getAttribute('href')).toBe(`/recepciones/${IDS.other}`);
        expect(screen.getAllByRole('link', { name: /Abrir recepción/ })).toHaveLength(1);
    });
    it('clears draft state when identity changes in the same workshop', () => {
        const h = renderReception('/recepciones/nueva', defaults);
        fill('Observaciones del cliente', 'Borrador de identidad anterior');
        const runtime = { ...h.runtime, identity: 'another-user:another-session' };
        h.updateRuntime(runtime);
        expect(screen.getByLabelText<HTMLTextAreaElement>('Observaciones del cliente').value).toBe('');
    });
    it('tenant read permission alone does not permit editing an open reception', async () => {
        renderReception(`/recepciones/${IDS.reception}`, defaults, [{ code: 'receptions.read', scopes: ['tenant'] }]);
        await screen.findByText('100 km');
        expect(screen.queryByRole('button', { name: 'Editar recepción' })).toBeNull();
    });
});
describe('intake review regressions', () => {
    it('tracks an explicitly cleared customer note after a version conflict', async () => {
        let patches = 0, reads = 0;
        const fresh = '2026-10-01T15:04:05.999999Z';
        const h = renderReception(`/recepciones/${IDS.reception}`, (call) => {
            if (call.init.method === 'PATCH') {
                patches += 1;
                return patches === 1 ? errorResponse('RESOURCE_VERSION_CONFLICT') : jsonResponse({ reception: { ...RECEPTION, mileageKm: 101, customerNotes: null, advisorNotes: 'nota interna remota', updatedAt: fresh } });
            }
            reads += 1;
            return jsonResponse({ reception: reads === 1 ? DETAIL : { ...DETAIL, customerNotes: 'nota remota', advisorNotes: 'nota interna remota', updatedAt: fresh } });
        });
        await click('Editar recepción');
        fill('Kilometraje (km)', '101');
        await click('Guardar cambios');
        await screen.findByRole('button', { name: 'He revisado la versión actual' });
        expect(screen.getByLabelText<HTMLTextAreaElement>('Observaciones del cliente').value).toBe('');
        expect(screen.getByLabelText<HTMLInputElement>('Kilometraje (km)').value).toBe('101');
        fill('Observaciones del cliente', 'nota escrita después del conflicto');
        fill('Observaciones del cliente', '');
        await click('He revisado la versión actual');
        await click('Guardar cambios');
        await screen.findByText('101 km');
        expect(bodyOf(h.calls.filter((call) => call.init.method === 'PATCH')[1])).toEqual({ expectedUpdatedAt: fresh, mileageKm: 101, customerNotes: null });
    });
    it('keeps both cursor pages on an equivalent list rerender', async () => {
        const h = renderReception('/recepciones', (call) => jsonResponse({ receptions: [{ ...SUMMARY, receptionId: call.url.searchParams.has('cursor') ? IDS.other : IDS.reception }], nextCursor: call.url.searchParams.has('cursor') ? null : 'cursor_one' }));
        await screen.findByRole('link', { name: /Abrir recepción/ });
        await click('Cargar más');
        await waitFor(() => { expect(screen.getAllByRole('link', { name: /Abrir recepción/ })).toHaveLength(2); });
        await act(async () => { h.updateRuntime({ ...h.runtime }); await Promise.resolve(); });
        expect(h.calls.filter((call) => call.url.pathname === '/api/v1/receptions' && !call.url.searchParams.has('cursor'))).toHaveLength(1);
        expect(h.calls).toHaveLength(2);
        expect(screen.getAllByRole('link', { name: /Abrir recepción/ }).map((link) => link.getAttribute('href'))).toEqual([`/recepciones/${IDS.reception}`, `/recepciones/${IDS.other}`]);
    });
    it.each([
        { name: 'receptions.read only', vehicle: false, customer: false },
        { name: 'receptions.read and vehicles.read', vehicle: true, customer: false },
        { name: 'receptions.read and customers.read', vehicle: false, customer: true },
        { name: 'all three tenant read permissions', vehicle: true, customer: true },
    ])('gates CRM selectors independently with $name', async ({ vehicle, customer }) => {
        const permissions = [
            { code: 'receptions.read', scopes: ['tenant'] },
            ...(vehicle ? [{ code: 'vehicles.read', scopes: ['tenant'] }] : []),
            ...(customer ? [{ code: 'customers.read', scopes: ['tenant'] }] : []),
        ];
        const h = renderReception('/recepciones', defaults, permissions);
        await screen.findByRole('link', { name: /Abrir recepción/ });
        expect(screen.queryByLabelText('Buscar vehículo por placa') !== null).toBe(vehicle);
        expect(screen.queryByLabelText('Buscar cliente por nombre') !== null).toBe(customer);
        expect(screen.queryByRole('button', { name: 'Buscar vehículo' }) !== null).toBe(vehicle);
        expect(screen.queryByRole('button', { name: 'Buscar cliente' }) !== null).toBe(customer);
        fireEvent.keyDown(screen.getByLabelText('Estado'), { key: 'Enter' });
        fill('Estado', 'open');
        await waitFor(() => { expect(h.calls.some((call) => call.url.search === '?limit=25&status=open')).toBe(true); });
        if (vehicle) {
            fill('Buscar vehículo por placa', 'ABC123');
            await click('Buscar vehículo');
            await click('ABC123 — Marca de prueba Modelo de prueba');
        }
        if (customer) {
            fill('Buscar cliente por nombre', 'Ana');
            await click('Buscar cliente');
            await click('Ana Prueba');
        }
        await act(async () => { await Promise.resolve(); });
        expect(h.calls.filter((call) => call.url.pathname === '/api/v1/vehicles')).toHaveLength(vehicle ? 1 : 0);
        expect(h.calls.filter((call) => call.url.pathname === '/api/v1/customers')).toHaveLength(customer ? 1 : 0);
    });
    it('does not allow assigned CRM scopes to enable tenant search selectors', async () => {
        const h = renderReception('/recepciones', defaults, [
            { code: 'receptions.read', scopes: ['tenant'] },
            { code: 'vehicles.read', scopes: ['assigned'] },
            { code: 'customers.read', scopes: ['assigned'] },
        ]);
        await screen.findByRole('link', { name: /Abrir recepción/ });
        expect(screen.queryByRole('button', { name: 'Buscar vehículo' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Buscar cliente' })).toBeNull();
        fill('Estado', 'open');
        await waitFor(() => { expect(h.calls.some((call) => call.url.search === '?limit=25&status=open')).toBe(true); });
        expect(h.calls.some((call) => call.url.pathname === '/api/v1/vehicles' || call.url.pathname === '/api/v1/customers')).toBe(false);
    });
});
