import path from 'node:path';

import { defineConfig } from '@playwright/test';

import { ARTIFACT_POLICY } from '../../e2e/support/artifact-policy';
import { DESKTOP_DEVICE, MOBILE_DEVICE } from '../../e2e/support/devices';

/**
 * Configuración SINTÉTICA del harness: misma política de artefactos que el gate real (trace/screenshot/video en off) y TODOS
 * los reporters que pueden persistir texto (list, line, dot, json, junit, html). La lanza
 * e2e-harness-tests/unit/synthetic-browser.test.ts con un entorno limpio y salidas en el directorio temporal del sistema.
 */

const outDir = process.env['HARNESS_OUT_DIR'];
if (outDir === undefined || outDir === '') {
  throw new Error('HARNESS_OUT_DIR es obligatorio (directorio temporal para los reportes sintéticos).');
}
const suite = process.env['HARNESS_SUITE'] === 'control' ? 'control' : 'secure';

export default defineConfig({
  testDir: path.join(import.meta.dirname, suite),
  outputDir: path.join(outDir, 'test-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: [
    ['list'],
    ['line'],
    ['dot'],
    ['json', { outputFile: path.join(outDir, 'report.json') }],
    ['junit', { outputFile: path.join(outDir, 'junit.xml') }],
    ['html', { open: 'never', outputFolder: path.join(outDir, 'html-report') }],
  ],
  use: { actionTimeout: 5_000, navigationTimeout: 15_000, ...ARTIFACT_POLICY },
  projects: [
    { name: 'harness-mobile', testIgnore: /desktop-.*\.spec\.ts$/, use: { ...MOBILE_DEVICE } },
    { name: 'harness-desktop', testMatch: /desktop-.*\.spec\.ts$/, use: { ...DESKTOP_DEVICE } },
  ],
});
