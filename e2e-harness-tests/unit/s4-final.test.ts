import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { S4MediaEvidence } from '../../e2e/support/s4-media-evidence';
import { API, R2, FRONTEND, reception, files, create, finish, operation, exchange } from '../helpers/s4-upload-fixture';

const marker = 'SYNTHETIC_TOKEN_OR_HOSTILE_BODY_NOT_FOR_REPORTS';
const id = (n: number) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-s4-final-'));
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
describe('R-1 upload window includes every new operation, regardless of reception/IDs', () => {
  it('two creates/PUTs and expected completion/attach chains pass with sanitized evidence', () => {
    const { evidence } = operation();
    expect(() => { evidence.assertUploadOperation(files); }).not.toThrow();
    for (const value of [marker, 'X-Amz-', 'object/20', id(20), reception, R2]) expect(JSON.stringify(evidence)).not.toContain(value);
  });
  it.each(['extraOwnSession', 'extraOtherSession', 'extraOwnSessionNoPut', 'extraOtherSessionNoPut', 'extraUnknownPut',
    'extraOtherPut', 'extraOtherComplete', 'extraOtherAttach', 'wrongReception', 'wrongAsset', 'wrongCapability', 'invalidCompleteId', 'uppercaseReceptionId'] as const)('%s cannot hide behind context/capability filters', mode => {
    const { evidence, photo } = operation();
    if (mode.startsWith('extraOwnSession')) { const next = create(evidence, 32, 'photo'); if (mode === 'extraOwnSession') finish(evidence, next, 'photo'); }
    if (mode.startsWith('extraOtherSession')) { const next = create(evidence, 33, 'photo', id(99)); if (mode === 'extraOtherSession') finish(evidence, next, 'photo', id(99)); }
    if (mode === 'extraUnknownPut') evidence.noteRequest('PUT', `${R2}/different?X-Amz-Signature=${marker}`);
    if (mode === 'extraOtherPut') { const next = create(evidence, 34, 'photo', id(98)); evidence.noteRequest('PUT', next.url); }
    if (mode === 'extraOtherComplete') evidence.noteRequest('POST', `${API}/api/v1/media/upload-sessions/${id(98)}/complete`);
    if (mode === 'extraOtherAttach') evidence.noteRequest('POST', `${API}/api/v1/receptions/${id(98)}/media`, { mediaAssetId: id(97) });
    if (mode === 'wrongReception' || mode === 'wrongAsset') {
      evidence.noteRequest('POST', `${API}/api/v1/receptions/${mode === 'wrongReception' ? id(99) : reception}/media`, { mediaAssetId: mode === 'wrongAsset' ? id(98) : photo.asset });
    }
    if (mode === 'invalidCompleteId') evidence.noteRequest('POST', `${API}/api/v1/media/upload-sessions/not-a-uuid/complete`);
    if (mode === 'uppercaseReceptionId') evidence.noteRequest('POST', `${API}/api/v1/receptions/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/media`, { mediaAssetId: id(98) });
    if (mode === 'wrongCapability') evidence.observe(exchange('PUT', `${photo.url}-different`, null, null));
    expect(() => { evidence.assertUploadOperation(files); }).toThrow();
  });
  it('a known other-reception capability issued before checkpoint still counts if its PUT begins after checkpoint', () => {
    const evidence = new S4MediaEvidence(API, R2, FRONTEND);
    const foreign = create(evidence, 31, 'photo', id(99)); finish(evidence, foreign, 'photo', id(99));
    evidence.beginUploadOperation(reception);
    const photo = create(evidence, 20, 'photo'); finish(evidence, photo, 'photo');
    const video = create(evidence, 21, 'video360'); finish(evidence, video, 'video360');
    evidence.noteRequest('PUT', foreign.url);
    expect(() => { evidence.assertUploadOperation(files); }).toThrow('exactamente 2 PUT');
  });
  it('only requests initiated before checkpoint are excluded, even if their response comes afterwards', () => {
    const evidence = new S4MediaEvidence(API, R2, FRONTEND);
    const foreign = create(evidence, 31, 'photo', id(99)); finish(evidence, foreign, 'photo', id(99));
    const oldPut = evidence.noteRequest('PUT', foreign.url);
    const oldCreateBody = { operationalContext: { type: 'reception', receptionId: id(99) } };
    const oldCreate = evidence.noteRequest('POST', `${API}/api/v1/media/upload-sessions`, oldCreateBody);
    evidence.beginUploadOperation(reception);
    evidence.observe(exchange('PUT', foreign.url, null, null, 200, oldPut));
    evidence.observe(exchange('POST', `${API}/api/v1/media/upload-sessions`, oldCreateBody, {}, 503, oldCreate));
    const photo = create(evidence, 20, 'photo'); finish(evidence, photo, 'photo');
    const video = create(evidence, 21, 'video360'); finish(evidence, video, 'video360');
    evidence.noteRequest('OPTIONS', foreign.url);
    expect(() => { evidence.assertUploadOperation(files); }).not.toThrow();
  });
  it('counter regressions kill relaxed totals and restored reception/capability exclusions', () => {
    const require = createRequire(import.meta.url);
    const sourceFile = path.resolve('e2e/support/s4-media-evidence.ts');
    const source = fs.readFileSync(sourceFile, 'utf8').replace(/from '(\.\/[^']+)'/g, (_, relative: string) => `from ${JSON.stringify(path.resolve(path.dirname(sourceFile), relative + '.ts'))}`);
    const totalCreate = ".length) === 2,\n      'La operación S4 debe emitir exactamente 2 POST";
    const totalPut = ".length) === 2, 'La operación S4 debe emitir exactamente 2 PUT";
    const totalMutation = '.length) === 2,\n      completion ?';
    for (const anchor of [totalCreate, totalPut, totalMutation]) expect(source.split(anchor)).toHaveLength(2);
    const mutations = [
      { name: 'create-total', mode: 'create', text: source.replace(totalCreate, totalCreate.replace('=== 2', '<= 3')) },
      { name: 'put-total', mode: 'put', text: source.replace(totalPut, totalPut.replace('=== 2', '<= 3')) },
      { name: 'completion-total', mode: 'complete', text: source.replace(totalMutation, totalMutation.replace('=== 2', '<= 3')) },
      { name: 'association-total', mode: 'attach', text: source.replace(totalMutation, totalMutation.replace('=== 2', '<= 3')) },
      { name: 'reception-filter', mode: 'create', text: source
        .replace('const create = (method: string, url: string)', 'const create = (method: string, url: string, body: unknown)')
        .replace("new URL(url).pathname === '/api/v1/media/upload-sessions';", "new URL(url).pathname === '/api/v1/media/upload-sessions' && field(body, 'operationalContext', 'receptionId') === operation.receptionId;")
        .replace('create(r.method, r.url)', 'create(r.method, r.url, r.body)').replace('create(e.method, e.url)', 'create(e.method, e.url, e.requestBody)') },
      { name: 'foreign-put-filter', mode: 'foreignPut', text: source.replace(
        "const put = (method: string, url: string) => method === 'PUT' && new URL(url).origin === this.storageOrigin;",
        `const put = (method: string, url: string) => method === 'PUT' && new URL(url).origin === this.storageOrigin && new URL(url).pathname !== '/__s4_object__/${createHash('sha256').update('/object/31').digest('hex')}';`) },
    ];
    const artifactFiles = mutations.map(mutation => {
      const file = path.join(tmp, `${mutation.name}.ts`); fs.writeFileSync(file, mutation.text); return { ...mutation, file };
    });
    const script = path.join(tmp, 'mutation-control.cjs');
    fs.writeFileSync(script, `
      const {transform}=require(${JSON.stringify(require.resolve('playwright/lib/common'))});
      (async()=>{
        const f=await transform.requireOrImport(${JSON.stringify(path.resolve('e2e-harness-tests/helpers/s4-upload-fixture.ts'))});
        const Original=(await transform.requireOrImport(${JSON.stringify(sourceFile)})).S4MediaEvidence;
        function negative(Ctor,mode){
          let e,foreign;
          if(mode==='foreignPut'){
            e=new Ctor(f.API,f.R2,f.FRONTEND);foreign=f.create(e,31,'photo',${JSON.stringify(id(99))});f.finish(e,foreign,'photo',${JSON.stringify(id(99))});
            e.beginUploadOperation(f.reception);const a=f.create(e,20,'photo');f.finish(e,a,'photo');const b=f.create(e,21,'video360');f.finish(e,b,'video360');
          }else e=f.operation(false,Ctor).evidence;
          if(mode==='create') e.noteRequest('POST',f.API+'/api/v1/media/upload-sessions',{operationalContext:{type:'reception',receptionId:${JSON.stringify(id(99))}}});
          if(mode==='put') e.noteRequest('PUT',f.R2+'/different?X-Amz-Signature=synthetic');
          if(mode==='foreignPut') e.noteRequest('PUT',foreign.url);
          if(mode==='complete') e.noteRequest('POST',f.API+'/api/v1/media/upload-sessions/${id(98)}/complete');
          if(mode==='attach') e.noteRequest('POST',f.API+'/api/v1/receptions/${id(98)}/media',{mediaAssetId:${JSON.stringify(id(97))}});
          try{e.assertUploadOperation(f.files);return false;}catch{return true;}
        }
        const results=[];
        for(const mutation of ${JSON.stringify(artifactFiles.map(({ name, mode, file }) => ({ name, mode, file })))} ){
          const Mutant=(await transform.requireOrImport(mutation.file)).S4MediaEvidence;
          f.operation(false,Mutant).evidence.assertUploadOperation(f.files);
          results.push({name:mutation.name,baselineRejected:negative(Original,mutation.mode),mutantAccepted:!negative(Mutant,mutation.mode)});
        }
        console.log(JSON.stringify(results));
      })().catch(error=>{console.error(error.stack);process.exitCode=1});
    `);
    const run = spawnSync(process.execPath, [script], { cwd: path.resolve('.'), encoding: 'utf8', timeout: 30_000 });
    expect(run.status, run.stderr).toBe(0);
    const results = JSON.parse(run.stdout) as { name: string; baselineRejected: boolean; mutantAccepted: boolean }[];
    expect(results).toHaveLength(6);
    for (const result of results) expect(result).toMatchObject({ baselineRejected: true, mutantAccepted: true });
  });
});

const user = id(1), tenant = id(2), membership = id(3);
const me = { user: { id: user }, memberships: [{ tenantId: tenant, membershipId: membership }], tenantSelection: { mode: 'automatic', tenantId: tenant } };
function context(overrides: Record<string, unknown> = {}) {
  const permissions = ['workshop.read', 'media.upload', 'media.read', 'receptions.read', 'receptions.create', 'customers.read', 'customers.create',
    'vehicles.read', 'vehicles.create', 'vehicle_owners.manage', 'privacy_consents.read', 'privacy_consents.capture'].map(code => ({ code, scopes: ['tenant'] }));
  return { context: { userId: user, tenantId: tenant, membershipId: membership,
    workshop: { displayName: 'Synthetic workshop', timezone: 'America/Bogota', currency: 'COP' }, roles: ['owner'], permissions, ...overrides } };
}
type ReportSuite = { specs: { title: string; tests: { results: { status: string; error?: { message: string } }[] }[] }[]; suites?: ReportSuite[] };
type Report = { suites: ReportSuite[]; errors: { message: string }[] };
function specs(suites: ReportSuite[]): ReportSuite['specs'] {
  return suites.flatMap(suite => [...suite.specs, ...specs(suite.suites ?? [])]);
}
const cases = ['missing', 'expired', 'notAuthenticated', 'valid', 'revoked', 'membershipChanged', 'tenantChanged', 'permissionsRevoked', 'bootstrap503', 'healthOff', 'clerkFault', 'invalidState', 'symlinkState', 'symlinkDirectory', 'fileDirectory', 'tokenFault', 'consistentIdentityChange'] as const;
describe('R-2 actual hooks and Playwright reporter with setup and --no-deps (synthetic only)', () => {
  it.each(cases.flatMap(mode => [ { mode, noDeps: true }, { mode, noDeps: false } ]))('%j preserves cold/active phase and never reports a false scenario PASS', async ({ mode, noDeps }) => {
    const directory = fs.mkdtempSync(path.join(tmp, 'reporter-')); const auth = path.join(directory, 'auth'); fs.mkdirSync(auth);
    const stateFile = path.join(auth, 's4.json');
    if (mode !== 'missing') fs.writeFileSync(stateFile, mode === 'invalidState' ? '{invalid' : JSON.stringify({ cookies: [], origins: [] }));
    if (mode === 'symlinkState') { const target = path.join(directory, 'private-state.json'); fs.renameSync(stateFile, target); fs.symlinkSync(target, stateFile); }
    if (mode === 'symlinkDirectory') { const target = path.join(directory, 'private-auth'); fs.renameSync(auth, target); fs.symlinkSync(target, auth); }
    if (mode === 'fileDirectory') { fs.rmSync(auth, { recursive: true }); fs.writeFileSync(auth, 'synthetic invalid directory'); }
    const fixtureDirectory = path.join(directory, 'e2e/fixtures/s4'); fs.mkdirSync(fixtureDirectory, { recursive: true });
    for (const file of ['photo.png', 'video360.mp4']) fs.copyFileSync(path.resolve('e2e/fixtures/s4', file), path.join(fixtureDirectory, file));
    let origin = '', active = false;
    const server = http.createServer((req, res) => {
      if (req.url === '/health/live') res.end(JSON.stringify({ status: 'live' }));
      else if (req.url === '/health/ready') res.end(JSON.stringify({ status: 'ready', checks: { database: true } }));
      else if (req.url === '/src/main.tsx') res.end(`import.meta.env = ${JSON.stringify({ PROD: false, VITE_APP_ENV: 'local', VITE_API_BASE_URL: origin, VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic' })};`);
      else if (req.url === '/control/active') { active = true; res.end('{}'); }
      else if (req.url === '/api/v1/me') { res.statusCode = mode === 'bootstrap503' ? 503 : mode === 'revoked' && active ? 401 : 200; res.end(JSON.stringify(active && mode === 'consistentIdentityChange' ? { user: { id: id(90) }, memberships: [{ tenantId: id(91), membershipId: id(92) }], tenantSelection: { mode: 'automatic', tenantId: id(91) } } : me)); }
      else if (req.url === '/api/v1/me/context') res.end(JSON.stringify(context(active && mode === 'consistentIdentityChange' ? { userId: id(90), tenantId: id(91), membershipId: id(92) } : active && mode === 'membershipChanged' ? { membershipId: id(99) } :
        active && mode === 'tenantChanged' ? { tenantId: id(99) } : active && mode === 'permissionsRevoked' ? { permissions: [] } : {})));
      else {
        res.setHeader('content-type', 'text/html');
        const session = mode === 'notAuthenticated' ? 'null' : `{status:${JSON.stringify(mode === 'expired' ? 'expired' : 'active')},getToken:async()=>{${mode === 'tokenFault' ? `throw new Error(${JSON.stringify(marker)})` : `return ${JSON.stringify(marker)}`}}}`;
        res.end(`<html><main id="contenido-principal">Synthetic staff shell</main><script>window.Clerk={loaded:true,session:${session}};
          ${mode === 'clerkFault' ? `Object.defineProperty(window.Clerk,'loaded',{get(){throw new Error(${JSON.stringify(marker)})}});` : ''}</script></html>`);
      }
    });
    await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Synthetic HTTP unavailable');
    origin = `http://127.0.0.1:${String(address.port)}`;
    const manifest = path.join(directory, 'sandbox.json'); fs.writeFileSync(manifest, JSON.stringify({ environment: 'test', production: false,
      postgresqlFixturesValidated: true, frontendOrigin: origin, apiOrigin: origin, r2Origin: R2 }));
    const require = createRequire(import.meta.url);
    const originalSpec = path.resolve('e2e/s4-media.spec.ts');
    const prefix = fs.readFileSync(originalSpec, 'utf8').split("test('S4-01")[0] ?? '';
    expect(prefix).toContain('requireS4SavedSession(browser)'); expect(prefix).toContain('scenarioSession.open(page)');
    const control = prefix.replace(/from '([^']+)'/g, (full: string, relative: string) => relative.startsWith('.')
      ? `from ${JSON.stringify(path.resolve(path.dirname(originalSpec), relative + '.ts'))}` : relative === '@playwright/test' ? `from ${JSON.stringify(path.join(path.dirname(require.resolve('@playwright/test')), 'index.mjs'))}` : full)
      .replace('requireS4SavedSession(browser)', `requireS4SavedSession(browser,${JSON.stringify(stateFile)})`);
    fs.writeFileSync(path.join(directory, 'control.spec.ts'), control + `
      test('S4-01 synthetic session control',async({page})=>{
        if(scenarioSession.phase!=='scenario') throw new Error('Phase not confirmed');
        if(${JSON.stringify(mode)}==='valid')return;
        await page.request.get(${JSON.stringify(origin + '/control/active')});
        await s4Safe(page,'active synthetic S4-01',async()=>{
          if(${JSON.stringify(mode)}==='healthOff'){
            const http=await import('node:http');const server=http.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
            const url='http://127.0.0.1:'+server.address().port;await new Promise(resolve=>server.close(resolve));
            const {requireS4ApiReady}=await import(${JSON.stringify(path.resolve('e2e/support/s4-readiness.ts'))});await requireS4ApiReady(page.request,url);
          }else await scenarioSession.open(page);
        });
      });
    `);
    fs.writeFileSync(path.join(directory, 'setup.ts'), `
      import {test} from ${JSON.stringify(path.join(path.dirname(require.resolve('@playwright/test')), 'index.mjs'))};
      import {authenticateS4} from ${JSON.stringify(path.resolve('e2e/support/s4-session.ts'))};
      import {requireS4ApiReady} from ${JSON.stringify(path.resolve('e2e/support/s4-readiness.ts'))};
      import {s4Safe} from ${JSON.stringify(path.resolve('e2e/support/s4-safe.ts'))};
      test('synthetic setup',async({page,browser})=>{
        await s4Safe(page,'setup',async()=>{await requireS4ApiReady(page.request,${JSON.stringify(origin)});
          await authenticateS4(browser,${JSON.stringify(origin)},${JSON.stringify(auth)});});
      });
    `);
    const config = path.join(directory, 'playwright.config.cjs'); fs.writeFileSync(config, `module.exports={testDir:__dirname,workers:1,retries:0,
      reporter:[['json']],outputDir:${JSON.stringify(path.join(directory, 'results'))},use:{baseURL:${JSON.stringify(origin)},trace:'off',screenshot:'off',video:'off'},
      projects:[{name:'setup',testMatch:'setup.ts'},{name:'scenario',testMatch:'control.spec.ts',dependencies:['setup'],use:{storageState:${JSON.stringify(stateFile)}}}]};`);
    try {
      // Async child so the parent synthetic HTTP server keeps servicing native browser requests.
      const { spawn } = await import('node:child_process');
      const run = await new Promise<{ status: number | null; output: string; stderr: string }>((resolve, reject) => {
        const child = spawn(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', config, '--project=scenario', ...(noDeps ? ['--no-deps'] : [])],
          { cwd: directory, env: { PATH: process.env['PATH'], HOME: process.env['HOME'], VITE_API_BASE_URL: origin, VITE_APP_ENV: 'local',
            VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic', E2E_BASE_URL: origin, E2E_S4_R2_ORIGIN: R2, E2E_S4_SANDBOX_FILE: manifest, E2E_S4_INTERACTIVE_LOGIN: '0' } });
        let output = '', stderr = ''; child.stdout.on('data', chunk => { output += String(chunk); }); child.stderr.on('data', chunk => { stderr += String(chunk); });
        child.on('error', reject); child.on('exit', status => { resolve({ status, output, stderr }); });
      });
      expect(run.output + run.stderr).not.toContain(marker);
      const report = JSON.parse(run.output) as Report;
      const all = specs(report.suites); const scenario = all.find(spec => spec.title === 'S4-01 synthetic session control');
      expect(report.errors, run.stderr).toEqual([]);
      const failures = all.flatMap(spec => spec.tests.flatMap(test => test.results)).filter(result => result.status === 'failed');
      if (mode === 'valid') { expect(run.status, JSON.stringify(report)).toBe(0); expect(scenario?.tests[0]?.results[0]?.status).toBe('passed'); }
      else {
        expect(run.status).toBe(1); expect(failures.length).toBeGreaterThan(0);
        expect(scenario?.tests[0]?.results[0]?.status).not.toBe('passed');
        const blocked = ['missing', 'expired', 'notAuthenticated', 'invalidState', 'symlinkState', 'symlinkDirectory', 'fileDirectory', 'healthOff'].includes(mode);
        expect(failures.some(result => result.error?.message.includes(blocked ? 'S4 REAL E2E: BLOCKED' : 'S4 REAL E2E: FAIL'))).toBe(true);
        expect(report.errors).toEqual([]);
      }
    } finally { await new Promise<void>(resolve => { server.close(() => { resolve(); }); }); }
  });
});
