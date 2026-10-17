import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import http from 'node:http';
import { chromium } from '@playwright/test';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { recordS4Media, S4MediaEvidence, type S4Exchange } from '../../e2e/support/s4-media-evidence';
import { requireS4Preflight, s4PreflightProblems } from '../../e2e/support/s4-preflight';
import { verifyExpiredDownload } from '../../e2e/support/s4-download-expiry';
import { checkS4DownloadTimes, s4ExpiryWaitMs } from '../../e2e/support/s4-download-timing';
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
const download = `${R2}/private/object?X-Amz-Signature=${secret}-download&X-Amz-Date=20261013T120000Z&X-Amz-Expires=300`;
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
  it.each(['local', 'development', 'test', ' LOCAL ', ' TEST '])('complete safe sandbox accepts allowed S4 env %s', value => {
    expect(s4PreflightProblems({ ...sandbox(), VITE_APP_ENV: value })).toEqual([]);
  });
  it.each(['production', ' Production ', 'PROD', 'staging', 'unknown'])('complete sandbox cannot permit disallowed S4 env %s', value => {
    expect(() => { requireS4Preflight({ ...sandbox(), VITE_APP_ENV: value }); }).toThrow('BLOCKED');
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
    requestDurationMs: 0, requestHeaders: {}, responseHeaders: { 'cache-control': 'no-store', 'access-control-allow-origin': FRONTEND }, ...overrides };
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
  evidence.observe(exchange('GET', `${API}/api/v1/media/${asset}/download-url`, { mediaAssetId: asset, downloadUrl: download, expiresAt: '2026-10-13T12:05:00.000Z' }));
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
  it.each(['PUT', 'complete', 'attach'] as const)('rejects a duplicate %s request even without a second response', stage => {
    const evidence = chain();
    if (stage === 'PUT') evidence.noteRequest('PUT', upload);
    if (stage === 'complete') evidence.noteRequest('POST', `${API}/api/v1/media/upload-sessions/${session}/complete`);
    if (stage === 'attach') evidence.noteRequest('POST', `${API}/api/v1/receptions/${reception}/media`, { mediaAssetId: asset });
    // First request plus a second failed/in-flight request; no duplicate successful response required.
    if (stage === 'PUT') evidence.noteRequest('PUT', upload);
    if (stage === 'complete') evidence.noteRequest('POST', `${API}/api/v1/media/upload-sessions/${session}/complete`);
    if (stage === 'attach') evidence.noteRequest('POST', `${API}/api/v1/receptions/${reception}/media`, { mediaAssetId: asset });
    expect(() => evidence.uploadChain(reception, 'photo', 20)).toThrow(/duplicad/);
  });
  it.each(['PUT', 'complete', 'attach'] as const)('rejects duplicate %s responses without request instrumentation', stage => {
    const evidence = chain();
    if (stage === 'PUT') evidence.observe(exchange('PUT', upload, null));
    if (stage === 'complete') evidence.observe(exchange('POST', `${API}/api/v1/media/upload-sessions/${session}/complete`, {}));
    if (stage === 'attach') evidence.observe(exchange('POST', `${API}/api/v1/receptions/${reception}/media`, {}, { requestBody: { mediaAssetId: asset } }));
    expect(() => evidence.uploadChain(reception, 'photo', 20)).toThrow(/duplicad/);
  });
  it('OPTIONS and unrelated capacities, sessions, assets and origins are not duplicate PUT/completion/association', () => {
    const evidence = chain();
    evidence.noteRequest('OPTIONS', upload);
    evidence.noteRequest('PUT', `${upload}-another-capability`);
    evidence.noteRequest('PUT', 'https://unrelated.example.invalid/object');
    evidence.noteRequest('POST', `${API}/api/v1/media/upload-sessions/${other}/complete`);
    evidence.noteRequest('POST', `${API}/api/v1/receptions/${reception}/media`, { mediaAssetId: other });
    expect(evidence.uploadChain(reception, 'photo', 20)).toBe(asset);
  });
  it.each([-60_000, 60_000])('stored read evidence remains valid with runner wall-clock skew %d and later evaluation', skew => {
    const evidence = chain(); read(evidence);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-01T00:00:00Z') + skew);
    try { expect(() => { evidence.readChain(reception, asset, true); }).not.toThrow(); } finally { clock.mockRestore(); }
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
  type CdpFault = 'missing-first' | 'missing-second' | 'duplicate-response' | 'duplicate-second' | 'duplicate-request' | 'foreign-capability';
  async function observeExpiry(clocks: {
    browserSkew: number; runnerSkew: number; providerSkew: number; latency: number; denyExpired: boolean; cdpDelay: number;
    cdpFault?: CdpFault; requestDelay?: number; lateFirstDuplicate?: boolean;
  }) {
    let frontendOrigin = '';
    let storageOrigin = '';
    let expiresAt = Infinity;
    let capabilityHash = '';
    // Synthetic provider only: allow latency/scheduling plus whole-second truncation before the first GET.
    const syntheticTtlSeconds = 5;
    const realNow = Date.now.bind(Date);
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clocks.runnerSkew);
    const frontend = http.createServer((request, response) => {
      if (request.url?.endsWith('/download-url')) {
        const signedAt = Math.floor((realNow() + clocks.providerSkew) / 1_000) * 1_000;
        const signedDate = new Date(signedAt).toISOString().replace(/[-:]/g, '').replace('.000', '');
        expiresAt = signedAt + syntheticTtlSeconds * 1_000;
        const downloadUrl = `${storageOrigin}/object?signature=${secret}&X-Amz-Date=${signedDate}&X-Amz-Expires=${String(syntheticTtlSeconds)}`;
        capabilityHash = createHash('sha256').update(downloadUrl).digest('hex');
        response.setHeader('Content-Type', 'application/json');
        setTimeout(() => { response.end(JSON.stringify({ mediaAssetId: asset, downloadUrl, expiresAt: new Date(expiresAt).toISOString() })); }, clocks.latency);
      } else response.end('<html><body>S4 synthetic harness</body></html>');
    });
    const storage = http.createServer((request, response) => {
      response.setHeader('Date', new Date(realNow() + clocks.providerSkew).toUTCString());
      response.setHeader('Access-Control-Allow-Origin', frontendOrigin);
      response.setHeader('Access-Control-Allow-Methods', 'PUT, GET');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match, Range');
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); }
      else if (request.method === 'PUT') { request.resume(); response.writeHead(200); response.end(); }
      else if (clocks.denyExpired && realNow() + clocks.providerSkew > expiresAt) { response.removeHeader('Access-Control-Allow-Origin'); response.writeHead(403); response.end('Denied'); }
      else { response.writeHead(request.headers.range ? 206 : 200, { 'Content-Range': 'bytes 0-2/3' }); response.end('S4!'); }
    });
    const listen = async (server: http.Server) => {
      await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Synthetic server did not start.');
      return `http://127.0.0.1:${String(address.port)}`;
    };
    const browser = await chromium.launch();
    const deliveries = new Set<ReturnType<typeof setTimeout>>();
    try {
      frontendOrigin = await listen(frontend);
      storageOrigin = await listen(storage);
      const page = await browser.newPage();
      const evidence = await recordS4Media(page, { api: frontendOrigin, frontend: frontendOrigin, storage: storageOrigin });
      await page.addInitScript(skew => { const nativeNow = Date.now.bind(Date); Date.now = () => nativeNow() + skew; }, clocks.browserSkew);
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
      // Pair native events BEFORE choosing a fault. ExtraInfo can arrive first;
      // its requestId must inherit the identity of its own GET, never a live count.
      type Phase = 'initial' | 'expired';
      const facts = {
        initial: { requests: 0, responses: 0, status: 0 }, expired: { requests: 0, responses: 0, status: 0 },
        sameCapability: true, order: [] as string[], faults: [] as string[],
      };
      const schedule = (callback: () => void, delay: number) => {
        if (delay === 0) { callback(); return; }
        const delivery = setTimeout(() => { deliveries.delete(delivery); callback(); }, delay);
        deliveries.add(delivery);
      };
      const nativeSession = page.context().newCDPSession.bind(page.context());
      vi.spyOn(page.context(), 'newCDPSession').mockImplementation(async target => {
        const cdp = await nativeSession(target);
        const nativeOn = cdp.on.bind(cdp);
        type Pair = { phase?: Phase; request?: () => void; response?: () => void; dispatched?: boolean; responseCount?: number; status?: number };
        const pairs = new Map<string, Pair>();
        let initialRequestId: string | undefined;
        let lateDuplicate: (() => void) | undefined;
        const pairFor = (requestId: string) => {
          let pair = pairs.get(requestId);
          if (pair === undefined) { pair = {}; pairs.set(requestId, pair); }
          return pair;
        };
        const dispatch = (pair: Pair) => {
          if (pair.phase !== undefined) {
            facts[pair.phase].responses = pair.responseCount ?? 0;
            facts[pair.phase].status = pair.status ?? 0;
          }
          if (pair.dispatched || pair.request === undefined || pair.response === undefined) return;
          pair.dispatched = true;
          // A duplicate held until the second native GET tests the gap between
          // the helper's initial and final waits, without any timing guess.
          if (pair.phase === 'expired') { lateDuplicate?.(); lateDuplicate = undefined; }
          if ((clocks.requestDelay ?? 0) > 0) {
            pair.response(); schedule(pair.request, clocks.requestDelay ?? 0);
          } else {
            pair.request(); schedule(pair.response, clocks.cdpDelay);
          }
        };
        Object.defineProperty(cdp, 'on', { value: (
          event: 'Network.requestWillBeSent' | 'Network.responseReceivedExtraInfo', listener: (payload: unknown) => void,
        ) => nativeOn(event, payload => {
          const pair = pairFor(payload.requestId);
          if ('request' in payload) {
            if (payload.request.method !== 'GET' || new URL(payload.request.url).origin !== storageOrigin) {
              listener(payload); return;
            }
            initialRequestId ??= payload.requestId;
            const phase: Phase = payload.requestId === initialRequestId ? 'initial' : 'expired';
            pair.phase = phase;
            facts[phase].requests++;
            facts.sameCapability &&= createHash('sha256').update(payload.request.url).digest('hex') === capabilityHash;
            pair.request = () => {
              facts.order.push(`${phase}:request`);
              if (phase === 'initial' && clocks.cdpFault === 'foreign-capability') {
                facts.faults.push('foreign-capability:initial');
                listener({ ...payload, request: { ...payload.request, url: `${payload.request.url}&foreign=1` } });
              } else {
                listener(payload);
                if (phase === 'initial' && clocks.cdpFault === 'duplicate-request') {
                  facts.faults.push('duplicate-request:initial'); listener(payload);
                }
              }
            };
          } else {
            pair.responseCount = (pair.responseCount ?? 0) + 1; pair.status = payload.statusCode;
            pair.response = () => {
              const phase = pair.phase;
              if (phase === undefined) throw new Error('Unpaired synthetic CDP response.');
              const emit = () => { facts.order.push(`${phase}:response`); listener(payload); };
              const fault = clocks.cdpFault;
              if ((phase === 'initial' && fault === 'missing-first') || (phase === 'expired' && fault === 'missing-second')) {
                facts.faults.push(`${fault}:${phase}`); return;
              }
              emit();
              if ((phase === 'initial' && fault === 'duplicate-response') || (phase === 'expired' && fault === 'duplicate-second')) {
                const duplicate = () => { facts.faults.push(`${fault}:${phase}`); emit(); };
                if (clocks.lateFirstDuplicate) lateDuplicate = duplicate;
                else duplicate();
              }
            };
          }
          dispatch(pair);
        }) });
        return cdp;
      });
      const expiry = verifyExpiredDownload(page, { apiOrigin: frontendOrigin, storageOrigin, tenantId: reception, assetId: asset });
      if (clocks.cdpFault) await expect(expiry).rejects.toThrow((clocks.cdpFault === 'missing-second' || clocks.cdpFault === 'duplicate-second' || clocks.lateFirstDuplicate) ? 'Falta GET real 403' : 'Falta GET real exitoso');
      else if (clocks.denyExpired) await expect(expiry).resolves.toEqual({ initialStatus: 200, expiredStorageStatus: 403, waitedPastExpiry: true });
      else await expect(expiry).rejects.toThrow('Falta GET real 403');
      // A rejection is insufficient: prove the intended fault reached the intended
      // native GET, and that reordering/delay actually happened at delivery.
      expect(facts.sameCapability).toBe(true);
      expect(facts.initial.requests).toBe(1);
      if (clocks.cdpFault !== 'duplicate-request') expect(facts.initial).toEqual({ requests: 1, responses: 1, status: 200 });
      const finalPhase = !clocks.cdpFault || clocks.cdpFault === 'missing-second' || clocks.cdpFault === 'duplicate-second' || clocks.lateFirstDuplicate;
      if (finalPhase) expect(facts.expired).toEqual({ requests: 1, responses: 1, status: clocks.denyExpired ? 403 : 200 });
      expect(facts.faults).toEqual(clocks.cdpFault ? [`${clocks.cdpFault}:${clocks.cdpFault.endsWith('second') ? 'expired' : 'initial'}`] : []);
      for (const phase of ['initial', 'expired'] as const) {
        const request = facts.order.indexOf(`${phase}:request`), response = facts.order.indexOf(`${phase}:response`);
        if (request !== -1 && response !== -1) expect(response < request).toBe((clocks.requestDelay ?? 0) > 0);
      }
      if (clocks.lateFirstDuplicate) {
        expect(facts.order.lastIndexOf('initial:response')).toBeGreaterThan(facts.order.indexOf('initial:request'));
        expect(facts.expired.requests).toBe(1);
      }
      await page.evaluate(value => { document.body.innerHTML = `<img alt="${value}" src="https://storage.example.invalid/?secret=${value}">`; }, secret);
      const failure: unknown = await s4Safe(page, 'forced synthetic failure', () => Promise.reject(new Error(secret))).catch((error: unknown) => error);
      expect(failure instanceof Error && !failure.message.includes(secret)).toBe(true);
      expect(page.url()).toBe('about:blank');
    } finally {
      clock.mockRestore();
      for (const delivery of deliveries) clearTimeout(delivery);
      await browser.close();
      for (const server of [frontend, storage]) await new Promise<void>(resolve => { server.close(() => { resolve(); }); });
    }
  }
  it.each([
    { browserSkew: 60_000, runnerSkew: -60_000, providerSkew: 30_000, latency: 180, denyExpired: true, cdpDelay: 100 },
    { browserSkew: -60_000, runnerSkew: 60_000, providerSkew: -30_000, latency: 180, denyExpired: true, cdpDelay: 0 },
    { browserSkew: 0, runnerSkew: 0, providerSkew: 0, latency: 0, denyExpired: false, cdpDelay: 100 },
    { browserSkew: 0, runnerSkew: 0, providerSkew: 0, latency: 2_100, denyExpired: true, cdpDelay: 0 },
  ])('observes native HTTP and effective expiry with controlled clocks/latency %j (synthetic only)', observeExpiry);
  it('correlates ExtraInfo delivered before requestWillBeSent by exact requestId', async () => {
    await observeExpiry({ browserSkew: 0, runnerSkew: 0, providerSkew: 0, latency: 0, denyExpired: true, cdpDelay: 0, requestDelay: 100 });
  });
  it.each<CdpFault>(['missing-first', 'missing-second', 'duplicate-response', 'duplicate-second', 'duplicate-request', 'foreign-capability'])(
    'rejects %s CDP evidence despite real storage HTTP', async cdpFault => {
      for (const delivery of [{ cdpDelay: 0, requestDelay: 0 }, { cdpDelay: 100, requestDelay: 0 }, { cdpDelay: 0, requestDelay: 100 }]) {
        await observeExpiry({ browserSkew: 0, runnerSkew: 0, providerSkew: 0, latency: 0, denyExpired: true, ...delivery, cdpFault });
        if (cdpFault === 'duplicate-response') await observeExpiry({
          browserSkew: 0, runnerSkew: 0, providerSkew: 0, latency: 0, denyExpired: true, ...delivery, cdpFault, lateFirstDuplicate: true,
        });
      }
    },
  );
});


describe('H-5 temporal assertions never change the actual storage TTL', () => {
  it('latency is observed independently; signed TTL remains at most 300s and API/firma tolerance is bounded', () => {
    const signed = Date.parse('2026-10-13T12:00:00Z');
    for (const latency of [0, 180, 5_000]) expect(() => { checkS4DownloadTimes(signed + 300_000 + 999, signed, 300_000, latency); }).not.toThrow();
    for (const [expiry, ttl, duration] of [[signed + 300_000, 301_000, 0], [signed + 303_001, 300_000, 180], [signed, 0, 0], [signed + 300_000, 300_000, -1]]) {
      expect(() => { checkS4DownloadTimes(expiry ?? NaN, signed, ttl ?? NaN, duration ?? NaN); }).toThrow();
    }
    expect(s4ExpiryWaitMs(signed + 300_000, signed + 1_000)).toBe(301_000);
    expect(() => s4ExpiryWaitMs(signed, NaN)).toThrow();
  });
});
