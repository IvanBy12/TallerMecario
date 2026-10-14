import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { openS4App, resolveS4Context, S4_PERMISSIONS, S4SessionUnavailable } from '../../e2e/support/s4-context';
import { S4CheckFailure, S4MediaEvidence } from '../../e2e/support/s4-media-evidence';
import { classifyS4Failure, s4Safe } from '../../e2e/support/s4-safe';
import { requireS4ApiReady } from '../../e2e/support/s4-readiness';
import { API, R2, FRONTEND, reception, files, create, finish, operation, exchange } from '../helpers/s4-upload-fixture';
import { requireS4Preflight } from '../../e2e/support/s4-preflight';

const marker = 'SYNTHETIC_TOKEN_OR_HOSTILE_BODY_NOT_FOR_REPORTS';
const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const user = id(1), tenant = id(2), membership = id(3);
const me = { user: { id: user }, memberships: [{ tenantId: tenant, membershipId: membership }], tenantSelection: { mode: 'automatic', tenantId: tenant } };
const absentMe = { user: null, memberships: [], tenantSelection: { mode: 'unavailable', tenantId: null } };
function context(overrides: Record<string, unknown> = {}) {
  return { context: { userId: user, tenantId: tenant, membershipId: membership,
    workshop: { displayName: 'Synthetic workshop', timezone: 'America/Bogota', currency: 'COP' }, roles: ['owner'],
    permissions: S4_PERMISSIONS.map(code => ({ code, scopes: ['tenant'] })), ...overrides } };
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-s4-residual-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
afterEach(() => { vi.unstubAllEnvs(); });
async function listen(server: http.Server) {
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const addr = server.address(); if (!addr || typeof addr === 'string') throw new Error('Synthetic server unavailable');
  return `http://127.0.0.1:${String(addr.port)}`;
}
const failures = ['me503', 'meInvalid', 'context503', 'contextInvalid', 'contextIdentity', 'contextMembership', 'contextTenant', 'uiUnconfirmed', 'uiInvalid', 'uiAmbiguous',
  'revokedSession', 'revokedMembership', 'revokedPermission', 'revokedContext401', 'revokedContext403', 'unprovenNetwork'] as const;
describe('N-1: live synthetic HTTP/bootstrap and public sanitized runner classification', () => {
  it.each(failures)('%s is FAIL internally and publicly, never PASS/BLOCKED', async mode => {
    let origin = '', contextCalls = 0, revoked = false;
    const server = http.createServer((req, res) => {
      if (req.url === '/src/main.tsx') {
        res.end(`import.meta.env = ${JSON.stringify({ PROD: false, VITE_APP_ENV: 'local', VITE_API_BASE_URL: origin, VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic' })};`);
      } else if (req.url === '/api/v1/me') {
        if (mode === 'unprovenNetwork' && revoked) { req.socket.destroy(); return; }
        res.statusCode = mode === 'me503' ? 503 : mode === 'revokedSession' && revoked ? 401 : 200;
        res.setHeader('content-type', 'application/json');
        res.end(mode === 'meInvalid' ? marker : JSON.stringify(mode === 'revokedMembership' && revoked ? absentMe : me));
      } else if (req.url === '/api/v1/me/context') {
        contextCalls++;
        res.statusCode = mode === 'context503' ? 503 : mode === 'revokedContext401' && revoked ? 401 : mode === 'revokedContext403' && revoked ? 403 : 200;
        res.setHeader('content-type', 'application/json');
        res.end(mode === 'contextInvalid' || mode === 'uiInvalid' && contextCalls > 1 ? marker : JSON.stringify(context(
          mode === 'contextIdentity' || mode === 'uiUnconfirmed' && contextCalls > 1 ? { userId: id(9) } :
            mode === 'contextMembership' ? { membershipId: id(9) } : mode === 'contextTenant' ? { tenantId: id(9) } :
            mode === 'revokedPermission' && revoked ? { permissions: [] } : {})));
      } else {
        const selection = mode.startsWith('ui');
        res.setHeader('content-type', 'text/html');
        res.end(`<html><body>${selection ? `<h1>Selecciona un taller</h1><button>Synthetic workshop</button>${mode === 'uiAmbiguous' ? '<button>Synthetic workshop</button>' : ''}` : '<main id="contenido-principal"></main>'}
          <script>window.Clerk={loaded:true,session:{status:'active',getToken:async()=> '${marker}'}};
          document.querySelector('button')?.addEventListener('click', async()=> {
            await fetch('/api/v1/me/context',{headers:{Authorization:'Bearer ${marker}','X-Tenant-Id':'${tenant}'}});
          });</script></body></html>`);
      }
    });
    origin = await listen(server);
    vi.stubEnv('VITE_API_BASE_URL', origin); vi.stubEnv('E2E_BASE_URL', origin); vi.stubEnv('VITE_APP_ENV', 'local');
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_synthetic'); vi.stubEnv('E2E_S4_R2_ORIGIN', 'https://synthetic.r2.cloudflarestorage.com');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ baseURL: origin }); await page.goto('/panel');
      if (mode.startsWith('revoked') || mode === 'unprovenNetwork') {
        expect((await resolveS4Context(page)).tenantId).toBe(tenant); revoked = true;
      }
      let internal: unknown;
      const result: unknown = await s4Safe(page, 'bootstrap residual', async () => {
        try { if (mode.startsWith('ui')) await openS4App(page); else await resolveS4Context(page, 'scenario'); }
        catch (error) { internal = error; throw error; }
      }).catch((error: unknown) => error);
      expect(internal).toBeInstanceOf(S4CheckFailure);
      expect(internal).not.toBeInstanceOf(S4SessionUnavailable);
      expect(internal instanceof S4CheckFailure && internal.classification).toBe('FAIL');
      expect(classifyS4Failure(internal)).toBe('FAIL');
      expect(result instanceof Error && Reflect.get(result, 'classification')).toBe('FAIL');
      expect(result instanceof Error && result.message).toContain('S4 REAL E2E: FAIL');
      expect(result instanceof Error && result.message).not.toContain(marker);
      expect(page.url()).toBe('about:blank');
    } finally { await browser.close(); await new Promise<void>(resolve => { server.close(() => { resolve(); }); }); }
  });
  it('missing precondition is BLOCKED, but losing it after successful start is FAIL', async () => {
    let empty = false;
    const server = http.createServer((req, res) => {
      if (req.url === '/api/v1/me') res.end(JSON.stringify(empty ? absentMe : me));
      else if (req.url === '/api/v1/me/context') res.end(JSON.stringify(context()));
      else res.end(`<html><script>window.Clerk={session:{status:'active',getToken:async()=> '${marker}'}};</script></html>`);
    });
    const origin = await listen(server); vi.stubEnv('VITE_API_BASE_URL', origin);
    vi.stubEnv('E2E_S4_R2_ORIGIN', 'https://synthetic.r2.cloudflarestorage.com');
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage(); await page.goto(origin);
      await expect(resolveS4Context(page)).resolves.toMatchObject({ tenantId: tenant });
      empty = true;
      let internal: unknown;
      const result: unknown = await s4Safe(page, 'precondition', async () => {
        try { await resolveS4Context(page); } catch (error) { internal = error; throw error; }
      }).catch((error: unknown) => error);
      expect(internal).toBeInstanceOf(S4SessionUnavailable); expect(classifyS4Failure(internal)).toBe('BLOCKED');
      expect(result instanceof Error && result.message).toContain('S4 REAL E2E: BLOCKED');
      expect(result instanceof Error && result.message).toContain('memberships activas');
      await page.goto(origin);
      await expect(s4Safe(page, 'scenario', async () => { await resolveS4Context(page, 'scenario'); })).rejects.toThrow('S4 REAL E2E: FAIL');
    } finally { await browser.close(); await new Promise<void>(resolve => { server.close(() => { resolve(); }); }); }
  });
  it('known health connectivity stays BLOCKED and explicit types override misleading messages', async () => {
    const server = http.createServer(); const origin = await listen(server);
    await new Promise<void>(resolve => { server.close(() => { resolve(); }); });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage(); let internal: unknown;
      const result: unknown = await s4Safe(page, 'health', async () => {
        try { await requireS4ApiReady(page.request, origin); } catch (error) { internal = error; throw error; }
      }).catch((error: unknown) => error);
      expect(classifyS4Failure(internal)).toBe('BLOCKED');
      expect(result instanceof Error && result.message).toContain('S4 REAL E2E: BLOCKED');
      expect(classifyS4Failure(new S4CheckFailure('S4 BLOCKED: ambiguous old text', 'FAIL'))).toBe('FAIL');
      expect(classifyS4Failure(new S4SessionUnavailable('Missing test fixture'))).toBe('BLOCKED');
      expect(classifyS4Failure(new Error(`ECONNREFUSED ${marker}`))).toBe('FAIL');
    } finally { await browser.close(); }
  });
  it('actual Playwright reports negative bootstrap/health/precondition runs with no PASS or private error payload', () => {
    const require = createRequire(import.meta.url);
    const directory = path.join(tmp, 'public-runner'); fs.mkdirSync(directory);
    const config = path.join(directory, 'playwright.config.cjs');
    fs.writeFileSync(config, `module.exports={testDir:__dirname,workers:1,retries:0,reporter:[['json']],outputDir:${JSON.stringify(path.join(directory, 'results'))},use:{trace:'off',screenshot:'off',video:'off'}};`);
    fs.writeFileSync(path.join(directory, 'public.spec.ts'), `
      import {test} from ${JSON.stringify(require.resolve('@playwright/test'))};
      import http from 'node:http';
      import {resolveS4Context} from ${JSON.stringify(path.resolve('e2e/support/s4-context.ts'))};
      import {requireS4ApiReady} from ${JSON.stringify(path.resolve('e2e/support/s4-readiness.ts'))};
      import {s4Safe} from ${JSON.stringify(path.resolve('e2e/support/s4-safe.ts'))};
      for(const mode of ['bootstrap-http','health-unreachable','missing-membership']) {
        test(mode, async({page})=>{
          const server=http.createServer((req,res)=>{
            if(req.url==='/api/v1/me'){res.statusCode=mode==='bootstrap-http'?503:200;res.end(JSON.stringify(${JSON.stringify(absentMe)}));}
            else res.end('<html><script>window.Clerk={session:{status:"active",getToken:async()=> "${marker}"}};</script></html>');
          });
          await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
          const origin='http://127.0.0.1:'+server.address().port;
          process.env.VITE_API_BASE_URL=origin;process.env.E2E_S4_R2_ORIGIN='https://synthetic.r2.cloudflarestorage.com';
          try {
            if(mode==='health-unreachable') await new Promise(resolve=>server.close(resolve));
            else await page.goto(origin);
            await s4Safe(page,mode,async()=>{
              if(mode==='health-unreachable') await requireS4ApiReady(page.request,origin);
              else await resolveS4Context(page);
            });
          } finally {if(server.listening) await new Promise(resolve=>server.close(resolve));}
        });
      }
    `);
    const run = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', config], {
      cwd: directory, env: { PATH: process.env['PATH'], HOME: process.env['HOME'] }, encoding: 'utf8', timeout: 30_000,
    });
    expect(run.status).toBe(1);
    const report = JSON.parse(run.stdout) as { stats: { expected: number; unexpected: number }; suites: { specs: { title: string; tests: { results: { status: string; error: { message: string } }[] }[] }[] }[] };
    expect(report.stats).toMatchObject({ expected: 0, unexpected: 3 });
    const specs = report.suites.flatMap(suite => suite.specs);
    expect(specs.map(spec => spec.title)).toEqual(['bootstrap-http', 'health-unreachable', 'missing-membership']);
    for (const spec of specs) {
      const result = spec.tests[0]?.results[0];
      expect(result?.status).toBe('failed');
      expect(result?.error.message).toContain(spec.title === 'bootstrap-http' ? 'S4 REAL E2E: FAIL' : 'S4 REAL E2E: BLOCKED');
    }
    expect(run.stdout + run.stderr).not.toContain(marker);
  });
  it.each([{}, { VITE_API_BASE_URL: 'https://api.example.invalid', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic', E2E_S4_R2_ORIGIN: 'https://synthetic.r2.cloudflarestorage.com' }])('missing config/sandbox aborts actual Playwright before tests %j', source => {
    expect(() => { requireS4Preflight(source); }).toThrow('S4 REAL E2E: BLOCKED');
    const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
    const run = spawnSync(process.execPath, [cli, 'test', '--config', path.resolve('playwright.s4.config.ts'), '--project=s4-media-chromium'], {
      cwd: tmp, env: { PATH: process.env['PATH'], HOME: process.env['HOME'], ...source }, encoding: 'utf8', timeout: 30_000,
    });
    expect(run.status).toBe(1); expect(run.stdout + run.stderr).toContain('S4 REAL E2E: BLOCKED');
    expect(run.stdout + run.stderr).not.toMatch(/Running \d+ tests/);
    expect(run.stdout + run.stderr).not.toContain(marker);
  });
});

describe('N-2: complete operation counts, new IDs/capabilities cannot hide extra uploads (synthetic)', () => {
  it('exactly 2 creates/PUTs and one complete/attach per expected chain pass; serialized evidence stays sanitized', () => {
    const { evidence } = operation(); expect(() => { evidence.assertUploadOperation(files); }).not.toThrow();
    const report = JSON.stringify(evidence);
    for (const forbidden of [marker, R2, reception, 'X-Amz-', 'object/20']) expect(report).not.toContain(forbidden);
  });
  it.each(['thirdSession', 'thirdPutNewCapability', 'sessionWithoutPut', 'duplicatePut', 'missingPut', 'duplicateComplete', 'duplicateAttach'] as const)('%s fails even if no extra response is available', mode => {
    const { evidence, photo } = operation(mode === 'missingPut');
    if (mode === 'thirdSession') { const extra = create(evidence, 22, 'photo'); finish(evidence, extra, 'photo'); }
    if (mode === 'thirdPutNewCapability') evidence.noteRequest('PUT', `${R2}/unexpected?X-Amz-Signature=${marker}-different`);
    if (mode === 'sessionWithoutPut') create(evidence, 23, 'photo');
    if (mode === 'duplicatePut') evidence.noteRequest('PUT', photo.url);
    if (mode === 'duplicateComplete') evidence.noteRequest('POST', `${API}/api/v1/media/upload-sessions/${photo.session}/complete`);
    if (mode === 'duplicateAttach') evidence.noteRequest('POST', `${API}/api/v1/receptions/${reception}/media`, { mediaAssetId: photo.asset });
    expect(() => { evidence.assertUploadOperation(files); }).toThrow();
  });
  it('third create request without a response still fails globally', () => {
    const { evidence } = operation();
    evidence.noteRequest('POST', `${API}/api/v1/media/upload-sessions`, { operationalContext: { type: 'reception', receptionId: reception } });
    expect(() => { evidence.assertUploadOperation(files); }).toThrow('exactamente 2 POST');
  });
  it('checkpoint excludes earlier requests and their late responses; OPTIONS do not count', () => {
    const evidence = new S4MediaEvidence(API, R2, FRONTEND);
    const old = create(evidence, 30, 'photo'); finish(evidence, old, 'photo');
    const foreign = create(evidence, 31, 'photo', id(11)); finish(evidence, foreign, 'photo', id(11));
    const lateSeq = evidence.noteRequest('PUT', old.url);
    evidence.beginUploadOperation(reception);
    evidence.observe(exchange('PUT', old.url, null, null, 200, lateSeq));
    const photo = create(evidence, 20, 'photo'); finish(evidence, photo, 'photo');
    const video = create(evidence, 21, 'video360'); finish(evidence, video, 'video360');
    evidence.noteRequest('OPTIONS', photo.url); evidence.noteRequest('PUT', 'https://unrelated.example.invalid/object');
    expect(() => { evidence.assertUploadOperation(files); }).not.toThrow();
  });
  it('collector must delimit the operation before asserting it', () => {
    expect(() => { new S4MediaEvidence(API, R2, FRONTEND).assertUploadOperation(files); }).toThrow('Falta operación');
  });
});
