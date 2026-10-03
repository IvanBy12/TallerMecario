import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { can } from '@/shared/auth/effective-permissions';
import { useWorkspace } from '@/shared/crm/workspace';
import { PageHeader } from '@/shared/ui/page-header';
import { EmptyState } from '@/shared/ui/empty-state';
import { CrmFailure, Forbidden } from '@/shared/crm/copy';
import { useCrmList } from '@/shared/crm/use-list';
import { createVehicleApi } from './vehicle-api';
import { canCreateVehicle, vehicleType } from './vehicle-form';
export function VehiclesListPage() {
  const { apiClient, tenantId, signal, permissions } = useWorkspace();
  const api = useMemo(() => createVehicleApi(apiClient, tenantId, signal), [apiClient, tenantId, signal]);
  const [draft, setDraft] = useState('');
  const allowed = can(permissions, 'vehicles.read', true);
  const load = useCallback(async (plate: string, cursor?: string) => {
    const result = await api.list(plate, cursor);
    return result.ok ? { ok: true as const, data: { items: result.data.vehicles, nextCursor: result.data.nextCursor } } : result;
  }, [api]);
  const list = useCrmList(load, String(), allowed, signal);
  return <section className="crm-page"><PageHeader title="Vehículos" description="Consulta y administra los vehículos registrados en el taller." actions={allowed && canCreateVehicle(permissions) ? <Link className="ui-button crm-primary" to="/vehiculos/nuevo">+ Nuevo vehículo</Link> : undefined} />
    {!allowed ? <Forbidden /> : <>
      <form className="crm-search" onSubmit={e => { e.preventDefault(); list.search(draft); }}><div className="crm-field crm-search-value"><label htmlFor="plate-search">Buscar por placa</label><input id="plate-search" value={draft} placeholder="Ej. ABC 123" onChange={e => { setDraft(e.target.value); }} /></div><button className="ui-button crm-primary" disabled={list.blocked} type="submit">Buscar</button><button className="ui-button" disabled={list.blocked} type="button" onClick={() => { setDraft(''); list.search(''); }}>Limpiar búsqueda</button></form>
      {list.busy && <p role="status">Cargando vehículos…</p>}<CrmFailure failure={list.failure} />{list.failure !== null && <button className="ui-button" type="button" disabled={list.blocked} onClick={list.retry}>Reintentar</button>}
      {list.loaded && list.items.length === 0 && list.failure === null && <EmptyState title={list.filter.trim() ? 'No encontramos vehículos' : 'Todavía no hay vehículos'} description={list.filter.trim() ? 'Revisa la placa completa o limpia la búsqueda.' : 'Registra un vehículo y selecciona su propietario inicial.'} />}
      {list.items.length > 0 && <div className="crm-results"><div className="crm-list-heading" aria-hidden="true"><span>Vehículo</span><span>Marca y modelo</span><span>Características</span><span /></div><ul className="crm-list">{list.items.map(v => <li key={v.vehicleId}><div><Link className="crm-record-title crm-plate" to={`/vehiculos/${v.vehicleId}`}>{v.plate}</Link><small>{vehicleType(v.vehicleType)}</small></div><div><strong>{v.brand} {v.model}</strong>{v.modelYear !== null && <small>{v.modelYear}</small>}</div><div>{v.color === null ? <span className="crm-muted">Sin color registrado</span> : <span>{v.color}</span>}</div><Link className="crm-detail-link" aria-label={`Ver vehículo ${v.plate}`} to={`/vehiculos/${v.vehicleId}`}>Ver detalle →</Link></li>)}</ul></div>}
      {list.cursor !== null && <button className="ui-button crm-load-more" type="button" disabled={list.blocked} onClick={list.more}>Cargar más</button>}
    </>}
  </section>;
}
