import type { Page } from '@playwright/test';
import { S4CheckFailure } from './s4-media-evidence';
class S4RunFailure extends Error {
  constructor(label: string, detail: string, blocked: boolean) {
    super(`S4 REAL E2E: ${blocked ? 'BLOCKED' : 'FAIL'} — ${label}.${detail} Consultar únicamente la evidencia HTTP sanitizada.`);
    this.name = 'S4RunFailure';
  }
}
export async function clearS4Page(page: Page): Promise<void> {
  await page.goto('about:blank', { timeout: 3_000 }).catch(async () => { await page.context().close().catch(() => undefined); });
}
/** Replace errors before reporters can serialize DOM/HTTP call logs; abandon the sensitive page first. */
export async function s4Safe(page: Page, label: string, run: () => Promise<void>): Promise<void> {
  try { await run(); }
  catch (error) {
    await clearS4Page(page);
    throw new S4RunFailure(label, error instanceof S4CheckFailure ? ` ${error.message}` : '',
      error instanceof S4CheckFailure && error.message.startsWith('S4 BLOCKED:'));
  }
}
