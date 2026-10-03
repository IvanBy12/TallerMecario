import { requiredErrors, type FieldSpec, type FormValues } from '@/shared/crm/form';
import type { EffectivePermissions } from '@/shared/auth/effective-permissions';
export { canCreateVehicle } from '@/shared/crm/permissions';
export const VEHICLE_FIELDS: readonly FieldSpec[] = [
  { key: 'plate', label: 'Placa', required: true },
  { key: 'vehicleType', label: 'Tipo de vehículo', type: 'select', required: true, options: [{ value: 'car', label: 'Carro' }, { value: 'motorcycle', label: 'Moto' }, { value: 'other', label: 'Otro' }] },
  { key: 'brand', label: 'Marca', required: true }, { key: 'model', label: 'Modelo', required: true },
  { key: 'modelYear', label: 'Año', type: 'number', min: 1886, max: 2200 }, { key: 'color', label: 'Color' },
  { key: 'vin', label: 'VIN' }, { key: 'engineNumber', label: 'Número de motor' },
];
export function vehicleErrors(values: FormValues) {
  const errors = requiredErrors(VEHICLE_FIELDS, values);
  if (values['plate']?.trim() && !/^[A-Za-z0-9]{1,16}$/.test(values['plate'].replace(/[ .-]/g, ''))) errors['plate'] = 'Usa de 1 a 16 letras o números. Puedes separar con espacios, puntos o guiones.';
  if (!['car', 'motorcycle', 'other'].includes(values['vehicleType'] ?? '')) errors['vehicleType'] = 'Selecciona un tipo de vehículo.';
  return errors;
}

export function canReadVehicle(permissions: EffectivePermissions) {
  return permissions.some(p => p.code === 'vehicles.read' && p.scopes.some(s => s === 'tenant' || s === 'assigned'));
}
const VEHICLE_TYPES: Readonly<Record<string, string>> = { car: 'Carro', motorcycle: 'Moto', other: 'Otro' };
export function vehicleType(value: string) { return VEHICLE_TYPES[value] ?? value; }
