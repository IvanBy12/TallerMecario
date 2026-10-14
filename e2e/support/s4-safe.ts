import type { Page } from '@playwright/test';
import { S4CheckFailure } from './s4-media-evidence';
class S4RunFailure extends Error {
  constructor(label: string, detail: string, readonly classification: 'FAIL' | 'BLOCKED') {
    super(`S4 REAL E2E: ${classification} — ${label}.${detail} Consultar únicamente la evidencia HTTP sanitizada.`);
    this.name = 'S4RunFailure';
  }
}
// Explicit bootstrap classifications take precedence; legacy health/environment checks retain their behavior.
export function classifyS4Failure(error: unknown): 'FAIL' | 'BLOCKED' {
  if (!(error instanceof S4CheckFailure)) return 'FAIL';
  return error.classification ?? (error.message.startsWith('S4 BLOCKED:') ? 'BLOCKED' : 'FAIL');
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
      classifyS4Failure(error));
  }
}
