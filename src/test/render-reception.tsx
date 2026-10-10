import { StrictMode, createContext, useContext } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { VoluntaryExitProvider } from '@/shared/navigation/voluntary-exit';
import { AppRoutes } from '@/app/app-routes';
import type { EffectivePermissions, ReceptionRuntime } from '@/features/reception/reception-context';
import { createApiClient, type FetchResponse } from '@/shared/api/http-client';
export const IDS = { tenant: '11111111-1111-4111-8111-111111111111', reception: '22222222-2222-4222-8222-222222222222', vehicle: '33333333-3333-4333-8333-333333333333', customer: '44444444-4444-4444-8444-444444444444', consent: '55555555-5555-4555-8555-555555555555', membership: '66666666-6666-4666-8666-666666666666', other: '77777777-7777-4777-8777-777777777777' };
export const TIME = '2026-10-01T15:04:05.123456Z';
export const RECEPTION = { receptionId: IDS.reception, vehicleId: IDS.vehicle, customerId: IDS.customer, appointmentId: null, locationId: null, receivedByMembershipId: IDS.membership, mileageKm: 100, fuelLevelPct: 40, customerNotes: null, advisorNotes: null, status: 'open' as const, receivedAt: TIME, closedAt: null, createdAt: TIME, updatedAt: TIME };
export const DETAIL = { ...RECEPTION, signature: null, serviceOrder: null, checklist: [], damages: [] };
export const TECH = { receptionId: IDS.reception, vehicleId: IDS.vehicle, mileageKm: 100, fuelLevelPct: null, status: 'open' as const, receivedAt: TIME, closedAt: null, signature: null, serviceOrder: null, checklist: [], damages: [] };
export const SUMMARY = { receptionId: IDS.reception, vehicleId: IDS.vehicle, customerId: IDS.customer, mileageKm: 100, fuelLevelPct: 40, status: 'open' as const, receivedAt: TIME, closedAt: null, updatedAt: TIME };
export const VEHICLE = { vehicleId: IDS.vehicle, plate: 'ABC123', vehicleType: 'car' as const, brand: 'Marca de prueba', model: 'Modelo de prueba', modelYear: 2024, color: null, vin: null, engineNumber: null, currentMileageKm: 100, createdAt: TIME, updatedAt: TIME };
export const CUSTOMER = { customerId: IDS.customer, firstName: 'Ana', lastName: 'Prueba', phone: '+5700000000', email: null, documentType: null, documentNumber: null, notes: null, createdAt: TIME, updatedAt: TIME };
export const OWNER = { ownershipId: IDS.other, customerId: IDS.customer, customer: { firstName: 'Ana', lastName: 'Prueba' }, relationshipType: 'owner' as const, isPrimary: true, validFrom: TIME, validTo: null };
export const CONSENT = { privacyConsentId: IDS.consent, customerId: IDS.customer, purposeCode: 'service_provision' as const, privacyNoticeVersion: 'notice_test_v1', authorizationTextVersion: 'authorization_test_v1', channel: 'in_person' as const, status: 'granted' as const, capturedAt: TIME, createdAt: TIME };
export const NOTICE = { purposeCode: 'service_provision' as const, privacyNoticeVersion: 'notice_test_v1', privacyNoticeText: 'Aviso exacto\nSegunda línea.', authorizationTextVersion: 'authorization_test_v1', authorizationText: 'Autorización exacta\nMayoría de edad.', controller: { legalName: 'Taller de prueba', address: 'Dirección de prueba', phone: null, email: 'prueba@example.test', rightsChannel: 'Correo electrónico: prueba@example.test' } };
export interface Call {
    readonly url: URL;
    readonly init: RequestInit;
}
export function jsonResponse(body: unknown, status = 200, retryAfter: string | null = null): FetchResponse {
    return { status, ok: status >= 200 && status < 300, type: 'basic', redirected: false, headers: { get: (name) => name === 'retry-after' ? retryAfter : null }, json: () => Promise.resolve(body) };
}
export function errorResponse(code: string, status = 409, retryAfter: string | null = null) { return jsonResponse({ error: { code, message: 'PRIVATE BACKEND COPY MUST NEVER APPEAR', request_id: 'request-test' } }, status, retryAfter); }
export const PERMISSIONS: EffectivePermissions = ['receptions.read', 'receptions.create', 'receptions.update_open', 'customers.read', 'vehicles.read', 'privacy_consents.read', 'privacy_consents.capture'].map((code) => ({ code, scopes: ['tenant'] }));
const RuntimeContext = createContext<ReceptionRuntime | null>(null);
export function renderReception(path: string, respond: (call: Call) => FetchResponse | Promise<FetchResponse>, permissions: EffectivePermissions = PERMISSIONS, strict = false, exits: { readonly onSignOut?: () => void; readonly onChangeWorkshop?: () => void } = {}) {
    const calls: Call[] = [];
    const tokenCalls: unknown[] = [];
    const apiClient = createApiClient({ apiOrigin: 'https://api.example.test', getToken: (options) => { tokenCalls.push(options); return Promise.resolve({ kind: 'token', token: 'test-token' }); }, fetchImpl: (url, init) => { const call = { url: new URL(url), init }; calls.push(call); return Promise.resolve(respond(call)); } });
    const runtime: ReceptionRuntime = { apiClient, tenantId: IDS.tenant, identity: 'synthetic-user:synthetic-session', permissions };
    function View() {
      const next = useContext(RuntimeContext);
      if (next === null) return <p>Sesión invalidada externamente</p>;
      return <VoluntaryExitProvider><AppRoutes shellStatus="context_ready" onSignOut={exits.onSignOut ?? (() => undefined)} onChangeWorkshop={exits.onChangeWorkshop} grantedPermissions={new Set(next.permissions.map(p => p.code))} receptionRuntime={next}/></VoluntaryExitProvider>;
    }
    const router = createMemoryRouter([{ path: '*', element: <View/> }], { initialEntries: ['/panel', path, '/vehiculos'], initialIndex: 1 });
    const view = (next: ReceptionRuntime | null) => <RuntimeContext.Provider value={next}><RouterProvider router={router}/></RuntimeContext.Provider>;
    const wrapped = (next: ReceptionRuntime | null) => strict ? <StrictMode>{view(next)}</StrictMode> : view(next);
    const rendered = render(wrapped(runtime));
    return { ...rendered, calls, tokenCalls, apiClient, runtime, router, updateRuntime: (next: ReceptionRuntime | null) => { rendered.rerender(wrapped(next)); } };
}
