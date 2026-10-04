import fs from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { field, probeApi } from './support/api-probe';
import { signInThroughUi } from './support/clerk-login';
import { AUTH_DIR, e2eEnv, invalidVariables, missingVariables, STATE_FILES, type PersonaKey } from './support/env';

/**
 * Proyecto `setup`: valida el ambiente (solo nombres de variable) e inicia sesión REAL con Clerk por la UI para cada
 * persona. El estado de sesión queda en e2e/.auth/ (ignorado por git; contiene cookies de sesión: no se sube ni se comparte).
 */

const ADVISOR_PERMISSIONS = [
  'receptions.read', 'receptions.create', 'receptions.update_open', 'receptions.close',
  'signatures.capture', 'media.upload', 'customers.read', 'customers.create',
  'vehicles.read', 'vehicles.create', 'vehicle_owners.manage',
] as const;
const RESTRICTED_FORBIDDEN = ['receptions.update_open', 'receptions.close', 'signatures.capture'] as const;

function tenantScoped(permissions: unknown, code: string): boolean {
  return Array.isArray(permissions) && permissions.some((grant: unknown) => field(grant, 'code') === code && Array.isArray(field(grant, 'scopes')) && (field(grant, 'scopes') as unknown[]).includes('tenant'));
}

async function contextOf(page: Page, tenantId: string) {
  const { apiOrigin } = e2eEnv();
  const response = await probeApi(page, apiOrigin, { method: 'GET', path: '/api/v1/me/context', tenantId });
  expect(response.status, 'GET /api/v1/me/context').toBe(200);
  expect(field(response.json, 'context', 'tenantId')).toBe(tenantId);
  return field(response.json, 'context', 'permissions');
}

async function membershipTenantIds(page: Page, tenantId: string): Promise<readonly string[]> {
  const { apiOrigin } = e2eEnv();
  const response = await probeApi(page, apiOrigin, { method: 'GET', path: '/api/v1/me', tenantId });
  const memberships = field(response.json, 'memberships');
  expect(response.status, 'GET /api/v1/me').toBe(200);
  return Array.isArray(memberships) ? memberships.map((item: unknown) => String(field(item, 'tenantId'))) : [];
}

async function login(page: Page, persona: PersonaKey): Promise<void> {
  const env = e2eEnv();
  await signInThroughUi(page, env.credentials[persona], env.verificationCode);
}

async function persist(page: Page, persona: PersonaKey): Promise<void> {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: STATE_FILES[persona] });
}

// Si el preflight falla, los inicios de sesión no se ejecutan (y, por dependencia, tampoco los proyectos de prueba).
test.describe.configure({ mode: 'serial' });

test('preflight: ambiente de prueba completo', () => {
  const missing = missingVariables();
  const invalid = invalidVariables();
  expect(
    missing,
    'Variables E2E obligatorias ausentes (solo nombres; ver .env.e2e.example). Sin ellas el gate no puede ejecutarse y NO se considera aprobado.',
  ).toEqual([]);
  expect(invalid, 'Variables E2E inválidas').toEqual([]);
});

test('login real: asesor del taller A', async ({ page }) => {
  const env = e2eEnv();
  await login(page, 'advisor');
  const permissions = await contextOf(page, env.tenantId);
  for (const code of ADVISOR_PERMISSIONS) {
    expect(tenantScoped(permissions, code), `el asesor del taller A necesita ${code} con scope tenant`).toBe(true);
  }
  const tenants = await membershipTenantIds(page, env.tenantId);
  expect(tenants, 'el asesor A debe tener exactamente una membership (taller A)').toEqual([env.tenantId]);
  await persist(page, 'advisor');
});

test('login real: técnico (permisos reducidos) del taller A', async ({ page }) => {
  const env = e2eEnv();
  await login(page, 'restricted');
  const permissions = await contextOf(page, env.tenantId);
  for (const code of RESTRICTED_FORBIDDEN) {
    expect(tenantScoped(permissions, code), `el usuario restringido NO debe tener ${code} con scope tenant`).toBe(false);
  }
  const tenants = await membershipTenantIds(page, env.tenantId);
  expect(tenants, 'el usuario restringido debe tener exactamente una membership (taller A)').toEqual([env.tenantId]);
  await persist(page, 'restricted');
});

test('login real: usuario del taller B', async ({ page }) => {
  const env = e2eEnv();
  await login(page, 'tenantB');
  await contextOf(page, env.tenantBId);
  const tenants = await membershipTenantIds(page, env.tenantBId);
  expect(tenants, 'el usuario B debe tener exactamente una membership (taller B)').toEqual([env.tenantBId]);
  await persist(page, 'tenantB');
});
