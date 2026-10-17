import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { loadS4PublicEnv } from './e2e/support/s4-environment';
import { MOBILE_DEVICE } from './e2e/support/devices';
import { S4_STATE_FILE } from './e2e/support/s4-session-paths';
import { requireS4Preflight } from './e2e/support/s4-preflight';

loadS4PublicEnv();

// Fail before webServer/login/browser, including --no-deps. --list is inventory only.
if (!process.argv.includes('--list')) requireS4Preflight();
const externalFrontend = Boolean(process.env['E2E_BASE_URL']?.trim());
const frontend = new URL(process.env['E2E_BASE_URL']?.trim() || 'http://localhost:5173').origin;
// base was evaluated before the S4 public env loader; override its effective server/baseURL.
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: frontend },
  webServer: externalFrontend ? [] : {
    command: 'npm run dev -- --host localhost --strictPort',
    url: frontend, reuseExistingServer: false, timeout: 120_000, stdout: 'ignore', stderr: 'pipe',
    env: { VITE_APP_ENV: process.env['VITE_APP_ENV']?.trim().toLowerCase() || 'local' },
  },
  reporter: [['list']],
  projects: [
    { name: 's4-setup', testMatch: /s4\.setup\.ts$/, use: { ...MOBILE_DEVICE, headless: process.env['E2E_S4_INTERACTIVE_LOGIN'] !== '1' } },
    { name: 's4-media-chromium', testMatch: /s4-media\.spec\.ts$/, dependencies: ['s4-setup'], use: { ...MOBILE_DEVICE, storageState: S4_STATE_FILE } },
  ],
});
