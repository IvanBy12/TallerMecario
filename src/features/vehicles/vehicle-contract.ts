import { array, boolean, envelope, id, integer, nonempty, nullable, object, record, text, timestamp } from '@/shared/crm/contract';
const common = { vehicleId: id, plate: nonempty, vehicleType: nonempty, brand: nonempty, model: nonempty, modelYear: nullable(integer), color: nullable(text) };
const privateFields = { vin: nullable(text), engineNumber: nullable(text), currentMileageKm: nullable(integer), createdAt: timestamp, updatedAt: timestamp };
export const vehicleParser = object({ ...common, ...privateFields });
const techParser = object(common);
export type Vehicle = NonNullable<ReturnType<typeof vehicleParser>>;
export type VehicleDetail = Vehicle | NonNullable<ReturnType<typeof techParser>>;
export const parseVehicle = envelope('vehicle', vehicleParser);
export function parseVehicleDetail(value: unknown): VehicleDetail | null {
  if (!record(value) || !record(value['vehicle'])) return null;
  const vehicle = value['vehicle'];
  return Object.keys(privateFields).some(key => Object.hasOwn(vehicle, key)) ? vehicleParser(vehicle) : techParser(vehicle);
}
export const parseVehicles = object({ vehicles: array(vehicleParser), nextCursor: nullable(nonempty) });
export const parseOwners = object({ owners: array(object({ ownershipId: id, customerId: id, customer: object({ firstName: nonempty, lastName: nonempty }), relationshipType: nonempty, isPrimary: boolean, validFrom: timestamp, validTo: nullable(timestamp) })) });
export type Owner = NonNullable<ReturnType<typeof parseOwners>>['owners'][number];
