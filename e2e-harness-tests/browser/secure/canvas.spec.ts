import { drawSignature } from '../../../e2e/support/reception-flow';
import { expectSignatureInk, inkVerdict, measureSignatureInk } from '../../../e2e/support/signature-ink';
import { expect, test } from '../fixtures';

/** Verificación de tinta real con Chromium móvil (táctil) contra una réplica local del lienzo de firma de la aplicación. */

test.beforeEach(async ({ page }) => {
  await page.goto('/canvas');
});

test('canvas vacío → FAIL (aunque un PNG vacío pese > 0 bytes)', async ({ page }) => {
  const blobSize = await page.getByLabel('Firma manuscrita de recepción').evaluate(
    (canvas: HTMLCanvasElement) =>
      new Promise<number>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob?.size ?? 0);
        }, 'image/png');
      }),
  );
  expect(blobSize, 'un PNG vacío tiene tamaño positivo: blob.size NO es prueba de tinta').toBeGreaterThan(0);
  const metrics = await measureSignatureInk(page);
  expect(metrics.inkPixels).toBe(0);
  expect(inkVerdict(metrics).ok).toBe(false);
  await expect(expectSignatureInk(page)).rejects.toThrow(/no contiene tinta real/);
});

test('punto/toque insuficiente → FAIL', async ({ page }) => {
  const box = await page.getByLabel('Firma manuscrita de recepción').boundingBox();
  if (box === null) throw new Error('canvas sin caja');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const metrics = await measureSignatureInk(page);
  expect(metrics.inkPixels, 'el toque sí dibuja un punto').toBeGreaterThan(0);
  expect(inkVerdict(metrics).ok).toBe(false);
  await expect(expectSignatureInk(page)).rejects.toThrow(/no contiene tinta real/);
});

test('trazo real extendido con eventos táctiles → PASS, solo métricas', async ({ page }) => {
  await drawSignature(page);
  const metrics = await expectSignatureInk(page);
  expect(Object.keys(metrics).sort()).toEqual(['canvasHeight', 'canvasWidth', 'inkHeight', 'inkPixels', 'inkWidth']);
  expect(metrics.inkPixels).toBeGreaterThan(5_000);
  expect(metrics.inkWidth).toBeGreaterThan(metrics.canvasWidth * 0.5);
  expect(metrics.inkHeight).toBeGreaterThan(metrics.canvasHeight * 0.2);
});
