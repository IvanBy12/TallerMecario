import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { field, probeApi } from './support/api-probe';
import { expectWorkshopShell } from './support/clerk-login';
import { e2eEnv, newRunId, STATE_FILES } from './support/env';
import { openPersona } from './support/persona';
import { createReceptionViaUi, intakeFor, runFixture } from './support/reception-flow';

/**
 * E2E-04 — RBAC negativo con servidor real. El asesor del taller A abre una recepción por la UI; luego una sesión Clerk REAL
 * de un técnico (sin receptions.update_open / signatures.capture / receptions.close con scope tenant) intenta, por UI y por
 * HTTP, operar sobre ella. La autorización corre antes de validar el body y de resolver el recurso (contrato §2), así que
 * cada intento debe responder 403 PERMISSION_DENIED; después se comprueba, con la sesión del asesor, que nada cambió.
 */

test.use({ storageState: STATE_FILES.advisor });

test('E2E-04 RBAC: el técnico recibe 403 PERMISSION_DENIED y la recepción abierta no se modifica', async ({ page, browser }, testInfo) => {
  const env = e2eEnv();
  const fixture = runFixture(newRunId(), env.vehiclePlate);
  const path = (suffix = '') => `/api/v1/receptions/${receptionId}${suffix}`;
  let receptionId = '';
  let snapshot: unknown;

  await test.step('el asesor abre una recepción real por la UI', async () => {
    ({ receptionId } = await createReceptionViaUi(page, fixture, intakeFor(fixture.runId)));
    const detail = await probeApi(page, env.apiOrigin, { method: 'GET', path: path(), tenantId: env.tenantId });
    expect(detail.status).toBe(200);
    expect(field(detail.json, 'reception', 'status')).toBe('open');
    snapshot = field(detail.json, 'reception');
  });
  const updatedAt = String(field(snapshot, 'updatedAt'));

  const restricted = await openPersona(browser, testInfo.project.use.baseURL, 'restricted');
  try {
    const tech = restricted.page;
    await test.step('UI: sin acciones de crear/editar/firmar/cerrar para el técnico', async () => {
      await tech.goto('/recepciones/nueva');
      await expectWorkshopShell(tech);
      await expect(tech.getByText('No tienes permiso para crear recepciones.')).toBeVisible();
      await tech.goto('/recepciones');
      await expect(tech.getByRole('heading', { name: 'Recepciones', exact: true })).toBeVisible();
      await expect(tech.getByRole('link', { name: 'Nueva recepción' })).toHaveCount(0);
      await tech.goto(`/recepciones/${receptionId}`);
      await expect(tech.getByText('No se encontró la recepción o no está disponible para tu acceso.')).toBeVisible();
      for (const name of ['Editar recepción', 'Agregar daño', 'Agregar elemento de checklist', 'Registrar firma', 'Cerrar recepción']) {
        await expect(tech.getByRole('button', { name })).toHaveCount(0);
      }
    });

    await test.step('servidor real: cada operación protegida responde 403 PERMISSION_DENIED con la sesión del técnico', async () => {
      const attempts = [
        { label: 'receptions.update_open · PATCH recepción', method: 'PATCH', path: path(), body: { expectedUpdatedAt: updatedAt, advisorNotes: 'E2E-RBAC no debe persistir' } },
        { label: 'receptions.update_open · PATCH checklist', method: 'PATCH', path: path('/checklist'), body: { expectedUpdatedAt: updatedAt, items: [{ code: 'rbac', label: 'RBAC', status: 'ok', notes: null }] } },
        { label: 'receptions.update_open · PATCH daños', method: 'PATCH', path: path('/damages'), body: { expectedUpdatedAt: updatedAt, damages: [{ operation: 'create', zoneCode: 'rbac', damageType: 'rbac', severity: 'minor', description: null }] } },
        { label: 'signatures.capture · GET documento de aceptación', method: 'GET', path: '/api/v1/reception-acceptance-document' },
        { label: 'signatures.capture · POST firma', method: 'POST', path: path('/signature'), body: { signatureMediaId: randomUUID(), signedByName: 'RBAC', signedByDocument: null, documentVersion: 'rbac' } },
        { label: 'receptions.close · POST cierre', method: 'POST', path: path('/close') },
        { label: 'receptions.create · POST recepción', method: 'POST', path: '/api/v1/receptions', body: { vehicleId: randomUUID(), customerId: randomUUID(), privacyConsentId: randomUUID(), mileageKm: 1 } },
      ] as const;
      for (const attempt of attempts) {
        const response = await probeApi(tech, env.apiOrigin, {
          method: attempt.method,
          path: attempt.path,
          tenantId: env.tenantId,
          ...('body' in attempt ? { body: attempt.body } : {}),
        });
        expect({ operation: attempt.label, status: response.status, code: response.code }).toEqual({
          operation: attempt.label,
          status: 403,
          code: 'PERMISSION_DENIED',
        });
      }
    });
  } finally {
    await restricted.context.close();
  }

  await test.step('el recurso no cambió (consulta con la sesión del asesor)', async () => {
    const after = await probeApi(page, env.apiOrigin, { method: 'GET', path: path(), tenantId: env.tenantId });
    expect(after.status).toBe(200);
    expect(field(after.json, 'reception')).toEqual(snapshot);
    expect(field(after.json, 'reception', 'status')).toBe('open');
    expect(field(after.json, 'reception', 'signature')).toBeNull();
    expect(field(after.json, 'reception', 'serviceOrder')).toBeNull();
  });
});
