import type { ApiClient, JsonObject } from '@/shared/api/http-client';
import { id } from '@/shared/crm/contract';
import type { CustomerSearch } from '@/shared/crm/customer-selection';
import { badRequest, crmTransport } from '@/shared/crm/transport';
import { parseCustomer, parseCustomers } from './customer-contract';
const fields = ['firstName', 'lastName', 'phone', 'email', 'documentType', 'documentNumber', 'notes'];
function valid(body: JsonObject, patch: boolean) {
  return Object.keys(body).every(k => fields.includes(k) || (patch && k === 'expectedUpdatedAt')) && (patch ? typeof body['expectedUpdatedAt'] === 'string' && Object.keys(body).length > 1 : ['firstName', 'lastName', 'phone'].every(k => typeof body[k] === 'string'));
}
export function createCustomerApi(client: ApiClient, tenantId: string, signal: AbortSignal) {
  const { base, get } = crmTransport(client, tenantId, signal);
  return {
    list: (search?: CustomerSearch, cursor?: string) => get('/api/v1/customers', parseCustomers, { limit: 20, cursor, ...(search?.value.trim() ? { [search.field]: search.value.trim() } : {}) }),
    detail: (customerId: string) => id(customerId) === null ? badRequest<NonNullable<ReturnType<typeof parseCustomer>>>() : get(`/api/v1/customers/${customerId}`, value => { const data = parseCustomer(value); return data?.customerId === customerId ? data : null; }),
    create: (body: JsonObject) => !valid(body, false) ? badRequest<NonNullable<ReturnType<typeof parseCustomer>>>() : client.postJson({ ...base, path: '/api/v1/customers', body }, parseCustomer),
    patch: (customerId: string, body: JsonObject) => id(customerId) === null || !valid(body, true) ? badRequest<NonNullable<ReturnType<typeof parseCustomer>>>() : client.patchJson({ ...base, path: `/api/v1/customers/${customerId}`, body }, value => { const data = parseCustomer(value); return data?.customerId === customerId ? data : null; }),
  };
}
