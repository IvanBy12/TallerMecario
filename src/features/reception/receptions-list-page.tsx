import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { can, useReception } from './reception-context';
import type { ReceptionFilters } from './reception-api';
import type { Customer, ReceptionSummary, Vehicle } from './reception-contract';
import { ReceptionPicker } from './reception-pickers';
import { RequestReference } from './request-reference';
import { useReceptionAction } from './use-reception-action';
export function ReceptionsListPage() {
    const { permissions } = useReception();
    const [status, setStatus] = useState<'' | 'open' | 'closed'>('');
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [customer, setCustomer] = useState<Customer | null>(null);
    const filters: ReceptionFilters = { ...(status === '' ? {} : { status }), ...(vehicle === null ? {} : { vehicleId: vehicle.vehicleId }), ...(customer === null ? {} : { customerId: customer.customerId }) };
    return <section className="reception-page"><h1>Recepciones</h1>
    {can(permissions, 'receptions.create', true) && <Link to="/recepciones/nueva">Nueva recepción</Link>}
    {!can(permissions, 'receptions.read', true) ? <p role="alert">El listado requiere acceso de recepción al taller. Abre una recepción asignada mediante su enlace.</p> : <>
      <div className="reception-filters"><label>Estado<select value={status} onChange={(e) => { const v = e.target.value; if (v === '' || v === 'open' || v === 'closed')
            setStatus(v); }}><option value="">Todos</option><option value="open">Abiertas</option><option value="closed">Cerradas</option></select></label>
        <ReceptionPicker kind="vehicle" onVehicle={setVehicle}/>{vehicle !== null && <p>Vehículo: {vehicle.plate} <button type="button" onClick={() => { setVehicle(null); }}>Quitar vehículo</button></p>}
        <ReceptionPicker kind="customer" onCustomer={setCustomer}/>{customer !== null && <p>Cliente: {customer.firstName} {customer.lastName} <button type="button" onClick={() => { setCustomer(null); }}>Quitar cliente</button></p>}
      </div><ReceptionResults key={`${status}:${vehicle?.vehicleId ?? ''}:${customer?.customerId ?? ''}`} filters={filters}/>
    </>}
  </section>;
}
function ReceptionResults({ filters }: {
    readonly filters: ReceptionFilters;
}) {
    const { api } = useReception();
    const { run, busy, blocked, failure } = useReceptionAction();
    const [items, setItems] = useState<readonly ReceptionSummary[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const load = useCallback((next?: string) => run(() => api.list(filters, next), (data) => {
        setItems((old) => next === undefined ? data.receptions : [...old, ...data.receptions.filter((r) => !old.some((item) => item.receptionId === r.receptionId))]);
        setCursor(data.nextCursor);
        setLoaded(true);
    }), [api, filters, run]);
    useEffect(() => { void load(); }, [load]);
    return <div aria-busy={busy}>{busy && <p role="status">Cargando recepciones…</p>}<RequestReference failure={failure}/>
    {failure !== null && <button type="button" disabled={blocked} onClick={() => { void load(loaded && cursor !== null ? cursor : undefined); }}>Reintentar</button>}
    {loaded && items.length === 0 && <p>No hay recepciones para estos filtros.</p>}
    <ul className="reception-list">{items.map((r) => <li key={r.receptionId}><Link to={`/recepciones/${r.receptionId}`}>Abrir recepción · {r.receivedAt}</Link><p>{r.status === 'open' ? 'Abierta' : 'Cerrada'} · {r.mileageKm} km · Combustible: {r.fuelLevelPct === null ? 'Sin registrar' : `${String(r.fuelLevelPct)}%`}</p></li>)}</ul>
    {loaded && cursor !== null && <button disabled={blocked} type="button" onClick={() => { void load(cursor); }}>Cargar más</button>}
  </div>;
}
