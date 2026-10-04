import { expect, test } from '@playwright/test';

import { goToSection, openApp } from './support/reception-flow';

/**
 * Smoke complementario de escritorio (solo lectura, sin mutaciones). NO sustituye al gate móvil: ese gate vive en el
 * proyecto `mobile-chromium` (e2e/s3-*.spec.ts).
 */

test('escritorio: sesión real, taller activo y pantalla de nueva recepción', async ({ page }) => {
  await openApp(page);
  await goToSection(page, 'Recepciones');
  await expect(page.getByRole('heading', { name: 'Recepciones', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Nueva recepción', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nueva recepción' })).toBeVisible();
  await expect(page.getByLabel('Buscar vehículo por placa', { exact: true })).toBeVisible();
});
