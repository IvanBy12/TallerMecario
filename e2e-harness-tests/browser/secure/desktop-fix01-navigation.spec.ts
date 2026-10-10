import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  server = await createServer({ configFile: path.resolve('vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false } });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('Synthetic Vite URL missing');
  origin = url.replace(/\/$/, '');
});
test.afterAll(async () => { await server.close(); });

async function prepare(page: Page, stage: string, forward = false) {
  await page.goto(`${origin}/e2e-harness-tests/browser/fixtures/navigation.html?stage=${stage}`);
  await page.getByRole('button', { name: 'Open intake' }).click();
  if (forward) { await page.getByRole('button', { name: 'Programmatic exit' }).click(); await page.goBack(); }
  await page.getByLabel('Buscar vehículo por placa').fill('ABC123');
  await page.getByRole('button', { name: 'Buscar vehículo', exact: true }).click();
  await page.getByRole('button', { name: /ABC123 —/ }).click();
  await page.getByRole('button', { name: 'Consultar propietario vigente' }).click();
  await page.getByRole('button', { name: /Confirmar propietario/ }).click();
  await page.getByLabel('Kilometraje (km)').fill('101');
  await page.getByRole('button', { name: 'Mostrar aviso para capturar evidencia' }).click();
  await page.getByLabel('El propietario declara ser mayor de edad para la captura de evidencia.').check();
  for (const checkbox of await page.getByLabel('He leído este aviso').all()) await checkbox.check();
  await page.getByLabel('Seleccionar fotos').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5O8AAAAASUVORK5CYII=', 'base64') });
  if (stage !== 'local') {
    await page.getByRole('button', { name: 'Crear recepción', exact: true }).click();
    await expect(page.getByText('Recepción creada. Ahora puedes completar la carga de la evidencia.')).toBeVisible();
    await page.getByRole('button', { name: 'Subir foto 1' }).click();
    await expect(page.getByText(stage === 'uploading' ? 'Subiendo el archivo.' : 'Carga activa. Asociando evidencia a la recepción…')).toBeVisible();
  }
}
async function exit(page: Page, direction: string) {
  if (direction === 'Back') await page.goBack();
  else if (direction === 'Forward') await page.goForward();
  else await page.getByRole('button', { name: 'Programmatic exit' }).click();
}
for (const stage of ['local', 'uploading', 'associating']) {
  for (const direction of ['Back', 'Forward', 'programmatic']) {
    for (const accept of [false, true]) {
      test(`FIX-01 actual Chromium ${direction}, ${stage}, accept=${String(accept)}`, async ({ page }) => {
        await prepare(page, stage, direction === 'Forward');
        const preview = await page.getByRole('img').getAttribute('src');
        await exit(page, direction);
        await expect(page.getByRole('dialog')).toHaveCount(1);
        await page.getByRole('button', { name: accept ? 'Salir y descartar archivos locales' : 'Permanecer aquí' }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        if (accept) {
          await expect(page).toHaveURL(`${origin}/${direction === 'Back' ? 'panel' : 'vehiculos'}`);
          await expect(page.getByRole('img')).toHaveCount(0);
          await expect(page.getByTestId('metrics')).toContainText('"revoked":1');
          if (stage !== 'local') await expect(page.getByTestId('metrics')).toContainText('"canceled":1');
        } else {
          await expect(page).toHaveURL(`${origin}/recepciones/nueva`);
          await expect(page.getByRole('img')).toHaveAttribute('src', preview ?? 'missing');
          await expect(page.getByTestId('metrics')).toContainText('"revoked":0');
          await expect(page.getByTestId('metrics')).toContainText('"canceled":0');
          // A second real history attempt after rejection still targets the same entry.
          await exit(page, direction); await expect(page.getByRole('dialog')).toHaveCount(1);
          await page.getByRole('button', { name: 'Permanecer aquí' }).click();
          await expect(page).toHaveURL(`${origin}/recepciones/nueva`);
        }
        await expect(page.getByTestId('metrics')).toContainText(`"created":${stage === 'local' ? '0' : '1'}`);
        await expect(page.getByTestId('metrics')).toContainText(`"uploaded":${stage === 'local' ? '0' : '1'}`);
        await expect(page.getByTestId('metrics')).toContainText(`"attached":${stage === 'associating' ? '1' : '0'}`);
      });
    }
  }
}
for (const action of ['Cambiar taller', 'Cerrar sesión']) {
  test(`FIX-01 Chromium ${action} rejects then accepts once during PUT`, async ({ page }) => {
    await prepare(page, 'uploading');
    await page.getByRole('button', { name: action }).click();
    await page.getByRole('button', { name: 'Permanecer aquí' }).click();
    await expect(page.getByTestId('metrics')).toContainText('"switched":0');
    await expect(page.getByTestId('metrics')).toContainText('"signedOut":0');
    await expect(page.getByTestId('metrics')).toContainText('"canceled":0');
    await page.getByRole('button', { name: action }).click();
    await page.getByRole('button', { name: 'Salir y descartar archivos locales' }).click();
    await expect(page.getByTestId('metrics')).toContainText(action === 'Cambiar taller' ? '"switched":1' : '"signedOut":1');
    await expect(page.getByTestId('metrics')).toContainText('"canceled":1');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}
test('FIX-01 Chromium external session invalidation cancels without confirmation', async ({ page }) => {
  await prepare(page, 'associating');
  await page.getByRole('button', { name: 'External session invalidation' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('img')).toHaveCount(0);
  await expect(page.getByTestId('metrics')).toContainText('"revoked":1');
  await expect(page.getByTestId('metrics')).toContainText('"canceled":1');
});

test('FIX-01 Chromium beforeunload rejects reload and preserves the pending preview', async ({ page }) => {
  await prepare(page, 'local');
  const preview = await page.getByRole('img').getAttribute('src');
  const warned = new Promise<string>(resolve => {
    page.once('dialog', dialog => { void dialog.dismiss().then(() => { resolve(dialog.type()); }); });
  });
  // A rejected reload has no load event. Trigger the actual browser action without waiting for a new document.
  await page.evaluate(() => { window.location.reload(); });
  expect(await warned).toBe('beforeunload');
  await expect(page).toHaveURL(`${origin}/recepciones/nueva`);
  await expect(page.getByRole('img')).toHaveAttribute('src', preview ?? 'missing');
  await expect(page.getByTestId('metrics')).toContainText('"revoked":0');
});
