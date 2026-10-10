import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, useNavigate } from 'react-router-dom';
import { AppRoutes } from '@/app/app-routes';
import { VoluntaryExitProvider } from '@/shared/navigation/voluntary-exit';
import { createApiClient, type FetchResponse } from '@/shared/api/http-client';
import { CONFIRMED_MEDIA as BASE_MEDIA, UPLOAD_DTO } from '@/test/media-fixtures';
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

const CONFIRMED_MEDIA = { ...BASE_MEDIA, sizeBytes: 68 };
const stage = new URLSearchParams(window.location.search).get('stage');
const permissions = ['receptions.read', 'receptions.create', 'receptions.update_open', 'customers.read', 'vehicles.read', 'privacy_consents.read', 'privacy_consents.capture', 'media.upload'].map(code => ({ code, scopes: ['tenant'] }));
const counters = { created: 0, uploaded: 0, attached: 0, revoked: 0, canceled: 0, signedOut: 0, switched: 0 };
const publish = () => { const node = document.querySelector('[data-testid="metrics"]'); if (node) node.textContent = JSON.stringify(counters); };
const revoke = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = url => { counters.revoked++; publish(); revoke(url); };
function response(data: unknown, status = 200): FetchResponse {
  return { ok: status < 400, status, redirected: false, type: 'basic', headers: { get: () => null }, json: () => Promise.resolve(data) };
}
const client = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic-only' }), fetchImpl: (url, init) => {
  const path = new URL(url).pathname;
  if (path.endsWith('/owners')) return Promise.resolve(response({ owners: [OWNER] }));
  if (path.endsWith('/privacy-consents')) return Promise.resolve(response({ privacyConsents: [CONSENT] }));
  if (path.endsWith('/privacy-notice')) return Promise.resolve(response({ privacyNotice: NOTICE }));
  if (path.endsWith('/vehicles')) return Promise.resolve(response({ vehicles: [VEHICLE], nextCursor: null }));
  if (path.endsWith('/upload-sessions')) { counters.uploaded++; publish(); return Promise.resolve(response(UPLOAD_DTO, 201)); }
  if (path.endsWith('/complete')) return Promise.resolve(response(CONFIRMED_MEDIA));
  if (path.endsWith('/media')) {
    counters.attached++; publish();
    if (stage === 'associating') {
      init.signal?.addEventListener('abort', () => { counters.canceled++; publish(); }, { once: true });
      return new Promise<FetchResponse>(() => {});
    }
    return Promise.resolve(response({ media: { mediaAssetId: CONFIRMED_MEDIA.mediaAssetId, sortOrder: 0, mediaType: 'photo', mimeType: 'image/png', sizeBytes: 68, capturedAt: null, uploadedAt: TIME, purpose: 'intake_evidence' } }));
  }
  if (path.endsWith('/receptions') && init.method === 'POST') { counters.created++; publish(); return Promise.resolve(response({ reception: RECEPTION }, 201)); }
  return Promise.resolve(response({ receptions: [], nextCursor: null }));
} });
// Direct signed PUT remains the real production executor. Only its synthetic destination is substituted here.
window.fetch = (_url, init) => {
  if (stage === 'uploading') {
    init?.signal?.addEventListener('abort', () => { counters.canceled++; publish(); }, { once: true });
    return new Promise<Response>(() => {});
  }
  return Promise.resolve(new Response(null, { status: 200 }));
};
function Fixture() {
  const navigate = useNavigate();
  const [active, setActive] = useState(true);
  return <VoluntaryExitProvider>
    <output data-testid="metrics">{JSON.stringify(counters)}</output>
    <button onClick={() => { void navigate('/recepciones/nueva'); }}>Open intake</button>
    <button onClick={() => { void navigate('/vehiculos'); }}>Programmatic exit</button>
    <button onClick={() => { setActive(false); }}>External session invalidation</button>
    {active && <AppRoutes shellStatus="context_ready" receptionRuntime={{ apiClient: client, identity: 'synthetic-session', tenantId: IDS.tenant, permissions }} grantedPermissions={new Set(permissions.map(p => p.code))}
      onSignOut={() => { counters.signedOut++; publish(); setActive(false); }} onChangeWorkshop={() => { counters.switched++; publish(); setActive(false); }}/>}
  </VoluntaryExitProvider>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Fixture root required');
window.history.replaceState(null, '', '/panel');
const router = createBrowserRouter([{ path: '*', element: <Fixture/> }]);
createRoot(root).render(<RouterProvider router={router}/>);
