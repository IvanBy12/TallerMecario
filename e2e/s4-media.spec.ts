import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { field, probeApi } from './support/api-probe';
import { isCanonicalId, type WorkshopContext } from '../src/features/auth/me-contract';
import { openS4App } from './support/s4-context';
import { createS4Vehicle, selectS4Vehicle } from './support/s4-fixtures';
import { assertMobileRuntime } from './support/mobile-runtime';
import { confirmOwnerAndConsent, goToSection, intakeFor, submitIntake } from './support/reception-flow';
import { recordS4Media, s4Check, type S4MediaEvidence } from './support/s4-media-evidence';
import { requireS4Preflight, S4_FIXTURE_DIR, s4Origins } from './support/s4-preflight';
import { verifyExpiredDownload } from './support/s4-download-expiry';
import { clearS4Page, s4Safe } from './support/s4-safe';

// Live HTTP only. Fresh customer/vehicle/reception for this run. No route mocks, offline, retry or reused open reception.
test.describe.configure({ mode: 'serial' });
let receptionId = '';
let photoId = '';
let videoId = '';
let context: WorkshopContext;
let runContext: WorkshopContext | undefined;
test.beforeEach(async ({ page }) => {
  requireS4Preflight();
  await s4Safe(page, 'contexto vivo de la cuenta S4', async () => {
    context = await openS4App(page);
    if (runContext) s4Check(context.userId === runContext.userId && context.tenantId === runContext.tenantId &&
      context.membershipId === runContext.membershipId, 'La identidad/taller S4 cambió durante la corrida.');
    else runContext = context;
  });
});
test.afterEach(async ({ page }) => {
  // Error-context snapshots must not retain the staff page, even when an action times out.
  await clearS4Page(page);
});

test('S4-01 recepción nueva → foto/video360 → R2 → asociación → nueva visita → visualización y reproducción', async ({ page }, testInfo) => {
  let captured: S4MediaEvidence | undefined;
  try {
    await s4Safe(page, 'flujo contextual foto/video360 y lectura persistida', async () => {
      const evidence = await recordS4Media(page, s4Origins());
      captured = evidence;
      await assertMobileRuntime(page);
      await goToSection(page, 'Recepciones');
      await page.getByRole('link', { name: 'Nueva recepción', exact: true }).click();
      const fixture = await createS4Vehicle(page, context.tenantId);
      const runId = fixture.runId;
      await selectS4Vehicle(page, fixture);
      await confirmOwnerAndConsent(page);
      await page.getByRole('button', { name: 'Mostrar aviso para capturar evidencia' }).click();
      await page.getByLabel('El propietario declara ser mayor de edad para la captura de evidencia.').check();
      await page.getByRole('region', { name: 'Selección local de fotos' }).getByLabel('He leído este aviso').check();
      await page.getByLabel('Seleccionar fotos', { exact: true }).setInputFiles(path.join(S4_FIXTURE_DIR, 'photo.png'));
      await page.getByRole('region', { name: 'Selección local de video' }).getByLabel('He leído este aviso').check();
      await page.getByLabel('Seleccionar video', { exact: true }).setInputFiles(path.join(S4_FIXTURE_DIR, 'video360.mp4'));
      await page.getByText('Video seleccionado. Consulta su estado de carga.', { exact: true }).waitFor();
      const intake = intakeFor(runId);
      await page.getByLabel('Kilometraje (km)').fill(intake.mileageKm);
      await page.getByLabel('Combustible (%)').fill(intake.fuelLevelPct);
      await page.getByLabel('Observaciones del cliente').fill(intake.customerNotes);
      await page.getByLabel('Notas internas del asesor').fill(intake.advisorNotes);
      const createdResponse = page.waitForResponse(response => response.request().method() === 'POST' &&
        new URL(response.url()).origin === s4Origins().api && new URL(response.url()).pathname === '/api/v1/receptions');
      await page.getByRole('button', { name: 'Crear recepción', exact: true }).click();
      const created = await createdResponse;
      const createdBody: unknown = await created.json();
      const id = field(createdBody, 'reception', 'receptionId');
      s4Check(created.status() === 201 && isCanonicalId(id) && field(createdBody, 'reception', 'vehicleId') === fixture.vehicleId &&
        field(createdBody, 'reception', 'customerId') === fixture.customerId, 'API no confirmó recepción del cliente/vehículo nuevos.');
      receptionId = id;
      await page.getByRole('region', { name: 'Recepción creada' }).waitFor();
      const uploadFiles = [
        { mediaType: 'photo', sizeBytes: fs.statSync(path.join(S4_FIXTURE_DIR, 'photo.png')).size },
        { mediaType: 'video360', sizeBytes: fs.statSync(path.join(S4_FIXTURE_DIR, 'video360.mp4')).size },
      ] as const;
      evidence.beginUploadOperation(receptionId);
      await page.getByRole('button', { name: 'Subir foto 1', exact: true }).click();
      await page.getByText('Foto 1 · Evidencia guardada', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Subir video', exact: true }).click();
      await page.getByText('Video · Evidencia guardada', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Continuar a la recepción', exact: true }).click();
      await page.getByRole('heading', { name: 'Detalle de recepción' }).waitFor();
      s4Check(new URL(page.url()).pathname === `/recepciones/${receptionId}`, 'La UI debe navegar al ID de recepción devuelto por API.');
      await evidence.settled();
      photoId = evidence.uploadChain(receptionId, 'photo', fs.statSync(path.join(S4_FIXTURE_DIR, 'photo.png')).size);
      videoId = evidence.uploadChain(receptionId, 'video360', fs.statSync(path.join(S4_FIXTURE_DIR, 'video360.mp4')).size);
      evidence.assertUploadOperation(uploadFiles);
      s4Check(photoId !== videoId && evidence.downloads() === 0, 'Assets distintos; no debe haber descarga automática.');
      const previousLists = evidence.listReads(receptionId);
      await goToSection(page, 'Panel');
      await openS4App(page, `/recepciones/${receptionId}`);
      await page.getByRole('heading', { name: 'Foto 1', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Video 360° 2', exact: true }).waitFor();
      await evidence.settled();
      s4Check(evidence.listReads(receptionId) > previousLists, 'La nueva visita debe leer otra lista real persistida.');
      s4Check(evidence.downloads() === 0, 'La nueva visita no debe prefetchear URLs.');
      await page.getByRole('button', { name: 'Ver Foto 1', exact: true }).click();
      // Assertions return only booleans: a failed locator assertion must never print an img src capability.
      await page.waitForFunction(() => {
        const img = document.querySelector<HTMLImageElement>('img.reception-evidence-view');
        return img !== null && img.complete && img.naturalWidth > 0;
      });
      await page.getByRole('button', { name: 'Ver Video 360° 2', exact: true }).click();
      await page.locator('video.reception-evidence-view').evaluate(async (element: HTMLVideoElement) => {
        try { await element.play(); } catch { throw new Error('No se pudo reproducir el video de evidencia.'); }
      });
      await page.waitForFunction(() => {
        const video = document.querySelector<HTMLVideoElement>('video.reception-evidence-view');
        return video !== null && video.currentTime > 0 && video.readyState >= 2;
      });
      await evidence.settled();
      evidence.readChain(receptionId, photoId, false);
      evidence.readChain(receptionId, videoId, true);
      // Recheck all creates/PUTs and each expected chain after the complete journey.
      evidence.assertUploadOperation(uploadFiles);
      await page.getByRole('button', { name: 'Ocultar Foto 1', exact: true }).click();
      await page.getByRole('button', { name: 'Ocultar Video 360° 2', exact: true }).click();
      s4Check(await page.locator('.reception-evidence-view').count() === 0, 'Ocultar debe liberar las capacidades.');
    });
  } finally {
    if (captured !== undefined) {
      const captureComplete = await captured.settled().then(() => true, () => false);
      await testInfo.attach('s4-media-http-sanitized', { contentType: 'application/json', body: Buffer.from(JSON.stringify({ captureComplete, entries: captured.toJSON() })) });
    }
  }
});

test('S4-02 replay idempotente de asociación conserva la lista persistida', async ({ page }) => {
  await s4Safe(page, 'replay idempotente de asociación', async () => {
    const env = { apiOrigin: s4Origins().api, tenantId: context.tenantId };
    const before = await probeApi(page, env.apiOrigin, { method: 'GET', tenantId: env.tenantId, path: `/api/v1/receptions/${receptionId}/media` });
    const replay = await probeApi(page, env.apiOrigin, { method: 'POST', tenantId: env.tenantId,
      path: `/api/v1/receptions/${receptionId}/media`, body: { mediaAssetId: photoId, sortOrder: 0 } });
    const after = await probeApi(page, env.apiOrigin, { method: 'GET', tenantId: env.tenantId, path: `/api/v1/receptions/${receptionId}/media` });
    s4Check(before.status === 200 && replay.status === 201 && field(replay.json, 'media', 'mediaAssetId') === photoId &&
      after.status === 200 && JSON.stringify(before.json) === JSON.stringify(after.json), 'Replay de asociación incorrecto.');
  });
});

test.skip('S4-03 PENDING: tenant B no obtiene media A ni puede asociarla a su recepción; técnico recibe 403', () => {
  // PENDING: requires distinct authenticated identities, own open reception B, cross-tenant 404,
  // restricted 403 and unchanged detail after denied attach. One account cannot prove these criteria.
  // Preserved original multi-persona implementation: commit 5de4e2e, e2e/s4-media.spec.ts.
});

test('S4-04 archivos locales inválidos no suben; la recepción sigue disponible', async ({ page }) => {
  await s4Safe(page, 'rechazo de archivo local sin destruir recepción', async () => {
    await goToSection(page, 'Recepciones');
    await page.getByRole('link', { name: 'Nueva recepción', exact: true }).click();
    const fixture = await createS4Vehicle(page, context.tenantId);
    const runId = fixture.runId;
    await selectS4Vehicle(page, fixture);
    await confirmOwnerAndConsent(page);
    await page.getByRole('button', { name: 'Mostrar aviso para capturar evidencia' }).click();
    await page.getByLabel('El propietario declara ser mayor de edad para la captura de evidencia.').check();
    const photos = page.getByRole('region', { name: 'Selección local de fotos' });
    await photos.getByLabel('He leído este aviso').check();
    let uploadCreates = 0;
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/media/upload-sessions') uploadCreates++; });
    await photos.getByLabel('Seleccionar fotos', { exact: true }).setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic invalid image') });
    await photos.getByText('Archivo 1: Este archivo no es una selección de imagen compatible.', { exact: true }).waitFor();
    await photos.getByLabel('Seleccionar fotos', { exact: true }).setInputFiles({ name: 'empty.png', mimeType: 'image/png', buffer: Buffer.alloc(0) });
    await photos.getByText('Archivo 1: Este archivo está vacío. Selecciona otra foto.', { exact: true }).waitFor();
    await submitIntake(page, intakeFor(runId));
    s4Check(uploadCreates === 0, 'Archivo inválido generó upload sessions.');
  });
});


test('S4-05 backend rechaza MIME no permitido y tamaño fuera de contrato sin PUT', async ({ page }) => {
  await s4Safe(page, 'validación media server-side', async () => {
    const env = { apiOrigin: s4Origins().api, tenantId: context.tenantId };
    let puts = 0;
    page.on('request', request => { if (request.method() === 'PUT') puts++; });
    for (const invalid of [
      { mimeType: 'text/plain', expectedSizeBytes: 16, code: 'MIME_TYPE_NOT_ALLOWED' },
      { mimeType: 'image/png', expectedSizeBytes: 20_971_521, code: 'MEDIA_SIZE_TOO_LARGE' },
    ]) {
      const response = await probeApi(page, env.apiOrigin, { method: 'POST', tenantId: env.tenantId,
        path: '/api/v1/media/upload-sessions', body: { mediaType: 'photo', mimeType: invalid.mimeType,
          expectedSizeBytes: invalid.expectedSizeBytes, retentionClass: 'operational', idempotencyKey: randomUUID(),
          operationalContext: { type: 'reception', receptionId } } });
      s4Check(response.status === 422 && response.code === invalid.code && field(response.json, 'uploadUrl') === undefined, 'El API no rechazó el archivo fuera de contrato.');
    }
    s4Check(puts === 0, 'Validación negativa disparó una subida.');
  });
});


test('S4-06 la misma URL temporal deja de autorizar GET en R2 después de expirar', async ({ page }, testInfo) => {
  test.setTimeout(420_000); // Signed GET max 300 s; no shortened TTL or shared policy mutation.
  await s4Safe(page, 'expiración real de capacidad GET', async () => {
    const env = { apiOrigin: s4Origins().api, tenantId: context.tenantId };
    const result = await verifyExpiredDownload(page, { apiOrigin: env.apiOrigin, storageOrigin: s4Origins().storage,
      tenantId: env.tenantId, assetId: photoId });
    await testInfo.attach('s4-download-expiry-sanitized', { contentType: 'application/json', body: Buffer.from(JSON.stringify(result)) });
  });
});
