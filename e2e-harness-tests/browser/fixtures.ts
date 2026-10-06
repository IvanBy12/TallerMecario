import { test as base } from '@playwright/test';

import { MARKER_ENV, SYNTHETIC_EMAIL } from '../helpers/markers';

import { startFakeClerk, type ClerkMode, type FakeClerk } from './fake-clerk-server';

interface Fixtures {
  clerkMode: ClerkMode;
  fakeClerk: FakeClerk;
}

export interface SyntheticCredentials {
  readonly email: string;
  readonly password: string;
}

/** Lee el marcador del entorno del proceso hijo: el valor NO está escrito en el código (un code frame no lo mostraría). */
function syntheticPassword(): string {
  const value = process.env[MARKER_ENV.password];
  if (value === undefined || value === '') {
    throw new Error('El harness debe lanzarse con el marcador sintético de contraseña definido (lo hace e2e-harness-tests/unit/synthetic-browser.test.ts).');
  }
  return value;
}

export function syntheticCredentials(): SyntheticCredentials {
  return { email: SYNTHETIC_EMAIL, password: syntheticPassword() };
}

// El segundo parámetro de un fixture de Playwright se llama `provide` (no `use`) para no confundirse con un React Hook.
export const test = base.extend<Fixtures>({
  clerkMode: ['single-step', { option: true }],
  fakeClerk: async ({ clerkMode }, provide) => {
    const server = await startFakeClerk(clerkMode, syntheticCredentials().password);
    try {
      await provide(server);
    } finally {
      await server.close();
    }
  },
  baseURL: async ({ fakeClerk }, provide) => {
    await provide(fakeClerk.baseURL);
  },
});

export { expect } from '@playwright/test';
