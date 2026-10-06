import { assertMobileRuntime } from '../../../e2e/support/mobile-runtime';
import { expect, test } from '../fixtures';

test('el proyecto móvil es táctil y su viewport está en rango móvil (runtime del navegador)', async ({ page }, testInfo) => {
  expect(testInfo.project.use.hasTouch).toBe(true);
  expect(testInfo.project.use.isMobile).toBe(true);
  await page.goto('/login');
  const metrics = await assertMobileRuntime(page);
  expect(metrics.maxTouchPoints).toBeGreaterThan(0);
  expect(metrics.innerWidth).toBeLessThanOrEqual(480);
});
