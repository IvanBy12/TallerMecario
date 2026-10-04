import { devices } from '@playwright/test';

function descriptor(name: string) {
  const device = devices[name];
  if (device === undefined) {
    throw new Error(`Perfil de dispositivo Playwright desconocido: ${name}`);
  }
  return device;
}

/** Rango de ancho CSS (px) que se considera «móvil» para el gate: teléfonos, no tablets ni escritorio. */
export const MOBILE_VIEWPORT_WIDTH_RANGE = { min: 320, max: 480 } as const;

function mobileDescriptor(name: string) {
  const device = descriptor(name);
  const { width } = device.viewport;
  if (!device.hasTouch || !device.isMobile || width < MOBILE_VIEWPORT_WIDTH_RANGE.min || width > MOBILE_VIEWPORT_WIDTH_RANGE.max) {
    // Falla al cargar la configuración: el gate móvil no puede degradarse en silencio a un perfil sin táctil.
    throw new Error(`El perfil ${name} no es un móvil táctil válido para el gate (hasTouch/isMobile/viewport).`);
  }
  return device;
}

/** Gate principal: Chromium móvil (Pixel 5: 393×727, táctil, user agent móvil, isMobile). */
export const MOBILE_DEVICE = mobileDescriptor('Pixel 5');
/** Smoke complementario; no sustituye al gate móvil. */
export const DESKTOP_DEVICE = descriptor('Desktop Chrome');
