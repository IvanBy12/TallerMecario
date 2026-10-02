import { describe, expect, it } from 'vitest';
import { createCustomerApi } from '@/features/customers/customer-api';
import { parseCustomer } from '@/features/customers/customer-contract';
import { createVehicleApi } from '@/features/vehicles/vehicle-api';
import { parseVehicleDetail } from '@/features/vehicles/vehicle-contract';
import { createApiClient } from '@/shared/api/http-client';
import { CUSTOMER, VEHICLE, IDS, TIME, jsonResponse, errorResponse, type Call } from '@/test/render-reception';
describe('contratos y transporte CRM', () => {
  it.each(['customers', 'vehicles'] as const)('GET %s único retry 401 con token fresco y contexto tenant', async resource => {
    const calls: Call[] = []; const policies: unknown[] = [];
    const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: options => { policies.push(options); return Promise.resolve({ kind: 'token', token: 'synthetic-token' }); }, fetchImpl: (url, init) => { calls.push({ url: new URL(url), init }); return Promise.resolve(calls.length === 1 ? errorResponse('AUTHENTICATION_REQUIRED', 401) : jsonResponse(resource === 'customers' ? { customers: [CUSTOMER], nextCursor: null } : { vehicles: [VEHICLE], nextCursor: null })); } });
    const signal = new AbortController().signal;
    const result = resource === 'customers' ? await createCustomerApi(client, IDS.tenant, signal).list() : await createVehicleApi(client, IDS.tenant, signal).list();
    expect(result.ok).toBe(true); expect(calls).toHaveLength(2); expect(policies).toEqual([undefined, { skipCache: true }]);
    for (const c of calls) { expect(new Headers(c.init.headers).get('Authorization')).toBe('Bearer synthetic-token'); expect(new Headers(c.init.headers).get('X-Tenant-Id')).toBe(IDS.tenant); expect(c.init.cache).toBe('no-store'); }
  });
  it.each(['customers', 'vehicles'] as const)('PATCH %s no retry 401 ni idempotency, conserva OCC microsegundos', async resource => {
    const calls: Call[] = [];
    const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic-token' }), fetchImpl: (url, init) => { calls.push({ url: new URL(url), init }); return Promise.resolve(errorResponse('AUTHENTICATION_REQUIRED', 401)); } });
    const signal = new AbortController().signal;
    if (resource === 'customers') await createCustomerApi(client, IDS.tenant, signal).patch(IDS.customer, { expectedUpdatedAt: TIME, notes: null });
    else await createVehicleApi(client, IDS.tenant, signal).patch(IDS.vehicle, { expectedUpdatedAt: TIME, color: null });
    expect(calls).toHaveLength(1); expect(readBody(calls[0]?.init.body)).toMatchObject({ expectedUpdatedAt: TIME });
    expect(new Headers(calls[0]?.init.headers).has('Idempotency-Key')).toBe(false);
  });
  it('rechaza DTOs CRM malformados y vehículo parcialmente reducido', () => {
    expect(parseCustomer({ customer: { ...CUSTOMER, updatedAt: undefined } })).toBeNull();
    expect(parseVehicleDetail({ vehicle: { vehicleId: IDS.vehicle, plate: 'ABC123', vehicleType: 'car', brand: 'Marca', model: 'Modelo', modelYear: 2024, color: null, vin: null } })).toBeNull();
    expect(parseVehicleDetail({ vehicle: VEHICLE })).toEqual(VEHICLE);
  });
  it('servicios no admiten campos ajenos al body, IDs arbitrarios ni PATCH vacío', async () => {
    let requests = 0;
    const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'test' }), fetchImpl: () => { requests++; return Promise.resolve(jsonResponse({})); } });
    const signal = new AbortController().signal;
    const customer = createCustomerApi(client, IDS.tenant, signal); const vehicle = createVehicleApi(client, IDS.tenant, signal);
    await customer.detail('../escape'); await vehicle.detail('../escape');
    await customer.patch(IDS.customer, { expectedUpdatedAt: TIME }); await vehicle.patch(IDS.vehicle, { expectedUpdatedAt: TIME });
    await vehicle.create({ customerId: IDS.customer, plate: 'ABC123', vehicleType: 'car', brand: 'Marca', model: 'Modelo', currentMileageKm: 1 });
    await customer.create({ firstName: 'Ana', lastName: 'Prueba', phone: '+5700000000', tenantId: IDS.other });
    expect(requests).toBe(0);
    expect('delete' in customer).toBe(false); expect('delete' in vehicle).toBe(false);
  });
});

function readBody(body: unknown): unknown { if (typeof body !== 'string') throw new Error('Expected JSON body'); return JSON.parse(body) as unknown; }
