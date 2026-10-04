import { recordNetwork } from '../../../e2e/support/network-evidence';
import { MARKER_ENV, SYNTHETIC_MARKERS } from '../../helpers/markers';
import { expect, test } from '../fixtures';

/**
 * Evidencia de red con el adaptador REAL de Playwright (Response → colector). El servidor local devuelve una uploadUrl firmada
 * con el marcador de query firmada y una cookie con el marcador de cookie, y la petición lleva un Authorization sintético.
 * La evidencia se ADJUNTA al reporte: si algún secreto se colara, el escáner lo encontraría en los reportes.
 */
test('el colector sanitiza token, cookie y query firmada aunque pasen por el navegador', async ({ page, fakeClerk }, testInfo) => {
  const evidence = recordNetwork(page, fakeClerk.baseURL);
  await page.goto('/login');
  const token = process.env[MARKER_ENV.token] ?? 'missing';
  const status = await page.evaluate(async (bearer) => {
    const response = await fetch('/api/v1/media/upload-sessions', {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify({ mediaType: 'signature' }),
    });
    return response.status;
  }, token);
  expect(status).toBe(201);
  await evidence.settled();

  const entry = evidence.find('POST', '/api/v1/media/upload-sessions');
  expect(entry?.status).toBe(201);
  expect(entry?.facts).toEqual({ returnedUploadSession: true, returnedSignedUploadUrl: true });
  const serialized = JSON.stringify(evidence);
  for (const marker of Object.values(SYNTHETIC_MARKERS)) {
    expect(serialized.includes(marker), 'la evidencia serializada contiene un marcador sintético').toBe(false);
  }
  expect(serialized).not.toMatch(/https?:\/\/|X-Amz|Bearer|Authorization|"uploadUrl"/i);
  await testInfo.attach('sanitized-evidence', { body: serialized, contentType: 'application/json' });
});
