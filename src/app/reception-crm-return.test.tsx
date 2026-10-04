import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CUSTOMER, VEHICLE, OWNER, IDS, PERMISSIONS, jsonResponse, renderReception, type Call } from '@/test/render-reception';
import { receptionReturn } from '@/shared/crm/reception-return';
const grants = [...PERMISSIONS, ...['customers.create', 'vehicles.create', 'vehicle_owners.manage'].map(code => ({ code, scopes: ['tenant'] }))];
const main = () => within(screen.getByRole('main'));
const change = (label: string, value: string) => { fireEvent.change(main().getByLabelText(label), { target: { value } }); };
const click = (name: string) => { fireEvent.click(main().getByRole('button', { name })); };
const respond = (call: Call) => {
    if (call.url.pathname === '/api/v1/customers' && call.init.method === 'POST') return jsonResponse({ customer: CUSTOMER }, 201);
    if (call.url.pathname === '/api/v1/vehicles' && call.init.method === 'POST') return jsonResponse({ vehicle: VEHICLE, ownership: { ...OWNER, vehicleId: IDS.vehicle } }, 201);
    if (call.url.pathname === '/api/v1/customers') return jsonResponse({ customers: [CUSTOMER], nextCursor: null });
    if (call.url.pathname === '/api/v1/vehicles') return jsonResponse({ vehicles: [], nextCursor: null });
    return jsonResponse({ customer: CUSTOMER });
};
async function searchEmpty() {
    change('Buscar vehículo por placa', 'ABC123'); click('Buscar vehículo');
    await main().findByText('No se encontraron resultados.');
}
function fillVehicle() {
    change('Placa *', 'ABC123'); change('Tipo de vehículo *', 'car'); change('Marca *', 'Marca de prueba'); change('Modelo *', 'Modelo de prueba');
}
describe('CRM return from reception intake', () => {
    it('vehicle not found exposes permission-aware CRM paths without PII or tenant query', async () => {
        renderReception('/recepciones/nueva', respond, grants);
        await searchEmpty();
        expect(main().getByRole('link', { name: 'Crear cliente y luego vehículo' }).getAttribute('href')).toBe('/clientes/nuevo?returnTo=%2Frecepciones%2Fnueva');
        expect(main().getByRole('link', { name: 'Crear vehículo' }).getAttribute('href')).toBe('/vehiculos/nuevo?returnTo=%2Frecepciones%2Fnueva');
    });
    it('creates customer, continues to existing vehicle form, creates vehicle and returns to a clean reception for selection', async () => {
        const h = renderReception('/recepciones/nueva', call => call.url.pathname === '/api/v1/vehicles' && call.init.method === 'GET' && h.calls.some(c => c.init.method === 'POST' && c.url.pathname === '/api/v1/vehicles') ?
            jsonResponse({ vehicles: [VEHICLE], nextCursor: null }) : respond(call), grants);
        await searchEmpty(); fireEvent.click(main().getByRole('link', { name: 'Crear cliente y luego vehículo' }));
        await main().findByRole('heading', { name: 'Nuevo cliente' });
        change('Nombre *', 'Ana'); change('Apellido *', 'Prueba'); change('Teléfono *', '+5700000000'); click('Guardar');
        await main().findByRole('heading', { name: 'Nuevo vehículo' });
        fireEvent.click(await main().findByRole('button', { name: 'Seleccionar Ana Prueba' }));
        fillVehicle(); click('Guardar');
        await main().findByRole('heading', { name: 'Nueva recepción' });
        change('Buscar vehículo por placa', 'ABC123'); click('Buscar vehículo');
        fireEvent.click(await main().findByRole('button', { name: /ABC123 — Marca de prueba/ }));
        await main().findByRole('heading', { name: 'Vehículo: ABC123' });
        const posts = h.calls.filter(c => c.init.method === 'POST');
        expect(posts.map(c => c.url.pathname)).toEqual(['/api/v1/customers', '/api/v1/vehicles']);
        expect(h.calls.every(c => new Headers(c.init.headers).get('X-Tenant-Id') === IDS.tenant)).toBe(true);
        expect(h.calls.every(c => !c.url.searchParams.has('tenantId') && !c.url.searchParams.has('returnTo'))).toBe(true);
    });
    it('vehicle form can detour to create a missing customer and cancellation returns to reception', async () => {
        renderReception('/vehiculos/nuevo?returnTo=%2Frecepciones%2Fnueva', respond, grants);
        await main().findByRole('heading', { name: 'Nuevo vehículo' });
        fireEvent.click(main().getByRole('link', { name: 'Crear cliente y continuar' }));
        await main().findByRole('heading', { name: 'Nuevo cliente' });
        fireEvent.click(main().getByRole('link', { name: 'Cancelar' }));
        await main().findByRole('heading', { name: 'Nueva recepción' });
    });
    it('does not offer CRM creation without the required tenant grants', async () => {
        renderReception('/recepciones/nueva', respond);
        await searchEmpty();
        expect(main().queryByRole('link', { name: 'Crear vehículo' })).toBeNull();
        expect(main().queryByRole('link', { name: 'Crear cliente y luego vehículo' })).toBeNull();
    });
    it.each(['https://evil.example/path', '//evil.example', 'javascript:alert(1)', '/clientes', '/recepciones/nueva/../otro'])('rejects returnTo %s and preserves normal CRM navigation after save', async destination => {
        const query = '?returnTo=' + encodeURIComponent(destination);
        expect(receptionReturn(query)).toBeNull();
        renderReception('/clientes/nuevo' + query, respond, grants);
        expect(main().getByRole('link', { name: 'Cancelar' }).getAttribute('href')).toBe('/clientes');
        change('Nombre *', 'Ana'); change('Apellido *', 'Prueba'); change('Teléfono *', '+5700000000'); click('Guardar');
        await main().findByRole('heading', { name: 'Ana Prueba', level: 1 });
    });
    it('vehicle ignores external returnTo after successful creation', async () => {
        renderReception('/vehiculos/nuevo?returnTo=https%3A%2F%2Fevil.example', call => call.url.pathname === '/api/v1/vehicles/' + IDS.vehicle ? jsonResponse({ vehicle: VEHICLE }) : call.url.pathname.endsWith('/owners') ? jsonResponse({ owners: [OWNER] }) : respond(call), grants);
        fireEvent.click(await main().findByRole('button', { name: 'Seleccionar Ana Prueba' }));
        fillVehicle(); click('Guardar');
        await waitFor(() => { expect(main().getByRole('heading', { name: 'ABC123', level: 1 })).toBeDefined(); });
    });
});
