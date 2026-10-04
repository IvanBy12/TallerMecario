import fs from 'node:fs';

import { expect, test } from '@playwright/test';

import { field, probeApi } from './support/api-probe';
import { e2eEnv, newRunId, STATE_FILES } from './support/env';
import { assertMobileRuntime } from './support/mobile-runtime';
import { recordNetwork, signatureFlowOf, type SignatureFlowSummary } from './support/network-evidence';
import {
  closeReception,
  createReceptionViaUi,
  expectInspectionPersisted,
  expectNoHorizontalOverflow,
  inspectChecklistAndDamage,
  inspectionFor,
  intakeFor,
  orderNumberShown,
  registerSignature,
  runFixture,
  type VehiclePath,
} from './support/reception-flow';

/**
 * Gate móvil Sprint 3 — flujo feliz REAL (E2E-01) y sus comprobaciones dependientes: idempotencia del cierre (E2E-02),
 * historial inicial (E2E-03) y evidencia técnica de firma/R2 (E2E-06). Sin mocks ni page.route(): navegador → Clerk real →
 * backend real → PostgreSQL real → R2 real. Las pruebas son dependientes en orden (serial).
 */

test.use({ storageState: STATE_FILES.advisor });
test.describe.configure({ mode: 'serial' });

interface RunState {
  runId: string;
  receptionId: string;
  vehiclePath: VehiclePath;
  orderNumber: string;
  signatureFlow: SignatureFlowSummary;
}
let run: RunState | undefined;

function closedRun(): RunState {
  if (run === undefined) throw new Error('E2E-01 no completó: no hay recepción cerrada sobre la que verificar.');
  return run;
}

test('E2E-01 flujo feliz móvil: login → taller → recepción → inspección → firma real → cierre → orden', async ({ page }, testInfo) => {
  const env = e2eEnv();
  // El gate es móvil y táctil: la configuración del proyecto lo exige y el navegador lo confirma en runtime (más abajo).
  expect(testInfo.project.use.hasTouch, 'el proyecto del gate debe ser táctil').toBe(true);
  expect(testInfo.project.use.isMobile, 'el proyecto del gate debe ser móvil').toBe(true);
  const fixture = runFixture(newRunId());
  const intake = intakeFor(fixture.runId);
  const inspection = inspectionFor(fixture.runId);
  const evidence = recordNetwork(page, env.apiOrigin);
  let receptionId = '';
  let vehiclePath: VehiclePath = 'existing';

  await test.step('sesión real y contexto del taller activo', async () => {
    await page.goto('/panel');
    await expect(page.locator('main#contenido-principal')).toBeVisible({ timeout: 60_000 });
    await assertMobileRuntime(page);
    const context = await probeApi(page, env.apiOrigin, { method: 'GET', path: '/api/v1/me/context', tenantId: env.tenantId });
    expect(context.status).toBe(200);
    expect(field(context.json, 'context', 'tenantId')).toBe(env.tenantId);
    const workshopName = field(context.json, 'context', 'workshop', 'displayName');
    expect(typeof workshopName).toBe('string');
    await expect(page.locator('.shell__brand-tagline')).toHaveText(String(workshopName));
  });

  await test.step('nueva recepción: placa → (cliente → vehículo si no existe) → propietario → consentimiento → ingreso', async () => {
    const created = await createReceptionViaUi(page, fixture, intake);
    receptionId = created.receptionId;
    vehiclePath = created.vehiclePath;
    await expect(page.getByText(`${intake.mileageKm} km`)).toBeVisible();
    await expect(page.getByText(`${intake.fuelLevelPct}%`)).toBeVisible();
    await expect(page.getByText(intake.customerNotes)).toBeVisible();
    await expect(page.getByText(intake.advisorNotes)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  await test.step('checklist (agregar/editar) y daño; persistencia tras recarga', async () => {
    await inspectChecklistAndDamage(page, inspection);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Detalle de recepción' })).toBeVisible();
    await expectInspectionPersisted(page, inspection);
  });

  await test.step('firma: documento de aceptación real → sesión de subida → PUT R2 → complete → attach', async () => {
    await registerSignature(page, `Firmante E2E ${fixture.runId}`);
  });

  // La cadena debe estar CORRELACIONADA: mismo uploadSessionId/mediaAssetId, PUT al origen y ruta de la uploadUrl y attach en esta recepción.
  await evidence.settled();
  const signatureFlow = signatureFlowOf(evidence, { receptionId });

  let orderNumber = '';
  await test.step('cierre: confirmar diálogo → recepción cerrada → orden generada', async () => {
    orderNumber = await closeReception(page);
    await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Orden #${orderNumber}` })).toBeVisible();
    await expect(page.getByText('Generada correctamente')).toBeVisible();
  });

  run = { runId: fixture.runId, receptionId, vehiclePath, orderNumber, signatureFlow };
  await testInfo.attach('e2e-01-run', {
    body: JSON.stringify({ runId: fixture.runId, receptionId, vehiclePath, orderNumber }, null, 2),
    contentType: 'application/json',
  });
});

test('E2E-02 idempotencia real del cierre: recarga, misma orden y reintento de close sin segunda orden', async ({ page }, testInfo) => {
  const env = e2eEnv();
  const { receptionId, orderNumber } = closedRun();
  const path = `/api/v1/receptions/${receptionId}`;

  await test.step('recarga: sigue cerrada con la misma orden y sin acción efectiva de cierre', async () => {
    await page.goto(`/recepciones/${receptionId}`);
    await expect(page.getByRole('heading', { name: 'Detalle de recepción' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
    expect(await orderNumberShown(page)).toBe(orderNumber);
    await expect(page.getByText('Generada correctamente')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar recepción' })).toHaveCount(0);
  });

  const before = await probeApi(page, env.apiOrigin, { method: 'GET', path, tenantId: env.tenantId });
  expect(before.status).toBe(200);
  expect(field(before.json, 'reception', 'status')).toBe('closed');
  const orderId = field(before.json, 'reception', 'serviceOrder', 'id');
  expect(typeof orderId).toBe('string');
  expect(field(before.json, 'reception', 'serviceOrder', 'orderNumber')).toBe(orderNumber);

  await test.step('reintento real de POST /close con la sesión del asesor (endpoint existente, §5.8)', async () => {
    // El backend lo cubre como «retry is read-only» (TallerMecarioB tests/reception-api/close.test.cjs): 200 con la misma orden.
    const again = await probeApi(page, env.apiOrigin, { method: 'POST', path: `${path}/close`, tenantId: env.tenantId });
    expect(again.status).toBe(200);
    expect(field(again.json, 'serviceOrder', 'id')).toBe(orderId);
    expect(field(again.json, 'serviceOrder', 'orderNumber')).toBe(orderNumber);
    expect(field(again.json, 'reception', 'status')).toBe('closed');
  });

  const after = await probeApi(page, env.apiOrigin, { method: 'GET', path, tenantId: env.tenantId });
  expect(after.status).toBe(200);
  expect(field(after.json, 'reception'), 'el detalle de la recepción no cambia tras el reintento de cierre').toEqual(field(before.json, 'reception'));
  await testInfo.attach('e2e-02-close-replay', {
    body: JSON.stringify({ replayStatus: 200, sameServiceOrderId: true, sameOrderNumber: true, receptionUnchanged: true }, null, 2),
    contentType: 'application/json',
  });
});

test('E2E-03 historial: estado inicial de la orden observable; el historial persistido se verifica server-side', async ({ page }, testInfo) => {
  const env = e2eEnv();
  const { receptionId } = closedRun();
  await page.goto(`/recepciones/${receptionId}`);
  await expect(page.getByRole('heading', { name: 'Detalle de recepción' })).toBeVisible({ timeout: 60_000 });
  // Sprint 3 no expone endpoint ni UI de historial de órdenes (no existe orders.read ni GET /orders en el contrato vigente).
  // Lo único observable por HTTP es el estado inicial `reception` de la orden recién generada.
  await expect(page.getByText('Estado: Recepción')).toBeVisible();
  const detail = await probeApi(page, env.apiOrigin, { method: 'GET', path: `/api/v1/receptions/${receptionId}`, tenantId: env.tenantId });
  expect(field(detail.json, 'reception', 'serviceOrder', 'status')).toBe('reception');
  testInfo.annotations.push({
    type: 'server-side',
    description:
      'order_status_history (NULL → reception, exactamente una fila) se verifica en el backend: ' +
      'TallerMecarioB tests/reception-api/close.test.cjs («close persists exactly one order, history, mileage and audit; retry is read-only») ' +
      'y scripts/staging-reception-e2e.cjs; ver docs/quality/s3-mobile-e2e.md.',
  });
});

test('E2E-06 evidencia de firma/R2: session → PUT real → media activa → firma registrada', async ({ page }, testInfo) => {
  const env = e2eEnv();
  const { signatureFlow, receptionId } = closedRun();
  // La firma queda persistida y visible tras el cierre (el detalle del backend la expone como resumen).
  await page.goto(`/recepciones/${receptionId}`);
  await expect(page.getByText('Firma registrada', { exact: true })).toBeVisible({ timeout: 60_000 });
  const detail = await probeApi(page, env.apiOrigin, { method: 'GET', path: `/api/v1/receptions/${receptionId}`, tenantId: env.tenantId });
  expect(typeof field(detail.json, 'reception', 'signature', 'signatureId')).toBe('string');
  const summary = {
    receptionId,
    uploadSessionCreated: { route: signatureFlow.uploadSessionCreated.route, status: signatureFlow.uploadSessionCreated.status, facts: signatureFlow.uploadSessionCreated.facts },
    objectStoragePut: { route: signatureFlow.objectStoragePut.route, status: signatureFlow.objectStoragePut.status },
    mediaActivated: { route: signatureFlow.mediaActivated.route, status: signatureFlow.mediaActivated.status, facts: signatureFlow.mediaActivated.facts },
    signatureRegistered: { route: signatureFlow.signatureRegistered.route, status: signatureFlow.signatureRegistered.status, facts: signatureFlow.signatureRegistered.facts },
  };
  expect(summary.uploadSessionCreated.facts).toMatchObject({ returnedUploadSession: true, returnedSignedUploadUrl: true });
  expect(summary.mediaActivated.facts).toMatchObject({ mediaStatus: 'active', sizeBytesPositive: true });
  expect(summary.signatureRegistered.facts).toMatchObject({ returnedSignatureId: true });
  const serialized = JSON.stringify(summary, null, 2);
  expect(serialized, 'la evidencia no contiene URL firmadas ni tokens').not.toMatch(/https?:\/\/|X-Amz|Bearer|Authorization/i);
  fs.writeFileSync(testInfo.outputPath('s3-signature-r2-evidence.json'), serialized);
  await testInfo.attach('s3-signature-r2-evidence', { body: serialized, contentType: 'application/json' });
});
