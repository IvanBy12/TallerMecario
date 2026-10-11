import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createApiClient } from '../../../src/shared/api/http-client';
import { ReceptionProvider } from '../../../src/features/reception/reception-context';
import { ReceptionDetailPage } from '../../../src/features/reception/reception-detail-page';
import '../../../src/app/app.css';

// Harness only: browser fetches intercepted services. This never authenticates with Clerk/API/R2.
const client = createApiClient({ apiOrigin: 'https://api.gallery.example.test',
  getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic-gallery-token' }) });
function Fixture() {
  const [identity, setIdentity] = useState('synthetic-gallery-identity');
  return <><button type="button" onClick={() => { setIdentity('another-synthetic-identity'); }}>Cambiar identidad de prueba</button>
    <MemoryRouter initialEntries={['/recepciones/22222222-2222-4222-8222-222222222222']}>
      <ReceptionProvider runtime={{ apiClient: client, identity, tenantId: '11111111-1111-4111-8111-111111111111',
        permissions: [{ code: 'receptions.read', scopes: ['tenant'] }, { code: 'media.read', scopes: ['tenant'] }] }}>
        <Routes><Route path="/recepciones/:receptionId" element={<ReceptionDetailPage/>}/></Routes>
      </ReceptionProvider>
    </MemoryRouter></>;
}
const root = document.getElementById('root');
if (root === null) throw new Error('Synthetic root missing');
createRoot(root).render(<Fixture/>);
