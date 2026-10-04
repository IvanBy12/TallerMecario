import { expect, test } from '@playwright/test';

import { field, probeApi, type ProbeResponse } from './support/api-probe';
import { expectWorkshopShell } from './support/clerk-login';
import { e2eEnv, STATE_FILES } from './support/env';
import { openPersona } from './support/persona';

/**
 * E2E-05 — aislamiento entre talleres con un recurso REAL del taller B (no un ID inventado). Control: la sesión del usuario B
 * lee esa recepción (200), de modo que la denegación posterior a A prueba aislamiento y no inexistencia. Sin interceptar red.
 * Contrato: recurso ajeno ≡ inexistente (404 RECEPTION_NOT_FOUND, mismo envelope); tenant ajeno sin membership → 403 de tenant.
 */

test.use({ storageState: STATE_FILES.advisor });

const ERROR_ENVELOPE_KEYS = ['error'];

function expectOnlyErrorEnvelope(response: ProbeResponse): void {
  expect(response.json !== null && typeof response.json === 'object' ? Object.keys(response.json) : null).toEqual(ERROR_ENVELOPE_KEYS);
}

test('E2E-05 cross-tenant: el asesor de A no accede ni obtiene datos de la recepción real de B', async ({ page, browser }, testInfo) => {
  const env = e2eEnv();
  const targetPath = `/api/v1/receptions/${env.tenantBReceptionId}`;
  const leaked: unknown[] = [];

  const b = await openPersona(browser, testInfo.project.use.baseURL, 'tenantB');
  let controlBody: unknown;
  try {
    await b.page.goto('/panel');
    await expectWorkshopShell(b.page);
    await test.step('control: B sí puede leer su recepción (el recurso existe)', async () => {
      const control = await probeApi(b.page, env.apiOrigin, { method: 'GET', path: targetPath, tenantId: env.tenantBId });
      expect(control.status).toBe(200);
      expect(field(control.json, 'reception', 'receptionId')).toBe(env.tenantBReceptionId);
      controlBody = field(control.json, 'reception');
    });
  } finally {
    await b.context.close();
  }

  await page.goto('/panel');
  await expectWorkshopShell(page);

  await test.step('precondición: el usuario de A no es miembro de B', async () => {
    const me = await probeApi(page, env.apiOrigin, { method: 'GET', path: '/api/v1/me', tenantId: env.tenantId });
    const memberships = field(me.json, 'memberships');
    const tenantIds = Array.isArray(memberships) ? memberships.map((item: unknown) => field(item, 'tenantId')) : [];
    expect(tenantIds).not.toContain(env.tenantBId);
  });

  await test.step('UI: abrir directamente la URL de la recepción de B no muestra datos ajenos', async () => {
    const detailResponse = page.waitForResponse((response) => response.url().endsWith(targetPath) && response.request().method() === 'GET');
    await page.goto(`/recepciones/${env.tenantBReceptionId}`);
    const response = await detailResponse;
    expect(response.status()).toBe(404);
    const body: unknown = await response.json();
    leaked.push(body);
    expect(Object.keys(body as object)).toEqual(ERROR_ENVELOPE_KEYS);
    expect(field(body, 'error', 'code')).toBe('RECEPTION_NOT_FOUND');
    await expect(page.getByText('No se encontró la recepción o no está disponible para tu acceso.')).toBeVisible();
    for (const label of ['Kilometraje', 'Combustible', 'Recibido', 'Checklist', 'Firma de recepción']) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByText(/Orden #/)).toHaveCount(0);
  });

  await test.step('servidor real: lecturas y escritura no destructiva sobre el recurso de B', async () => {
    const inA = await probeApi(page, env.apiOrigin, { method: 'GET', path: targetPath, tenantId: env.tenantId });
    leaked.push(inA.json);
    expect({ status: inA.status, code: inA.code }).toEqual({ status: 404, code: 'RECEPTION_NOT_FOUND' });
    expectOnlyErrorEnvelope(inA);

    const asB = await probeApi(page, env.apiOrigin, { method: 'GET', path: targetPath, tenantId: env.tenantBId });
    leaked.push(asB.json);
    expect(asB.status).toBe(403);
    expect(['TENANT_ACCESS_DENIED', 'ACTIVE_MEMBERSHIP_REQUIRED']).toContain(asB.code);
    expectOnlyErrorEnvelope(asB);

    // Token de versión obsoleto a propósito: aun si el aislamiento fallara, la respuesta sería 409 y no modificaría nada.
    const patch = await probeApi(page, env.apiOrigin, {
      method: 'PATCH',
      path: targetPath,
      tenantId: env.tenantId,
      body: { expectedUpdatedAt: '2000-01-01T00:00:00.000000Z', advisorNotes: 'E2E-CROSS-TENANT no debe persistir' },
    });
    leaked.push(patch.json);
    expect({ status: patch.status, code: patch.code }).toEqual({ status: 404, code: 'RECEPTION_NOT_FOUND' });
    expectOnlyErrorEnvelope(patch);
  });

  await test.step('el listado de A no contiene la recepción de B', async () => {
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
      const query = cursor === null ? '?limit=25' : `?limit=25&cursor=${encodeURIComponent(cursor)}`;
      const list = await probeApi(page, env.apiOrigin, { method: 'GET', path: `/api/v1/receptions${query}`, tenantId: env.tenantId });
      expect(list.status).toBe(200);
      const receptions = field(list.json, 'receptions');
      expect(Array.isArray(receptions)).toBe(true);
      expect((receptions as unknown[]).map((item) => field(item, 'receptionId'))).not.toContain(env.tenantBReceptionId);
      const next = field(list.json, 'nextCursor');
      if (typeof next !== 'string') break;
      cursor = next;
    }
  });

  await test.step('el recurso de B sigue intacto para B', async () => {
    const again = await openPersona(browser, testInfo.project.use.baseURL, 'tenantB');
    try {
      await again.page.goto('/panel');
      await expectWorkshopShell(again.page);
      const after = await probeApi(again.page, env.apiOrigin, { method: 'GET', path: targetPath, tenantId: env.tenantBId });
      expect(field(after.json, 'reception')).toEqual(controlBody);
    } finally {
      await again.context.close();
    }
  });

  await test.step('sin fuga de datos de B (centinela opcional)', async () => {
    const serialized = JSON.stringify(leaked) + (await page.content());
    if (env.tenantBSentinel !== null) {
      expect(serialized, 'ni la UI ni las respuestas de A contienen el centinela de B').not.toContain(env.tenantBSentinel);
    }
    expect(JSON.stringify(leaked)).not.toContain('"mileageKm"');
  });
});
