import { can, type EffectivePermissions } from '@/shared/auth/effective-permissions';
export function canCreateVehicle(permissions: EffectivePermissions) {
  return ['vehicles.create', 'vehicles.read', 'vehicle_owners.manage', 'customers.read'].every(code => can(permissions, code, true));
}
