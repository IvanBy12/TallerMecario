import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { can } from '@/shared/auth/effective-permissions';
import { useWorkspace } from '@/shared/crm/workspace';
import { useCrmAction } from '@/shared/crm/use-action';
import { CrmFailure, displayDate, Forbidden } from '@/shared/crm/copy';
import { PageHeader } from '@/shared/ui/page-header';
import { createVehicleApi } from './vehicle-api';
import type { Owner, VehicleDetail } from './vehicle-contract';
import { canReadVehicle, vehicleType } from './vehicle-form';
export function VehicleDetailPage() { const { vehicleId = '' } = useParams(); return <Detail key={vehicleId} vehicleId={vehicleId} />; }
function Detail({ vehicleId }: { readonly vehicleId: string }) {
  const { apiClient, tenantId, signal, permissions } = useWorkspace();
  const api = useMemo(() => createVehicleApi(apiClient, tenantId, signal), [apiClient, tenantId, signal]);
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const { run, busy, blocked, failure } = useCrmAction(signal);
  const allowed = canReadVehicle(permissions);
  const load = useCallback(() => { if (allowed) return run(() => api.detail(vehicleId), setVehicle); }, [allowed, api, vehicleId, run]);
  useEffect(() => { void load(); }, [load]);
  const ownersAllowed = vehicle !== null && 'updatedAt' in vehicle && can(permissions, 'vehicles.read', true) && can(permissions, 'customers.read', true);
  return <section className="crm-page"><PageHeader title={vehicle?.plate ?? 'Detalle de vehículo'} description={vehicle === null ? 'Datos del vehículo' : `${vehicle.brand} ${vehicle.model}`} actions={vehicle !== null && 'updatedAt' in vehicle && can(permissions, 'vehicles.update', true) && can(permissions, 'vehicles.read', true) ? <Link className="ui-button crm-primary" to={`/vehiculos/${vehicleId}/editar`}>Editar vehículo</Link> : undefined} />
    {can(permissions, 'vehicles.read', true) && <Link className="crm-back" to="/vehiculos">Volver a vehículos</Link>}
    {!allowed ? <Forbidden /> : <>{busy && <p role="status">Cargando vehículo…</p>}<CrmFailure failure={failure} />{failure !== null && <button className="ui-button" type="button" disabled={blocked} onClick={() => { void load(); }}>Reintentar</button>}
      {vehicle !== null && <div className="crm-panel"><dl className="crm-data"><div><dt>Tipo</dt><dd>{vehicleType(vehicle.vehicleType)}</dd></div><div><dt>Año</dt><dd>{vehicle.modelYear ?? 'Sin información'}</dd></div><div><dt>Color</dt><dd>{vehicle.color ?? 'Sin información'}</dd></div>
        {'updatedAt' in vehicle && <><div><dt>Kilometraje actual</dt><dd>{vehicle.currentMileageKm === null ? 'Sin información' : `${String(vehicle.currentMileageKm)} km`}</dd></div><div><dt>VIN</dt><dd>{vehicle.vin ?? 'Sin información'}</dd></div><div><dt>Número de motor</dt><dd>{vehicle.engineNumber ?? 'Sin información'}</dd></div></>}
      </dl></div>}
      {ownersAllowed && <Owners vehicleId={vehicleId} api={api} signal={signal} />}
    </>}
  </section>;
}
function Owners({ vehicleId, api, signal }: { readonly vehicleId: string; readonly api: ReturnType<typeof createVehicleApi>; readonly signal: AbortSignal }) {
  const [owners, setOwners] = useState<readonly Owner[] | null>(null);
  const action = useCrmAction(signal);
  const { run } = action;
  const load = useCallback(() => run(() => api.owners(vehicleId), data => { setOwners(data.owners); }), [api, vehicleId, run]);
  useEffect(() => { void load(); }, [load]);
  const current = owners?.filter(o => o.isPrimary && o.validTo === null) ?? [];
  const history = owners?.filter(o => o.validTo !== null) ?? [];
  return <section className="crm-panel"><h2>Propietario actual</h2>{action.busy && <p role="status">Cargando propietarios…</p>}<CrmFailure failure={action.failure} />
    {action.failure !== null && <button type="button" className="ui-button" disabled={action.blocked} onClick={() => { void load(); }}>Reintentar propietarios</button>}
    {owners !== null && (current.length === 0 ? <p>No hay un propietario vigente registrado.</p> : <ul className="crm-owner-list">{current.map(o => <OwnerItem key={o.ownershipId} owner={o} />)}</ul>)}
    {history.length > 0 && <><h3>Historial de propietarios</h3><ul className="crm-owner-list">{history.map(o => <OwnerItem key={o.ownershipId} owner={o} />)}</ul></>}
  </section>;
}
function OwnerItem({ owner }: { readonly owner: Owner }) {
  return <li><Link to={`/clientes/${owner.customerId}`}>{owner.customer.firstName} {owner.customer.lastName}</Link><small>Desde {displayDate(owner.validFrom)}{owner.validTo === null ? ' · Vigente' : ` hasta ${displayDate(owner.validTo)}`}</small></li>;
}
