import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
const IDS = { other: '77777777-7777-4777-8777-777777777777' };
const TIME = '2026-10-01T15:04:05.123456Z';
const DETAIL = { receptionId: '22222222-2222-4222-8222-222222222222', vehicleId: '33333333-3333-4333-8333-333333333333',
  customerId: '44444444-4444-4444-8444-444444444444', appointmentId: null, locationId: null,
  receivedByMembershipId: '66666666-6666-4666-8666-666666666666', mileageKm: 100, fuelLevelPct: 40,
  customerNotes: null, advisorNotes: null, status: 'open', receivedAt: TIME, closedAt: null,
  createdAt: TIME, updatedAt: TIME, signature: null, serviceOrder: null, checklist: [], damages: [] };

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
const asset = '88888888-8888-4888-8888-888888888888';
const media = [
  { mediaAssetId: asset, mediaType: 'photo', mimeType: 'image/png', sizeBytes: 3, capturedAt: TIME, uploadedAt: TIME, purpose: 'intake_evidence', sortOrder: 0 },
  { mediaAssetId: IDS.other, mediaType: 'video360', mimeType: 'video/mp4', sizeBytes: 3, capturedAt: TIME, uploadedAt: TIME, purpose: 'intake_evidence', sortOrder: 1 },
];
async function prepare(page: Page, status = 200, ttl = 60000) {
  const seen = { lists: 0, downloads: 0, binaries: 0, storageCredentials: false };
  await page.route('https://api.gallery.example.test/**', async route => {
    const url = new URL(route.request().url());
    let data: unknown = { reception: DETAIL };
    let reply = 200;
    if (url.pathname.endsWith('/media')) { seen.lists++; data = { media }; }
    if (url.pathname.endsWith('/download-url')) {
      seen.downloads++; reply = status;
      const id = url.pathname.split('/').at(-2);
      data = status === 200 ? { mediaAssetId: id,
        downloadUrl: `https://storage.gallery.example.test/${id === asset ? 'photo' : 'video'}?signature=synthetic-${String(seen.downloads)}`,
        expiresAt: new Date(Date.now() + ttl).toISOString() } :
        { error: { code: 'MEDIA_ASSET_NOT_FOUND', request_id: 'synthetic-reference', message: 'PRIVATE STORAGE COPY' } };
    }
    await route.fulfill({ status: reply, contentType: 'application/json', body: JSON.stringify(data), headers: { 'Access-Control-Allow-Origin': origin } });
  });
  await page.route('https://storage.gallery.example.test/**', async route => {
    seen.binaries++;
    const headers = route.request().headers();
    seen.storageCredentials ||= 'authorization' in headers || 'cookie' in headers || 'x-tenant-id' in headers;
    await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': origin, 'Cache-Control': 'no-store' },
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=', 'base64') });
  });
  await page.goto(`${origin}/e2e-harness-tests/browser/fixtures/operational-gallery.html`);
  await expect(page.getByRole('button', { name: 'Ver Foto 1' })).toBeVisible();
  return seen;
}
for (const width of [390, 1280]) {
  test(`F07-C simulated gallery in Chromium width ${String(width)}: list, on-demand display, hide, new visit`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const seen = await prepare(page);
    expect(seen.downloads).toBe(0); expect(seen.binaries).toBe(0);
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Foto 1', 'Video 360° 2']);
    await page.getByRole('button', { name: 'Ver Foto 1' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('img')).toBeVisible();
    await expect.poll(() => page.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    expect(seen.downloads).toBe(1); expect(seen.binaries).toBe(1); expect(seen.storageCredentials).toBe(false);
    await page.getByRole('button', { name: 'Ocultar Foto 1' }).click();
    await expect(page.getByRole('img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver Video 360° 2' }).click();
    await expect(page.locator('video')).toHaveAttribute('preload', 'none');
    await expect(page.locator('video')).toHaveAttribute('controls', '');
    expect(seen.binaries).toBe(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Ver Foto 1' })).toBeVisible();
    expect(seen.lists).toBe(2); expect(seen.downloads).toBe(2);
    await expect(page.locator('img, video')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
test('F07-C Chromium removes capability at expiry and obtains a new one only on demand', async ({ page }) => {
  const seen = await prepare(page, 200, 1500);
  await page.getByRole('button', { name: 'Ver Foto 1' }).click();
  await expect(page.getByRole('img')).toBeVisible();
  await expect(page.getByText(/El acceso temporal expiró/)).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(0); expect(seen.downloads).toBe(1);
  await page.getByRole('button', { name: 'Ver Foto 1' }).click();
  await expect(page.getByRole('img')).toBeVisible(); expect(seen.downloads).toBe(2);
  await page.getByRole('button', { name: 'Cambiar identidad de prueba' }).click();
  await expect(page.getByRole('button', { name: 'Ver Foto 1' })).toBeVisible();
  await expect(page.getByRole('img')).toHaveCount(0);
});
test('F07-C Chromium inaccessible asset preserves reception and does not fetch a binary', async ({ page }) => {
  const seen = await prepare(page, 404);
  await page.getByRole('button', { name: 'Ver Foto 1' }).click();
  await expect(page.getByRole('alert')).toContainText('La evidencia no existe');
  expect(seen.downloads).toBe(1); expect(seen.binaries).toBe(0);
  await expect(page.getByText(`${String(DETAIL.mileageKm)} km`)).toBeVisible();
  await expect(page.getByText('PRIVATE STORAGE COPY')).toHaveCount(0);
});
