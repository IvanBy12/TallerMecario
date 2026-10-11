import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import http from 'node:http';
import { chromium } from '@playwright/test';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { recordS4Media, S4MediaEvidence, type S4Exchange } from '../../e2e/support/s4-media-evidence';
import { requireS4Preflight, s4PreflightProblems } from '../../e2e/support/s4-preflight';
import { verifyExpiredDownload } from '../../e2e/support/s4-download-expiry';
import { s4Safe } from '../../e2e/support/s4-safe';
import { S4_FIXTURE_DIR } from '../../e2e/support/s4-preflight';
import { syntheticEnv } from '../helpers/synthetic-env';

const API = 'https://api.example.invalid';
const R2 = 'https://sandbox.r2.cloudflarestorage.com';
const FRONTEND = 'http://localhost:5173';
const reception = '11111111-1111-4111-8111-111111111111';
const asset = '22222222-2222-4222-8222-222222222222';
const session = '33333333-3333-4333-8333-333333333333';
const other = '44444444-4444-4444-8444-444444444444';
const secret = 'S4_SYNTHETIC_SIGNED_CAPABILITY_NEVER_PERSIST';
const upload = `${R2}/private/object?X-Amz-Signature=${secret}`;
const download = `${R2}/private/object?X-Amz-Signature=${secret}-download`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-s4-preflight-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
function sandbox(overrides: Readonly<Record<string, unknown>> = {}) {
  const file = path.join(tmp, 'sandbox.json');
  fs.writeFileSync(file, JSON.stringify({ environment: 'test', production: false, postgresqlFixturesValidated: true,
    frontendOrigin: FRONTEND, apiOrigin: API, r2Origin: R2, ...overrides }));
  return { ...syntheticEnv(), VITE_API_BASE_URL: API, E2E_S4_R2_ORIGIN: R2, E2E_S4_SANDBOX_FILE: file };
}
describe('S4 preflight: BLOCKED is never PASS', () => {
  it.each([{ flags: [] }, { flags: ['--no-deps'] }])('actual Playwright config fails before browser/login even with bypass flags %j', ({ flags }) => {
    const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
    const config = path.resolve('playwright.s4.config.ts');
    const child = spawnSync(process.execPath, [cli, 'test', '--config', config, '--project=s4-media-chromium', ...flags], {
      cwd: tmp, env: { PATH: process.env['PATH'], HOME: process.env['HOME'], VITE_CLERK_PUBLISHABLE_KEY: `pk_live_${secret}` },
      encoding: 'utf8', timeout: 30_000,
    });
    expect(child.status).toBe(1);
    expect(child.stdout + child.stderr).toContain('S4 REAL E2E: BLOCKED');
    expect((child.stdout + child.stderr).includes(secret)).toBe(false);
    expect(child.stdout + child.stderr).not.toMatch(/Running \d+ tests/);
  });
  it('empty configuration fails safely before login/mutations', () => {
    expect(() => { requireS4Preflight({}); }).toThrow('S4 REAL E2E: BLOCKED');
    expect(s4PreflightProblems({})).toContain('E2E_S4_R2_ORIGIN: ausente');
  });
  it('complete sandbox declaration is only a static PASS, not proof of remote services', () => {
    expect(s4PreflightProblems(sandbox())).toEqual([]);
  });
  it.each([{ production: true }, { environment: 'production' }, { postgresqlFixturesValidated: false }, { r2Origin: 'https://other.example.invalid' }])('rejects unsafe/mismatched declaration %j', override => {
    expect(() => { requireS4Preflight(sandbox(override)); }).toThrow('BLOCKED');
  });
  it('does not echo malicious URLs, credentials or invalid JSON', () => {
    const source = { ...sandbox(), E2E_S4_R2_ORIGIN: `https://user:${secret}@sandbox.r2.cloudflarestorage.com/?token=${secret}` };
    expect(s4PreflightProblems(source).join()).not.toContain(secret);
    expect(s4PreflightProblems(source).join()).toContain('origen seguro');
    fs.writeFileSync(source.E2E_S4_SANDBOX_FILE, secret);
    expect(s4PreflightProblems(source).join()).not.toContain(secret);
  });
});
function exchange(method: string, url: string, responseBody: unknown, overrides: Partial<S4Exchange> = {}): S4Exchange {
  return { method, url, status: method === 'POST' ? 201 : 200, requestBody: null, responseBody,
    requestHeaders: {}, responseHeaders: { 'cache-control': 'no-store', 'access-control-allow-origin': FRONTEND }, ...overrides };
}
type ChainOverrides = { create?: Partial<S4Exchange>; put?: Partial<S4Exchange>; complete?: Partial<S4Exchange>; attach?: Partial<S4Exchange>; options?: Partial<S4Exchange> };
function chain(overrides: ChainOverrides = {}) {
  const evidence = new S4MediaEvidence(API, R2, FRONTEND);
  evidence.observe(exchange('POST', `${API}/api/v1/media/upload-sessions`, { uploadSessionId: session, mediaAssetId: asset,
    status: 'pending', uploadMethod: 'PUT', uploadUrl: upload, objectKey: 'private/object', expiresAt: '2099-10-11T12:00:00Z',
    uploadHeaders: { 'Content-Type': 'image/png', 'If-None-Match': '*' } }, { requestBody: { mediaType: 'photo', expectedSizeBytes: 20,
      retentionClass: 'operational', operationalContext: { type: 'reception', receptionId: reception } }, ...overrides.create }));
  evidence.observe(exchange('OPTIONS', upload, null, { status: 204, requestHeaders: { 'access-control-request-method': 'PUT',
    'access-control-request-headers': 'content-type,if-none-match' }, responseHeaders: { 'access-control-allow-origin': FRONTEND,
    'access-control-allow-methods': 'PUT,GET', 'access-control-allow-headers': 'content-type,if-none-match' }, ...overrides.options }));
  evidence.observe(exchange('PUT', upload, null, { requestHeaders: { 'content-type': 'image/png', 'if-none-match': '*' }, ...overrides.put }));
  evidence.observe(exchange('POST', `${API}/api/v1/media/upload-sessions/${session}/complete`, { mediaAssetId: asset, status: 'active', sizeBytes: 20, checksumSha256: null }, { status: 200, ...overrides.complete }));
  evidence.observe(exchange('POST', `${API}/api/v1/receptions/${reception}/media`, { media: { mediaAssetId: asset, mediaType: 'photo', purpose: 'intake_evidence' } }, { requestBody: { mediaAssetId: asset }, ...overrides.attach }));
  return evidence;
}
function read(evidence: S4MediaEvidence, overrides: Partial<S4Exchange> = {}) {
  evidence.observe(exchange('GET', `${API}/api/v1/receptions/${reception}/media`, { media: [{ mediaAssetId: asset }] }));
  evidence.observe(exchange('GET', `${API}/api/v1/media/${asset}/download-url`, { mediaAssetId: asset, downloadUrl: download, expiresAt: new Date(Date.now() + 290_000).toISOString() }));
  evidence.observe(exchange('GET', download, null, { status: 206, requestHeaders: { range: 'bytes=0-' }, ...overrides }));
}
describe('S4 correlated HTTP evidence (synthetic, no real integration claim)', () => {
  it('accepts only the same contextual upload → exact signed PUT → active → attach → list → GET/Range', () => {
    const evidence = chain();
    expect(evidence.uploadChain(reception, 'photo', 20)).toBe(asset);
    read(evidence);
    expect(() => { evidence.readChain(reception, asset, true); }).not.toThrow();
  });
  it.each<ChainOverrides>([
    { put: { url: `${R2}/different?secret=${secret}` } },
    { put: { requestHeaders: { 'content-type': 'image/png', 'if-none-match': '*', authorization: secret } } },
    { put: { requestHeaders: { 'content-type': 'image/png', 'if-none-match': '*', cookie: secret } } },
    { put: { requestHeaders: { 'content-type': 'image/png', 'if-none-match': '*', 'x-tenant-id': other } } },
    { put: { status: 403 } },
    { put: { requestHeaders: { 'content-type': 'text/plain', 'if-none-match': '*' } } },
    { complete: { responseBody: { mediaAssetId: other, status: 'active', sizeBytes: 20, checksumSha256: null } } },
    { complete: { responseBody: { mediaAssetId: asset, status: 'pending', sizeBytes: 20, checksumSha256: null } } },
    { attach: { requestBody: { mediaAssetId: other } } },
    { attach: { url: `${API}/api/v1/receptions/${other}/media` } },
    { options: { status: 403 } },
    { options: { responseHeaders: { 'access-control-allow-origin': 'https://foreign.example.invalid' } } },
  ])('rejects wrong identity, credentials, headers, CORS or unsuccessful link %#', override => {
    expect(() => chain(override).uploadChain(reception, 'photo', 20)).toThrow();
  });
  it('a stale successful list cannot substitute for the latest persisted list', () => {
    const evidence = chain(); read(evidence);
    evidence.observe(exchange('GET', `${API}/api/v1/receptions/${reception}/media`, { media: [] }));
    expect(evidence.listReads(reception)).toBe(2);
    expect(() => { evidence.readChain(reception, asset, false); }).toThrow('Falta lista persistida');
  });
  it('wrong requested reception/type/size cannot match any success', () => {
    expect(() => chain().uploadChain(other, 'photo', 20)).toThrow();
    expect(() => chain().uploadChain(reception, 'video360', 20)).toThrow();
    expect(() => chain().uploadChain(reception, 'photo', 21)).toThrow();
  });
  it.each<Partial<S4Exchange>>([{ requestHeaders: { authorization: secret } }, { status: 403 }, { status: 200 }, { responseHeaders: {} }])('read refuses credentials, inaccessible media, missing Range or CORS %#', override => {
    const evidence = chain(); read(evidence, override);
    expect(() => { evidence.readChain(reception, asset, true); }).toThrow();
  });
  it('serialization has only masked routes/status/booleans; never bodies, URLs, query, IDs or credentials', () => {
    const evidence = chain({ put: { requestHeaders: { authorization: secret } } }); read(evidence);
    const json = JSON.stringify(evidence);
    for (const forbidden of [secret, asset, session, reception, 'X-Amz-', '/private/object', R2, API, 'responseBody']) expect(json).not.toContain(forbidden);
    expect(json).toContain('credentialsAbsent');
    expect(json).toContain(':id');
  });
  it('capture failure is explicit, never silently accepted as partial evidence', async () => {
    const evidence = chain(); evidence.track(Promise.reject(new Error(secret)));
    await expect(evidence.settled()).rejects.toThrow('No se pudo capturar evidencia S4 completa.');
  });
});


// Actual Chromium with two LOCAL synthetic HTTP providers. This proves the collector, not Clerk/API/R2 integration.
describe('S4 Chromium harness (credential-free)', () => {
  it('observes native OPTIONS/PUT/GET Range and returns no secret URL; valid fixtures decode and play', async () => {
    let frontendOrigin = '';
    let storageOrigin = '';
    let expiresAt = Infinity;
    const frontend = http.createServer((request, response) => {
      if (request.url?.endsWith('/download-url')) {
        expiresAt = Date.now() + 150;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ mediaAssetId: asset, downloadUrl: `${storageOrigin}/object?signature=${secret}`, expiresAt: new Date(expiresAt).toISOString() }));
      } else response.end('<html><body>S4 synthetic harness</body></html>');
    });
    const storage = http.createServer((request, response) => {
      response.setHeader('Access-Control-Allow-Origin', frontendOrigin);
      response.setHeader('Access-Control-Allow-Methods', 'PUT, GET');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match, Range');
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); }
      else if (request.method === 'PUT') { request.resume(); response.writeHead(200); response.end(); }
      else if (Date.now() > expiresAt) { response.removeHeader('Access-Control-Allow-Origin'); response.writeHead(403); response.end('Denied'); }
      else { response.writeHead(request.headers.range ? 206 : 200, { 'Content-Range': 'bytes 0-2/3' }); response.end('S4!'); }
    });
    const listen = async (server: http.Server) => {
      await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Synthetic server did not start.');
      return `http://127.0.0.1:${String(address.port)}`;
    };
    const browser = await chromium.launch();
    try {
      frontendOrigin = await listen(frontend);
      storageOrigin = await listen(storage);
      const page = await browser.newPage();
      const evidence = await recordS4Media(page, { api: frontendOrigin, frontend: frontendOrigin, storage: storageOrigin });
      await page.goto(frontendOrigin);
      const result = await page.evaluate(async url => {
        const put = await fetch(url, { method: 'PUT', credentials: 'omit', headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' }, body: 'S4!' });
        const get = await fetch(url, { credentials: 'omit', headers: { Range: 'bytes=0-2' } });
        await get.arrayBuffer();
        return { put: put.status, get: get.status };
      }, `${storageOrigin}/object?X-Amz-Signature=${secret}`);
      expect(result).toEqual({ put: 200, get: 206 });
      await evidence.settled();
      const entries = JSON.parse(JSON.stringify(evidence)) as { method: string; status: number; facts: { credentialsAbsent: boolean } }[];
      expect(entries.some(entry => entry.method === 'OPTIONS' && entry.status === 204)).toBe(true);
      expect(entries.some(entry => entry.method === 'PUT' && entry.facts.credentialsAbsent)).toBe(true);
      expect(entries.some(entry => entry.method === 'GET' && entry.status === 206 && entry.facts.credentialsAbsent)).toBe(true);
      expect(JSON.stringify(evidence).includes(secret)).toBe(false);
      const fixtures = { photo: [...fs.readFileSync(path.join(S4_FIXTURE_DIR, 'photo.png'))], video: [...fs.readFileSync(path.join(S4_FIXTURE_DIR, 'video360.mp4'))] };
      const decoded = await page.evaluate(async files => {
        const photoUrl = URL.createObjectURL(new Blob([Uint8Array.from(files.photo)], { type: 'image/png' }));
        const videoUrl = URL.createObjectURL(new Blob([Uint8Array.from(files.video)], { type: 'video/mp4' }));
        try {
          const image = new Image(); image.src = photoUrl; await image.decode();
          const video = document.createElement('video'); video.src = videoUrl; video.muted = true;
          await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => { resolve(); }; video.onerror = () => { reject(new Error('Synthetic video invalid.')); }; });
          await video.play(); await new Promise(resolve => { setTimeout(resolve, 200); });
          const result = { imageValid: image.naturalWidth > 0, videoValid: Number.isFinite(video.duration) && video.duration > 0 && video.currentTime > 0 };
          video.pause(); video.removeAttribute('src'); video.load(); return result;
        } finally { URL.revokeObjectURL(photoUrl); URL.revokeObjectURL(videoUrl); }
      }, fixtures);
      expect(decoded).toEqual({ imageValid: true, videoValid: true });
      await page.evaluate(() => { Reflect.set(window, 'Clerk', { session: { getToken: () => Promise.resolve('synthetic-token') } }); });
      expect(await verifyExpiredDownload(page, { apiOrigin: frontendOrigin, storageOrigin, tenantId: reception, assetId: asset }))
        .toEqual({ initialStatus: 200, expiredStorageStatus: 403, waitedPastExpiry: true });
      await page.evaluate(value => { document.body.innerHTML = `<img alt="${value}" src="https://storage.example.invalid/?secret=${value}">`; }, secret);
      const failure: unknown = await s4Safe(page, 'forced synthetic failure', () => Promise.reject(new Error(secret))).catch((error: unknown) => error);
      expect(failure instanceof Error && !failure.message.includes(secret)).toBe(true);
      expect(page.url()).toBe('about:blank');
    } finally {
      await browser.close();
      for (const server of [frontend, storage]) await new Promise<void>(resolve => { server.close(() => { resolve(); }); });
    }
  });
});
