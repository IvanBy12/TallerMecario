import fs from 'node:fs';
import { test } from '@playwright/test';
import { field, probeApi } from './support/api-probe';
import { signInThroughUi } from './support/clerk-login';
import { AUTH_DIR, e2eEnv, PERSONA_KEYS, STATE_FILES } from './support/env';
import { s4Check } from './support/s4-media-evidence';
import { requireS4Preflight } from './support/s4-preflight';
import { clearS4Page, s4Safe } from './support/s4-safe';

// Reuse the existing Clerk UI login, persona env/state paths and artifact policy; no S3 mutations or signature requirement.
test.describe.configure({ mode: 'serial' });
test.afterEach(async ({ page }) => { await clearS4Page(page); });
test('preflight S4: declaración sandbox y configuración completa', () => { requireS4Preflight(); });
for (const persona of PERSONA_KEYS) {
  test(`login S4 real y contexto autorizado: ${persona}`, async ({ page }) => {
    await s4Safe(page, `login/contexto S4 ${persona}`, async () => {
      const env = e2eEnv();
      const tenantId = persona === 'tenantB' ? env.tenantBId : env.tenantId;
      await signInThroughUi(page, env.credentials[persona], env.verificationCode);
      const context = await probeApi(page, env.apiOrigin, { method: 'GET', path: '/api/v1/me/context', tenantId });
      s4Check(context.status === 200 && field(context.json, 'context', 'tenantId') === tenantId, 'Contexto S4 no autorizado.');
      const me = await probeApi(page, env.apiOrigin, { method: 'GET', path: '/api/v1/me', tenantId });
      const memberships = field(me.json, 'memberships');
      s4Check(me.status === 200 && Array.isArray(memberships) && memberships.length === 1 && field(memberships[0], 'tenantId') === tenantId, 'Fixture S4 debe tener exactamente una membership en el taller esperado.');
      const permissions = field(context.json, 'context', 'permissions');
      const tenantScoped = (code: string) => Array.isArray(permissions) && permissions.some(grant => field(grant, 'code') === code &&
        Array.isArray(field(grant, 'scopes')) && (field(grant, 'scopes') as unknown[]).includes('tenant'));
      for (const code of ['media.upload', 'media.read']) s4Check(tenantScoped(code) === (persona !== 'restricted'), 'Permisos media S4 incompatibles con la persona.');
      const required = persona === 'advisor' ? ['receptions.read', 'receptions.create', 'customers.read', 'customers.create', 'vehicles.read', 'vehicles.create', 'vehicle_owners.manage'] : persona === 'tenantB' ? ['receptions.read'] : [];
      for (const code of required) s4Check(tenantScoped(code), 'Falta permiso requerido para el fixture S4.');
      if (persona === 'tenantB') {
        const target = await probeApi(page, env.apiOrigin, { method: 'GET', tenantId, path: `/api/v1/receptions/${env.tenantBReceptionId}` });
        s4Check(target.status === 200 && field(target.json, 'reception', 'status') === 'open', 'Falta recepción abierta propia B para la negativa de asociación.');
      }
      fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
      await page.context().storageState({ path: STATE_FILES[persona] });
      fs.chmodSync(STATE_FILES[persona], 0o600);
    });
  });
}
