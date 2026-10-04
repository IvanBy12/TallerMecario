import { devices } from '@playwright/test';

function descriptor(name: string) {
  const device = devices[name];
  if (device === undefined) {
    throw new Error(`Perfil de dispositivo Playwright desconocido: ${name}`);
  }
  return device;
}

/** Gate principal: Chromium móvil (Pixel 5: 393×727, táctil, user agent móvil, isMobile). */
export const MOBILE_DEVICE = descriptor('Pixel 5');
/** Smoke complementario; no sustituye al gate móvil. */
export const DESKTOP_DEVICE = descriptor('Desktop Chrome');
