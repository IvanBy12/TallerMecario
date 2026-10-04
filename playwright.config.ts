import fs from 'node:fs';

import { defineConfig } from '@playwright/test';

import { DESKTOP_DEVICE, MOBILE_DEVICE } from './e2e/support/devices';
import { STATE_FILES } from './e2e/support/env';

/**
 * E2E REAL del gate de Sprint 3 (recepción). Prohibido interceptar o simular /api/v1/*, Clerk, R2 o cualquier
 * endpoint: el navegador habla con los servicios del ambiente de PRUEBA. Ver docs/quality/s3-mobile-e2e.md.
 *
 * Las variables privadas (`E2E_*`) viven en `.env.e2e` (ignorado por git) o en el entorno del runner.
 * `process.loadEnvFile` no pisa variables ya definidas en el entorno.
 */
if (fs.existsSync('.env.e2e')) {
  process.loadEnvFile('.env.e2e');
}

const externalBaseUrl = process.env['E2E_BASE_URL']?.trim();
const baseURL = externalBaseUrl !== undefined && externalBaseUrl !== '' ? externalBaseUrl : 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  // Las pruebas mutan un ambiente compartido y dependen del orden del flujo: un solo worker, sin reintentos automáticos.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: process.env['CI'] !== undefined,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    // Sin trace ni video: registran cabeceras Authorization/cookies y las URL firmadas de R2.
    // La evidencia técnica sale de e2e/support/network-evidence.ts, que solo guarda método, ruta con IDs
    // enmascarados y estado HTTP. Las capturas son solo ante fallo.
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      // El formulario de login contiene el correo y la contraseña tecleados: nunca se captura.
      use: { screenshot: 'off' },
    },
    {
      name: 'mobile-chromium',
      testMatch: /[\\/]e2e[\\/]s3-[^\\/]*\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...MOBILE_DEVICE },
    },
    {
      name: 'desktop-smoke',
      testMatch: /desktop-smoke\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...DESKTOP_DEVICE, storageState: STATE_FILES.advisor },
    },
  ],
  webServer:
    externalBaseUrl !== undefined && externalBaseUrl !== ''
      ? undefined
      : {
          command: 'npm run dev -- --host localhost',
          url: baseURL,
          reuseExistingServer: process.env['CI'] === undefined,
          timeout: 120_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
});
