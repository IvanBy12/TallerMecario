import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { chromium } from '@playwright/test';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { createS4Vehicle } from '../../e2e/support/s4-fixtures';
import { field } from '../../e2e/support/api-probe';
import { parseMe } from '../../src/features/auth/me-contract';
import { S4_PERMISSIONS, probeS4Me, resolveS4Context, usableS4Context } from '../../e2e/support/s4-context';
import { loadS4PublicEnv } from '../../e2e/support/s4-environment';
import { authenticateS4, s4StateCandidates } from '../../e2e/support/s4-session';
import { s4PreflightProblems } from '../../e2e/support/s4-preflight';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-s4-single-auth-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
afterEach(() => { vi.unstubAllEnvs(); });
const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const user = id(1), tenant = id(2), membership = id(3);
const meBody = { user: { id: user }, memberships: [{ tenantId: tenant, membershipId: membership }], tenantSelection: { mode: 'automatic', tenantId: tenant } };
function contextBody(overrides: Record<string, unknown> = {}) {
  return { context: { userId: user, tenantId: tenant, membershipId: membership,
    workshop: { displayName: 'Synthetic test workshop', timezone: 'America/Bogota', currency: 'COP' }, roles: ['owner'],
    permissions: S4_PERMISSIONS.map(code => ({ code, scopes: ['tenant'] })), ...overrides } };
}
function me() { const result = parseMe(meBody); if (!result) throw new Error('Synthetic me fixture invalid'); return result; }

describe('S4 single-account safety, independent of S3 configuration', () => {
  it('requires sandbox/test origins but no S3 credentials or historical IDs', () => {
    const declaration = path.join(tmp, 'sandbox.json');
    fs.writeFileSync(declaration, JSON.stringify({ environment: 'test', production: false, postgresqlFixturesValidated: true,
      frontendOrigin: 'http://localhost:5173', apiOrigin: 'https://api.example.invalid', r2Origin: 'https://test.r2.cloudflarestorage.com' }));
    const source = { VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic', VITE_API_BASE_URL: 'https://api.example.invalid',
      E2E_S4_R2_ORIGIN: 'https://test.r2.cloudflarestorage.com', E2E_S4_SANDBOX_FILE: declaration };
    expect(s4PreflightProblems(source)).toEqual([]);
    expect(s4PreflightProblems({ ...source, VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_SYNTHETIC_SECRET' }).join()).toContain('clave Clerk de prueba');
    expect(s4PreflightProblems({ ...source, VITE_APP_ENV: 'production' }).join()).toContain('producción prohibida');
    expect(s4PreflightProblems({ ...source, CI: 'true', E2E_S4_INTERACTIVE_LOGIN: '1' }).join()).toContain('no permitido en CI');
  });
  it('accepts only matching backend identity, membership and required tenant-scoped permissions', () => {
    expect(usableS4Context(me(), contextBody())?.tenantId).toBe(tenant);
    for (const override of [{ userId: id(4) }, { membershipId: id(4) }, { tenantId: id(4) }, { permissions: [] },
      { permissions: S4_PERMISSIONS.map(code => ({ code, scopes: ['assigned'] })) }]) {
      expect(usableS4Context(me(), contextBody(override))).toBeNull();
    }
    expect(usableS4Context(me(), { context: { org_role: 'owner', assigned: true } })).toBeNull();
  });
  it('reads regular private state candidates, prioritizes S4, and excludes symlinks/directories', () => {
    const states = path.join(tmp, 'states'); fs.mkdirSync(states);
    fs.writeFileSync(path.join(states, 'advisor.json'), '{}'); fs.writeFileSync(path.join(states, 's4.json'), '{}');
    fs.mkdirSync(path.join(states, 'directory.json')); fs.symlinkSync(path.join(states, 'advisor.json'), path.join(states, 'link.json'));
    expect(s4StateCandidates(states).map(file => path.basename(file))).toEqual(['s4.json', 'advisor.json']);
  });
  it('public loader whitelists variables, preserves process overrides and suppresses private values on failure', () => {
    const file = path.join(tmp, 'public.env');
    fs.writeFileSync(file, 'VITE_API_BASE_URL=https://api.example.invalid\nVITE_CLERK_PUBLISHABLE_KEY=pk_test_synthetic\nDATABASE_URL=SYNTHETIC_PRIVATE\nVITE_UNAPPROVED_SECRET=SYNTHETIC_PRIVATE\n');
    const source: NodeJS.ProcessEnv = { E2E_S4_PUBLIC_ENV_FILE: file, VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_process_override' };
    loadS4PublicEnv(source);
    expect(source['VITE_API_BASE_URL']).toBe('https://api.example.invalid');
    expect(source['VITE_CLERK_PUBLISHABLE_KEY']).toBe('pk_live_process_override');
    expect(source['DATABASE_URL']).toBeUndefined(); expect(source['VITE_UNAPPROVED_SECRET']).toBeUndefined();
    expect(() => { loadS4PublicEnv({ E2E_S4_PUBLIC_ENV_FILE: path.join(tmp, 'SYNTHETIC_PRIVATE') }); }).toThrow('E2E_S4_PUBLIC_ENV_FILE no legible');
  });
});

describe('S4 live-session validator in a credential-free local Chromium harness', () => {
  it('rejects expired/null-token sessions without API calls; handles multiple memberships and revocation', async () => {
    let calls = 0;
    let activeMe: unknown = meBody;
    const contextHeaders: string[] = [];
    const api = http.createServer((request, response) => {
      if (!request.url?.startsWith('/api/v1/')) { response.end('<html><body>Synthetic test</body></html>'); return; }
      calls++; response.setHeader('content-type', 'application/json'); response.setHeader('access-control-allow-origin', '*');
      response.setHeader('access-control-allow-headers', 'authorization,x-tenant-id');
      if (request.method === 'OPTIONS') { response.end(); return; }
      if (request.url === '/api/v1/me') response.end(JSON.stringify(activeMe));
      else {
        const header = String(request.headers['x-tenant-id']); contextHeaders.push(header);
        if (header === tenant) response.end(JSON.stringify(contextBody()));
        else { response.statusCode = 403; response.end(JSON.stringify({ error: { code: 'TENANT_ACCESS_DENIED' } })); }
      }
    });
    await new Promise<void>(resolve => { api.listen(0, '127.0.0.1', resolve); });
    const address = api.address(); if (!address || typeof address === 'string') throw new Error('Local fixture unavailable');
    vi.stubEnv('VITE_API_BASE_URL', `http://127.0.0.1:${String(address.port)}`);
    vi.stubEnv('E2E_S4_R2_ORIGIN', 'https://test.r2.cloudflarestorage.com');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${String(address.port)}/`);
      await page.evaluate(() => { Reflect.set(window, 'Clerk', { session: { status: 'expired', getToken: () => 'SYNTHETIC_TOKEN' } }); });
      expect((await probeS4Me(page)).status).toBe(401); expect(calls).toBe(0);
      await page.evaluate(() => { Reflect.set(window, 'Clerk', { session: { status: 'active', getToken: () => null } }); });
      expect((await probeS4Me(page)).status).toBe(401); expect(calls).toBe(0);
      await page.evaluate(() => { Reflect.set(window, 'Clerk', { session: { status: 'active', getToken: () => 'SYNTHETIC_TOKEN' } }); });
      activeMe = { ...meBody, memberships: [{ tenantId: id(0), membershipId: id(5) }, ...meBody.memberships], tenantSelection: { mode: 'required', tenantId: null } };
      expect((await resolveS4Context(page)).tenantId).toBe(tenant);
      expect(contextHeaders).toEqual([id(0), tenant]);
      activeMe = { user: null, memberships: [], tenantSelection: { mode: 'unavailable', tenantId: null } };
      await expect(resolveS4Context(page)).rejects.toThrow('memberships activas no verificadas');
      expect(contextHeaders).toEqual([id(0), tenant]);
    } finally { await browser.close(); await new Promise<void>(resolve => { api.close(() => { resolve(); }); }); }
  });
  it('actual saved-state search discards expired state and preserves S3 state after live validation', async () => {
    const directory = path.join(tmp, 'saved-state-flow'); fs.mkdirSync(directory);
    let unavailableApi = false;
    const api = http.createServer((request, response) => {
      if (request.url === '/api/v1/me' && unavailableApi) { response.statusCode = 503; response.end('{}'); return; }
      if (request.url === '/api/v1/me') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(meBody)); }
      else if (request.url === '/api/v1/me/context') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(contextBody())); }
      else { response.setHeader('content-type', 'text/html'); response.end(`<html><body><script>window.Clerk={loaded:true,session:{status:document.cookie.includes('valid')?'active':'expired',getToken:async()=> 'SYNTHETIC_TOKEN'}};</script></body></html>`); }
    });
    await new Promise<void>(resolve => { api.listen(0, '127.0.0.1', resolve); });
    const address = api.address(); if (!address || typeof address === 'string') throw new Error('Local fixture unavailable');
    const origin = `http://127.0.0.1:${String(address.port)}`;
    vi.stubEnv('VITE_API_BASE_URL', origin); vi.stubEnv('E2E_S4_R2_ORIGIN', 'https://test.r2.cloudflarestorage.com');
    vi.stubEnv('E2E_S4_INTERACTIVE_LOGIN', '0');
    const state = (value: string) => JSON.stringify({ cookies: [{ name: 'synthetic_state', value, domain: '127.0.0.1', path: '/',
      expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }], origins: [] });
    fs.writeFileSync(path.join(directory, 's4.json'), state('expired'));
    const browser = await chromium.launch({ headless: true });
    try {
      await expect(authenticateS4(browser, origin, directory)).rejects.toThrow('ninguna sesión autorizada válida');
      expect(fs.readFileSync(path.join(directory, 's4.json'), 'utf8')).toBe(state('expired'));
      fs.writeFileSync(path.join(directory, 'advisor.json'), state('valid'));
      await authenticateS4(browser, origin, directory);
      expect(fs.readFileSync(path.join(directory, 'advisor.json'), 'utf8')).toBe(state('valid'));
      const persisted: unknown = JSON.parse(fs.readFileSync(path.join(directory, 's4.json'), 'utf8'));
      expect(field(persisted, 'cookies', '0', 'value')).toBe('valid');
      expect(fs.statSync(path.join(directory, 's4.json')).mode & 0o777).toBe(0o600);
      expect(fs.statSync(directory).mode & 0o777).toBe(0o700);
      const saved = fs.readFileSync(path.join(directory, 's4.json'), 'utf8');
      unavailableApi = true;
      await expect(authenticateS4(browser, origin, directory)).rejects.toThrow('API bootstrap no disponible');
      expect(fs.readFileSync(path.join(directory, 's4.json'), 'utf8')).toBe(saved);
    } finally { await browser.close(); await new Promise<void>(resolve => { api.close(() => { resolve(); }); }); }
  });

  it('CRM provisioning uses returned IDs and stops before vehicle creation on an invalid customer response', async () => {
    let malformed = false;
    const vehicleBodies: unknown[] = [];
    const api = http.createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/api/v1/customers') { response.statusCode = 201; response.end(JSON.stringify({ customer: malformed ? {} : { customerId: id(6) } })); }
      else if (request.url === '/api/v1/vehicles') {
        let body = '';
        request.on('data', (chunk: unknown) => { body += String(chunk); });
        request.on('end', () => {
          vehicleBodies.push(JSON.parse(body) as unknown);
          response.statusCode = 201; response.end(JSON.stringify({ vehicle: { vehicleId: id(7) }, ownership: { vehicleId: id(7), customerId: id(6) } }));
        });
      } else { response.setHeader('content-type', 'text/html'); response.end('<html><body>Synthetic CRM harness</body></html>'); }
    });
    await new Promise<void>(resolve => { api.listen(0, '127.0.0.1', resolve); });
    const address = api.address(); if (!address || typeof address === 'string') throw new Error('Local fixture unavailable');
    const origin = `http://127.0.0.1:${String(address.port)}`;
    vi.stubEnv('VITE_API_BASE_URL', origin); vi.stubEnv('E2E_S4_R2_ORIGIN', 'https://test.r2.cloudflarestorage.com');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage(); await page.goto(origin);
      await page.evaluate(() => { Reflect.set(window, 'Clerk', { session: { status: 'active', getToken: () => 'SYNTHETIC_TOKEN' } }); });
      const fixture = await createS4Vehicle(page, tenant);
      expect(fixture.customerId).toBe(id(6)); expect(fixture.vehicleId).toBe(id(7));
      expect(field(vehicleBodies[0], 'customerId')).toBe(id(6));
      malformed = true;
      await expect(createS4Vehicle(page, tenant)).rejects.toThrow('API no confirmó cliente sintético nuevo');
      expect(vehicleBodies).toHaveLength(1);
    } finally { await browser.close(); await new Promise<void>(resolve => { api.close(() => { resolve(); }); }); }
  });

});
