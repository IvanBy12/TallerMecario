import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { JsonObject } from '@/shared/api/http-client';
import { can } from '@/shared/auth/effective-permissions';
import { useWorkspace } from '@/shared/crm/workspace';
import { receptionReturn, NEW_CUSTOMER_FROM_RECEPTION } from '@/shared/crm/reception-return';
import { CrmEditor } from '@/shared/crm/editor';
import { CustomerPicker } from '@/shared/crm/customer-picker';
import type { CustomerSelection, SearchCustomers } from '@/shared/crm/customer-selection';
import { createVehicleApi } from './vehicle-api';
import { canCreateVehicle, VEHICLE_FIELDS, vehicleErrors } from './vehicle-form';
import type { Vehicle } from './vehicle-contract';
const detailTo = (vehicle: Vehicle) => `/vehiculos/${vehicle.vehicleId}`;
export function VehicleEditorPage({ editing = false, searchCustomers }: { readonly editing?: boolean; readonly searchCustomers?: SearchCustomers }) {
  const { vehicleId = '' } = useParams();
  return <Editor key={editing ? vehicleId : 'new'} vehicleId={vehicleId} editing={editing} searchCustomers={searchCustomers} />;
}
function Editor({ vehicleId, editing, searchCustomers }: { readonly vehicleId: string; readonly editing: boolean; readonly searchCustomers?: SearchCustomers }) {
  const { search } = useLocation();
  const returnTo = !editing ? receptionReturn(search) : null;
  const { apiClient, tenantId, signal, permissions } = useWorkspace();
  const api = useMemo(() => createVehicleApi(apiClient, tenantId, signal), [apiClient, tenantId, signal]);
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);
  const load = useCallback(async () => {
    const result = await api.detail(vehicleId);
    if (!result.ok) return result;
    if (!('updatedAt' in result.data)) return { ok: false as const, failure: { kind: 'permission_denied' as const, status: 403, code: 'PERMISSION_DENIED', requestId: null } };
    return { ok: true as const, data: result.data };
  }, [api, vehicleId]);
  const save = useCallback((body: JsonObject) => editing ? api.patch(vehicleId, body) : api.create(body), [api, vehicleId, editing]);
  const allowed = editing ? can(permissions, 'vehicles.update', true) && can(permissions, 'vehicles.read', true) : canCreateVehicle(permissions) && searchCustomers !== undefined;
  return <CrmEditor title={editing ? 'Editar vehículo' : 'Nuevo vehículo'} fields={VEHICLE_FIELDS} validate={vehicleErrors} allowed={allowed} signal={signal} load={editing ? load : undefined} save={save} detailTo={returnTo === null ? detailTo : () => returnTo} cancelTo={returnTo ?? (editing ? `/vehiculos/${vehicleId}` : '/vehiculos')} selectionReady={editing || customer !== null} createExtra={editing || customer === null ? {} : { customerId: customer.customerId }} selection={!editing && allowed && searchCustomers !== undefined ? <><CustomerPicker searchCustomers={searchCustomers} selected={customer} onSelect={setCustomer} signal={signal} disabled={false} />{returnTo !== null && can(permissions, 'customers.create', true) && <Link className="ui-button" to={NEW_CUSTOMER_FROM_RECEPTION}>Crear cliente y continuar</Link>}</> : undefined} />;
}
