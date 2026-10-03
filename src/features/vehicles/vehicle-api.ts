import type { ApiClient, JsonObject } from '@/shared/api/http-client';
import { id } from '@/shared/crm/contract';
import { badRequest, crmTransport } from '@/shared/crm/transport';
import { parseOwners, parseVehicle, parseVehicleDetail, parseVehicles } from './vehicle-contract';
const fields = ['plate', 'vehicleType', 'brand', 'model', 'modelYear', 'color', 'vin', 'engineNumber'];
function valid(body: JsonObject, patch: boolean) {
  return Object.keys(body).every(k => fields.includes(k) || k === (patch ? 'expectedUpdatedAt' : 'customerId')) && (patch ? typeof body['expectedUpdatedAt'] === 'string' && Object.keys(body).length > 1 : id(body['customerId']) !== null && ['plate', 'vehicleType', 'brand', 'model'].every(k => typeof body[k] === 'string'));
}
export function createVehicleApi(client: ApiClient, tenantId: string, signal: AbortSignal) {
  const { base, get } = crmTransport(client, tenantId, signal);
  return {
    list: (plate = '', cursor?: string) => get('/api/v1/vehicles', parseVehicles, { limit: 20, cursor, ...(plate.trim() ? { plate: plate.trim() } : {}) }),
    detail: (vehicleId: string) => id(vehicleId) === null ? badRequest<NonNullable<ReturnType<typeof parseVehicleDetail>>>() : get(`/api/v1/vehicles/${vehicleId}`, value => { const data = parseVehicleDetail(value); return data?.vehicleId === vehicleId ? data : null; }),
    create: (body: JsonObject) => !valid(body, false) ? badRequest<NonNullable<ReturnType<typeof parseVehicle>>>() : client.postJson({ ...base, path: '/api/v1/vehicles', body }, parseVehicle),
    patch: (vehicleId: string, body: JsonObject) => id(vehicleId) === null || !valid(body, true) ? badRequest<NonNullable<ReturnType<typeof parseVehicle>>>() : client.patchJson({ ...base, path: `/api/v1/vehicles/${vehicleId}`, body }, value => { const data = parseVehicle(value); return data?.vehicleId === vehicleId ? data : null; }),
    owners: (vehicleId: string) => id(vehicleId) === null ? badRequest<NonNullable<ReturnType<typeof parseOwners>>>() : get(`/api/v1/vehicles/${vehicleId}/owners`, parseOwners),
  };
}
