import { useMemo } from 'react';
import { Route } from 'react-router-dom';
import { createCustomerApi } from '@/features/customers/customer-api';
import { CustomersListPage } from '@/features/customers/customers-list-page';
import { CustomerDetailPage } from '@/features/customers/customer-detail-page';
import { CustomerEditorPage } from '@/features/customers/customer-editor-page';
import { VehiclesListPage } from '@/features/vehicles/vehicles-list-page';
import { VehicleDetailPage } from '@/features/vehicles/vehicle-detail-page';
import { VehicleEditorPage } from '@/features/vehicles/vehicle-editor-page';
import { useWorkspace } from '@/shared/crm/workspace';
function NewVehicleRoute() {
  const { apiClient, tenantId, signal } = useWorkspace();
  const api = useMemo(() => createCustomerApi(apiClient, tenantId, signal), [apiClient, tenantId, signal]);
  return <VehicleEditorPage searchCustomers={api.list} />;
}
export const CRM_ROUTES = [
  <Route key="customers" path="/clientes" element={<CustomersListPage />} />,
  <Route key="new-customer" path="/clientes/nuevo" element={<CustomerEditorPage />} />,
  <Route key="customer" path="/clientes/:customerId" element={<CustomerDetailPage />} />,
  <Route key="edit-customer" path="/clientes/:customerId/editar" element={<CustomerEditorPage editing />} />,
  <Route key="vehicles" path="/vehiculos" element={<VehiclesListPage />} />,
  <Route key="new-vehicle" path="/vehiculos/nuevo" element={<NewVehicleRoute />} />,
  <Route key="vehicle" path="/vehiculos/:vehicleId" element={<VehicleDetailPage />} />,
  <Route key="edit-vehicle" path="/vehiculos/:vehicleId/editar" element={<VehicleEditorPage editing />} />,
];
