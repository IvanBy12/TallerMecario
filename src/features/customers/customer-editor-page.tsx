import { useCallback, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import type { JsonObject } from '@/shared/api/http-client';
import { can } from '@/shared/auth/effective-permissions';
import { useWorkspace } from '@/shared/crm/workspace';
import { receptionReturn, NEW_VEHICLE_FROM_RECEPTION } from '@/shared/crm/reception-return';
import { CrmEditor } from '@/shared/crm/editor';
import { createCustomerApi } from './customer-api';
import { CUSTOMER_FIELDS, customerErrors } from './customer-form';
import type { Customer } from './customer-contract';
const detailTo = (customer: Customer) => `/clientes/${customer.customerId}`;
export function CustomerEditorPage({ editing = false }: { readonly editing?: boolean }) { const { customerId = '' } = useParams(); return <Editor key={editing ? customerId : 'new'} customerId={customerId} editing={editing} />; }
function Editor({ customerId, editing }: { readonly customerId: string; readonly editing: boolean }) {
  const { search } = useLocation();
  const returning = !editing && receptionReturn(search) !== null;
  const { apiClient, tenantId, signal, permissions } = useWorkspace();
  const api = useMemo(() => createCustomerApi(apiClient, tenantId, signal), [apiClient, tenantId, signal]);
  const load = useCallback(() => api.detail(customerId), [api, customerId]);
  const save = useCallback((body: JsonObject) => editing ? api.patch(customerId, body) : api.create(body), [api, customerId, editing]);
  const allowed = can(permissions, editing ? 'customers.update' : 'customers.create', true) && can(permissions, 'customers.read', true);
  return <CrmEditor title={editing ? 'Editar cliente' : 'Nuevo cliente'} fields={CUSTOMER_FIELDS} validate={customerErrors} allowed={allowed} signal={signal} load={editing ? load : undefined} save={save} detailTo={returning ? () => NEW_VEHICLE_FROM_RECEPTION : detailTo} cancelTo={returning ? '/recepciones/nueva' : editing ? `/clientes/${customerId}` : '/clientes'} />;
}
