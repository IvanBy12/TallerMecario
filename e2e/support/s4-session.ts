import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { AUTH_DIR } from './env';
import { resolveS4Context, S4SessionUnavailable } from './s4-context';
import { S4CheckFailure } from './s4-media-evidence';
import { clearS4Page } from './s4-safe';
import { S4_STATE_FILE } from './s4-session-paths';
/** Private canonical Playwright states only. S3 files are read, never overwritten. */
export function s4StateCandidates(directory = AUTH_DIR): readonly string[] {
  if (!fs.existsSync(directory) || fs.lstatSync(directory).isSymbolicLink()) return [];
  return fs.readdirSync(directory).filter(name => name.endsWith('.json'))
    .sort((a, b) => a === 's4.json' ? -1 : b === 's4.json' ? 1 : a.localeCompare(b))
    .map(name => path.join(directory, name)).filter(file => {
      const stat = fs.lstatSync(file);
      return stat.isFile() && !stat.isSymbolicLink();
    });
}
async function persist(context: BrowserContext, directory: string): Promise<void> {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(directory).isSymbolicLink()) throw new S4CheckFailure('S4 BLOCKED: directorio de sesión inseguro.');
  fs.chmodSync(directory, 0o700);
  const state = await context.storageState();
  const fd = fs.openSync(path.join(directory, path.basename(S4_STATE_FILE)), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, JSON.stringify(state)); }
  finally { fs.closeSync(fd); }
}
async function clerkLoaded(page: Page) {
  await page.waitForFunction(() => {
    const clerk = Reflect.get(window, 'Clerk') as { loaded?: boolean } | undefined;
    return clerk?.loaded === true;
  }, undefined, { timeout: 30_000 });
}
/** A saved state is usable only after live Clerk and backend membership/permission checks. */
export async function authenticateS4(browser: Browser, baseURL: string, directory = AUTH_DIR): Promise<void> {
  for (const state of s4StateCandidates(directory)) {
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    try {
      context = await browser.newContext({ baseURL, storageState: state });
      page = await context.newPage();
      await page.goto('/login');
      if (new URL(page.url()).origin !== new URL(baseURL).origin) throw new S4CheckFailure('S4 BLOCKED: login en frontend distinto del aprobado.');
      await clerkLoaded(page);
      await resolveS4Context(page);
      await persist(context, directory);
      return;
    } catch (error) {
      // Bad JSON/state initialization and expired/unauthorized identities may try the next saved state.
      // Service, contract and persistence failures must not masquerade as an expired session.
      if (page !== undefined && !(error instanceof S4SessionUnavailable)) {
        if (error instanceof S4CheckFailure) throw error;
        throw new S4CheckFailure('S4 BLOCKED: no se pudo cargar/validar/guardar sesión; comprobar Clerk/API y archivo privado.');
      }
    }
    finally { if (page) await clearS4Page(page); await context?.close(); }
  }
  if (process.env['E2E_S4_INTERACTIVE_LOGIN'] !== '1') {
    throw new S4CheckFailure('S4 BLOCKED: ninguna sesión autorizada válida; ejecutar e2e:s4:auth con E2E_S4_INTERACTIVE_LOGIN=1 para login manual Development.');
  }
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/login');
    if (new URL(page.url()).origin !== new URL(baseURL).origin) throw new S4CheckFailure('S4 BLOCKED: login en frontend distinto del aprobado.');
    await clerkLoaded(page);
    console.log('S4: inicia sesión manualmente en el navegador con una cuenta Development existente. No pegues credenciales en el terminal.');
    await page.waitForFunction(() => {
      const clerk = Reflect.get(window, 'Clerk') as { session?: { status?: string } } | undefined;
      return clerk?.session?.status === 'active';
    }, undefined, { timeout: 540_000 });
    await resolveS4Context(page);
    await persist(context, directory);
  } finally { await clearS4Page(page); await context.close(); }
}
