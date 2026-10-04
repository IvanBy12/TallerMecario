import { assertMobileRuntime } from '../../../e2e/support/mobile-runtime';
import { drawSignature } from '../../../e2e/support/reception-flow';
import { expect, test } from '../fixtures';

/** Contraejemplo: un navegador de escritorio NO puede pasar el gate móvil ni dibujar la firma con ratón como alternativa. */

test('escritorio: assertMobileRuntime falla (sin táctil y viewport ancho)', async ({ page }) => {
  await page.goto('/login');
  await expect(assertMobileRuntime(page)).rejects.toThrow(/no es móvil\/táctil/);
});

test('escritorio: drawSignature NO hace fallback a ratón', async ({ page }) => {
  await page.goto('/canvas');
  await expect(drawSignature(page)).rejects.toThrow(/exige un contexto táctil/);
});
