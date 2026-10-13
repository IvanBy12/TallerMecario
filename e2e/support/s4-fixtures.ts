import type { Page } from '@playwright/test';
import { isCanonicalId } from '../../src/features/auth/me-contract';
import { field, probeApi } from './api-probe';
import { newRunId } from './env';
import { runFixture } from './reception-flow';
import { s4Check } from './s4-media-evidence';
import { s4Origins } from './s4-preflight';

/** Fresh synthetic business resources over approved real APIs. Never retry ambiguous CRM POSTs. */
export async function createS4Vehicle(page: Page, tenantId: string) {
  const runId = newRunId();
  const fixture = runFixture(runId);
  const customer = await probeApi(page, s4Origins().api, { method: 'POST', tenantId, path: '/api/v1/customers', body: {
    firstName: fixture.firstName, lastName: fixture.lastName, phone: `300${Date.now().toString().slice(-7)}`,
  } });
  const customerId = field(customer.json, 'customer', 'customerId');
  s4Check(customer.status === 201 && isCanonicalId(customerId), 'API no confirmó cliente sintético nuevo.');
  const vehicle = await probeApi(page, s4Origins().api, { method: 'POST', tenantId, path: '/api/v1/vehicles', body: {
    customerId, plate: fixture.plate, vehicleType: 'car', brand: 'E2E Marca', model: 'E2E Modelo',
  } });
  const vehicleId = field(vehicle.json, 'vehicle', 'vehicleId');
  s4Check(vehicle.status === 201 && isCanonicalId(vehicleId) && field(vehicle.json, 'ownership', 'customerId') === customerId &&
    field(vehicle.json, 'ownership', 'vehicleId') === vehicleId, 'API no confirmó vehículo/propietario sintéticos nuevos.');
  return { ...fixture, customerId, vehicleId };
}

/** Search only: a missing API-created resource is a failure, never an implicit second CRM POST. */
export async function selectS4Vehicle(page: Page, fixture: Awaited<ReturnType<typeof createS4Vehicle>>) {
  await page.getByLabel('Buscar vehículo por placa', { exact: true }).fill(fixture.plate);
  await page.getByRole('button', { name: 'Buscar vehículo', exact: true }).click();
  const hit = page.getByRole('button', { name: new RegExp(`^${fixture.plate} — `) });
  await hit.waitFor();
  s4Check(await hit.count() === 1, 'La UI no resolvió un único vehículo confirmado por API.');
  await hit.click();
  await page.getByRole('heading', { name: `Vehículo: ${fixture.plate}`, exact: true }).waitFor();
}
