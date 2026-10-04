import { expect, syntheticCredentials, test } from '../fixtures';

/**
 * CONTROL POSITIVO del escáner: usa deliberadamente `fill()` (la forma insegura que tenía el login) y falla. Sirve para probar
 * que el escáner del harness SÍ detecta el marcador en los reportes (HTML incluido, que lo guarda comprimido en base64).
 * Sin este control, un escáner ciego daría un falso «sin filtraciones».
 */
test('[control] fill(password) filtra el marcador a los reportes', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name="password"]').fill(syntheticCredentials().password);
  expect(1, 'fallo deliberado para que el reporte incluya los pasos').toBe(2);
});
