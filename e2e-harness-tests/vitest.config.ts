import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Suite del PROPIO harness E2E. No necesita Clerk, backend, R2 ni credenciales: sintetiza todo en local.
 * `npm run test:e2e:harness`. Es independiente de `npm test` (Vitest de producto, 597 tests, jsdom).
 */
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['e2e-harness-tests/unit/**/*.test.ts'],
    restoreMocks: true,
    // Los tests con navegador lanzan Playwright (Chromium) en un proceso hijo.
    testTimeout: 300_000,
    hookTimeout: 60_000,
  },
});
