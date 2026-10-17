import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium, type APIRequestContext } from '@playwright/test';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';
import { S4CheckFailure } from '../../e2e/support/s4-media-evidence';
import { requireS4ApiReady } from '../../e2e/support/s4-readiness';
import { s4Safe } from '../../e2e/support/s4-safe';
import { matchesS4Frontend, verifyS4Frontend } from '../../e2e/support/s4-frontend';
import { s4PreflightProblems } from '../../e2e/support/s4-preflight';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-s4-review-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
const secret = 'SYNTHETIC_PRIVATE_DO_NOT_REPORT';
const source = { VITE_API_BASE_URL: 'https://api.example.invalid', VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic' };
function moduleText(overrides: Record<string, unknown> = {}) {
  return `import.meta.env = ${JSON.stringify({ PROD: false, ...source, ...overrides })};`;
}
async function listen(server: http.Server) {
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const addr = server.address(); if (!addr || typeof addr === 'string') throw new Error('Synthetic server failed');
  return `http://127.0.0.1:${String(addr.port)}`;
}
describe('H-1: sanitized readiness classification at the actual safe boundary', () => {
  it('only connectivity from health GET is BLOCKED; HTTP, contracts, auth/privacy and product errors stay distinguishable', async () => {
    let status = 200;
    let body: unknown = { status: 'ready', checks: { database: true } };
    const server = http.createServer((_req, res) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(typeof body === 'string' ? body : JSON.stringify(body)); });
    const origin = await listen(server);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const safeError = async (run: () => Promise<void>) => {
        const error: unknown = await s4Safe(page, 'readiness', run).catch((error: unknown) => error);
        expect(error).toBeInstanceOf(Error);
        if (!(error instanceof Error)) throw new Error('Expected failure');
        expect(error.message).not.toContain(secret);
        return error.message;
      };
      await expect(s4Safe(page, 'readiness', () => requireS4ApiReady(page.request, origin))).resolves.toBeUndefined();
      for (const value of [503, 401, 403]) {
        status = value;
        const message = await safeError(() => requireS4ApiReady(page.request, origin));
        expect(message).toContain('S4 REAL E2E: FAIL');
        if (value === 401) expect(message).toContain('autenticación rechazada');
        if (value === 403) expect(message).toContain('acceso/permiso rechazado');
      }
      status = 200;
      for (const value of [{ status: 'ready', checks: { database: false } }, { status: secret }, secret]) {
        body = value;
        expect(await safeError(() => requireS4ApiReady(page.request, origin))).toContain('S4 REAL E2E: FAIL');
      }
      await new Promise<void>(resolve => { server.close(() => { resolve(); }); });
      expect(await safeError(() => requireS4ApiReady(page.request, origin))).toContain('S4 REAL E2E: BLOCKED');
      for (const error of [Object.assign(new Error(secret), { code: 'ETIMEDOUT' }), new Error(`apiRequestContext.get: Timeout 10000ms exceeded. ${secret}`)]) {
        const get: APIRequestContext['get'] = () => Promise.reject(error);
        expect(await safeError(() => requireS4ApiReady({ get }, origin))).toContain('S4 REAL E2E: BLOCKED');
      }
      // Outside the health GET, a timeout/functional exception must not masquerade as infra.
      for (const error of [new Error(`ETIMEDOUT ${secret}`), new S4CheckFailure('Producto incorrecto.'), new S4CheckFailure('Autenticación rechazada.'), new S4CheckFailure('Privacidad/permisos rechazados.')]) {
        expect(await safeError(() => Promise.reject(error))).toContain('S4 REAL E2E: FAIL');
      }
    } finally {
      await browser.close();
      if (server.listening) await new Promise<void>(resolve => { server.close(() => { resolve(); }); });
    }
  });
});
describe('H-3/H-4: effective frontend and explicit S4 environment allowlist', () => {
  it.each(['local', 'development', 'test', ' LOCAL ', 'DeVeLoPmEnT', ' TEST ', '', '   ', undefined])('allows %j, preserving absent local default', value => {
    expect(s4PreflightProblems({ ...source, VITE_APP_ENV: value }).some(p => p.startsWith('VITE_APP_ENV:'))).toBe(false);
    // Partial configuration still cannot pass the entire preflight.
    expect(s4PreflightProblems({ ...source, VITE_APP_ENV: value }).length).toBeGreaterThan(0);
  });
  it.each(['production', ' Production ', 'PROD', 'prod', 'staging', 'preview', 'unknown'])('rejects %j', value => {
    expect(s4PreflightProblems({ ...source, VITE_APP_ENV: value }).some(p => p.startsWith('VITE_APP_ENV:'))).toBe(true);
  });
  it('checks the parsed effective env, rejecting mismatched API/Clerk, PROD and uninspectable/comment-only modules', () => {
    expect(matchesS4Frontend(moduleText(), source)).toBe(true);
    for (const text of [moduleText({ PROD: true }), moduleText({ VITE_API_BASE_URL: 'https://different.example.invalid' }),
      moduleText({ VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_different' }), moduleText({ VITE_APP_ENV: 'production' }),
      `// ${moduleText()}\nconsole.log('synthetic');`, '<html>external static app</html>', moduleText() + moduleText()]) {
      expect(matchesS4Frontend(text, source)).toBe(false);
    }
  });
  it('an external frontend with another configuration blocks before any mutation, with fixed copy', async () => {
    let mutations = 0;
    const server = http.createServer((req, res) => { if (req.method !== 'GET') mutations++; res.end(moduleText({ VITE_API_BASE_URL: `https://${secret}.invalid` })); });
    const origin = await listen(server);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await expect(verifyS4Frontend(page.request, { ...source, E2E_BASE_URL: origin, E2E_S4_R2_ORIGIN: 'https://test.r2.cloudflarestorage.com' })).rejects.toThrow('S4 BLOCKED: frontend cargado no coincide');
      expect(mutations).toBe(0);
    } finally { await browser.close(); await new Promise<void>(resolve => { server.close(() => { resolve(); }); }); }
  });
});

function pendingStructure(text: string): boolean {
  const ast = ts.createSourceFile('spec.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const matching = ast.statements.filter(ts.isExpressionStatement).map(s => s.expression).filter(ts.isCallExpression)
    .filter(call => call.arguments[0] && ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text.startsWith('S4-03'));
  const call = matching[0];
  return matching.length === 1 && call !== undefined && ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) && call.expression.expression.text === 'test' && call.expression.name.text === 'skip' &&
    call.arguments.length === 2 && call.arguments[0] !== undefined && ts.isStringLiteral(call.arguments[0]) &&
    call.arguments[0].text.startsWith('S4-03 PENDING:') && call.arguments[1] !== undefined && ts.isArrowFunction(call.arguments[1]) &&
    ts.isBlock(call.arguments[1].body) && call.arguments[1].body.statements.length === 0;
}
const reporter = path.join(tmp, 'inventory.cjs');
fs.writeFileSync(reporter, `module.exports = class { onBegin(config, suite) {
  console.log(JSON.stringify({ server: config.webServer && { reuse: config.webServer.reuseExistingServer, command: config.webServer.command, url: config.webServer.url },
    baseURL: config.projects.find(p => p.name === 's4-media-chromium').use.baseURL,
    tests: suite.allTests().map(t => ({ title: t.title, expectedStatus: t.expectedStatus })) }));
} };`);
function discovery(external?: string) {
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const child = spawnSync(process.execPath, [cli, 'test', '--config', path.resolve('playwright.s4.config.ts'), '--project=s4-media-chromium', '--list', '--reporter', reporter], {
    cwd: tmp, env: { PATH: process.env['PATH'], HOME: process.env['HOME'], ...(external ? { E2E_BASE_URL: external } : {}) }, encoding: 'utf8', timeout: 30_000,
  });
  expect(child.status).toBe(0);
  return JSON.parse(child.stdout.trim()) as { server: { reuse: boolean; command: string; url: string } | null; baseURL: string; tests: { title: string; expectedStatus: string }[] };
}
describe('H-3/H-6: actual configuration/discovery and pending invariance', () => {
  it('S4 never reuses a local Vite, uses strict port; an external baseURL starts no Vite', () => {
    const local = discovery();
    expect(local.server?.reuse).toBe(false);
    expect(local.server?.command).toContain('--strictPort');
    expect(local.server?.url).toBe('http://localhost:5173');
    const external = discovery('https://frontend.example.invalid');
    expect(external.server).toBeNull();
    expect(external.baseURL).toBe('https://frontend.example.invalid');
  });
  it('discovers exactly six S4 cases; S4-03 is expected skipped, other five passed is expectation only', () => {
    const cases = discovery().tests.filter(test => /^S4-\d\d /.test(test.title));
    expect(cases.map(test => test.title.slice(0, 5))).toEqual(['S4-01', 'S4-02', 'S4-03', 'S4-04', 'S4-05', 'S4-06']);
    expect(cases.filter(test => test.expectedStatus === 'skipped').map(test => test.title.slice(0, 5))).toEqual(['S4-03']);
    expect(cases.find(test => test.title.startsWith('S4-03'))?.title).toContain('PENDING:');
  });
  it('AST requires unconditional test.skip with nonexecutable body; removing/changing skip or comment-only evidence fails', () => {
    const spec = fs.readFileSync('e2e/s4-media.spec.ts', 'utf8');
    expect(pendingStructure(spec)).toBe(true);
    for (const mutation of [spec.replace("test.skip('S4-03", "test('S4-03"), spec.replace("test.skip('S4-03", "test.fixme('S4-03"),
      spec.replace("test.skip('S4-03", "test.skip(true, 'S4-03"), spec.replace('S4-03 PENDING:', 'S4-03 READY:'),
      spec.replace(/test\.skip\('S4-03[^]*?\n\}\);/, "// test.skip('S4-03 PENDING: comment')")]) expect(pendingStructure(mutation)).toBe(false);
    const row = fs.readFileSync('docs/quality/s4-f07-d-real-media-e2e.md', 'utf8').split('\n').filter(line => line.startsWith('| S4-03 '));
    expect(row).toHaveLength(1);
    expect(row[0]?.split('|').at(-2)?.trim()).toBe('PENDING; jamás PASS');
  });
});
