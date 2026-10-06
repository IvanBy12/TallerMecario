import type { Browser, BrowserContext, Page } from '@playwright/test';

import { MOBILE_DEVICE } from './devices';
import { STATE_FILES, type PersonaKey } from './env';

export interface PersonaSession {
  readonly context: BrowserContext;
  readonly page: Page;
}

/** Contexto móvil independiente con la sesión real de otra persona (guardada por el proyecto `setup`). */
export async function openPersona(browser: Browser, baseURL: string | undefined, persona: PersonaKey): Promise<PersonaSession> {
  const context = await browser.newContext({
    ...MOBILE_DEVICE,
    ...(baseURL === undefined ? {} : { baseURL }),
    storageState: STATE_FILES[persona],
  });
  const page = await context.newPage();
  return { context, page };
}
