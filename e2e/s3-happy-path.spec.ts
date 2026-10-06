import { expect, test } from '@playwright/test';

import { field, probeApi } from './support/api-probe';
import { e2eEnv, newRunId, STATE_FILES } from './support/env';
import { assertMobileRuntime } from './support/mobile-runtime';
import {
  closeReception,
  createReceptionViaUi,
  expectInspectionPersisted,
  expectNoHorizontalOverflow,
  inspectChecklistAndDamage,
  inspectionFor,
  intakeFor,
  orderNumberShown,
  runFixture,
  type VehiclePath,
} from './support/reception-flow';

/**
 * Gate móvil Sprint 3 — recepción e inspección → cierre → orden, sin firma digital ni subida R2.
 * E2E-02 verifica idempotencia y E2E-03 el estado inicial. Decisión del usuario: 2026-10-05.
 * Sin mocks: navegador → Clerk real → backend real → PostgreSQL real. Ejecución serial.
 */

test.use({ storageState: STATE_FILES.advisor });
test.describe.configure({ mode: 'serial' });

interface RunState {
  runId: string;
  receptionId: string;
  vehiclePath: VehiclePath;
  orderNumber: string;
}
let run: RunState | undefined;

function closedRun(): RunState {
  if (run === undefined) throw new Error('E2E-01 no completó: no hay recepción cerrada sobre la que verificar.');
  return run;
}

test('E2E-01 flujo feliz móvil: login → taller → recepción → inspección → cierre → orden', async ({ page }, testInfo) => {
  const env = e2eEnv();
  // El gate es móvil y táctil: la configuración del proyecto lo exige y el navegador lo confirma en runtime (más abajo).
  expect(testInfo.project.use.hasTouch, 'el proyecto del gate debe ser táctil').toBe(true);
  expect(testInfo.project.use.isMobile, 'el proyecto del gate debe ser móvil').toBe(true);
  const fixture = runFixture(newRunId());
  const intake = intakeFor(fixture.runId);
  const inspection = inspectionFor(fixture.runId);
  let signatureOrMediaRequests = 0;
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/reception-acceptance-document' || path.startsWith('/api/v1/media/') || path.endsWith('/signature')) signatureOrMediaRequests += 1;
  });
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
    await expect(page.getByText(`${intake.mileageKm} km`, { exact: true })).toBeVisible();
    await expect(page.getByText(`${intake.fuelLevelPct}%`, { exact: true })).toBeVisible();
    await expect(page.getByText(intake.customerNotes, { exact: true })).toBeVisible();
    await expect(page.getByText(intake.advisorNotes, { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  await test.step('checklist (agregar/editar) y daño; persistencia tras recarga', async () => {
    await inspectChecklistAndDamage(page, inspection);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Detalle de recepción' })).toBeVisible();
    await expectInspectionPersisted(page, inspection);
  });

  await expect(page.getByLabel('Firma manuscrita de recepción')).toHaveCount(0);
  const unsigned = await probeApi(page, env.apiOrigin, { method: 'GET', path: `/api/v1/receptions/${receptionId}`, tenantId: env.tenantId });
  expect(unsigned.status).toBe(200);
  expect(field(unsigned.json, 'reception', 'signature')).toBeNull();

  let orderNumber = '';
  await test.step('cierre: confirmar diálogo → recepción cerrada → orden generada', async () => {
    orderNumber = await closeReception(page);
    await expect(page.getByText('Cerrada', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: `Orden #${orderNumber}` })).toBeVisible();
    await expect(page.getByText('Generada correctamente')).toBeVisible();
  });

  expect(signatureOrMediaRequests, 'el flujo no solicita firma digital ni media/R2').toBe(0);
  run = { runId: fixture.runId, receptionId, vehiclePath, orderNumber };
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
  expect(field(before.json, 'reception', 'signature')).toBeNull();
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
