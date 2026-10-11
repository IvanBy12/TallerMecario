import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { MOBILE_DEVICE } from './e2e/support/devices';
import { STATE_FILES } from './e2e/support/env';
import { requireS4Preflight } from './e2e/support/s4-preflight';

// Fail before webServer/login/browser, including --no-deps. --list is inventory only.
if (!process.argv.includes('--list')) requireS4Preflight();
export default defineConfig(base, {
  reporter: [['list']],
  projects: [
    { name: 's4-setup', testMatch: /s4\.setup\.ts$/, use: { ...MOBILE_DEVICE } },
    { name: 's4-media-chromium', testMatch: /s4-media\.spec\.ts$/, dependencies: ['s4-setup'], use: { ...MOBILE_DEVICE, storageState: STATE_FILES.advisor } },
  ],
});
