import { test } from '@playwright/test';
import { requireS4ApiReady } from './support/s4-readiness';
import { verifyS4Frontend } from './support/s4-frontend';
import { requireS4Preflight, s4Origins } from './support/s4-preflight';
import { authenticateS4 } from './support/s4-session';
import { clearS4Page, s4Safe } from './support/s4-safe';

test.afterEach(async ({ page }) => { await clearS4Page(page); });
test('S4: preflight y una sesión Development autorizada', async ({ page, browser, baseURL }) => {
  test.setTimeout(process.env['E2E_S4_INTERACTIVE_LOGIN'] === '1' ? 600_000 : 240_000);
  await s4Safe(page, 'preflight y autenticación de una cuenta', async () => {
    requireS4Preflight();
    await requireS4ApiReady(page.request, s4Origins().api);
    await verifyS4Frontend(page.request);
    await authenticateS4(browser, baseURL ?? s4Origins().frontend);
  });
});
