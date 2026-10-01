import { useState } from 'react';
import { useReception } from './reception-context';
import type { Customer, Vehicle } from './reception-contract';
import { RequestReference } from './request-reference';
import { useReceptionAction } from './use-reception-action';
export function ReceptionPicker({ kind, onVehicle, onCustomer, disabled = false }: {
    readonly kind: 'vehicle' | 'customer';
    readonly onVehicle?: (vehicle: Vehicle) => void;
    readonly onCustomer?: (customer: Customer) => void;
    readonly disabled?: boolean;
}) {
    const { api } = useReception();
    const action = useReceptionAction();
    const [query, setQuery] = useState('');
    const [submitted, setSubmitted] = useState('');
    const [vehicles, setVehicles] = useState<readonly Vehicle[]>([]);
    const [customers, setCustomers] = useState<readonly Customer[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [invalid, setInvalid] = useState(false);
    const vehicle = kind === 'vehicle';
    const search = (more = false) => {
        const normalized = vehicle ? query.trim().replace(/[ .-]/g, '').toUpperCase() : query.normalize('NFC').trim();
        if (!more && (vehicle ? (!/^[A-Za-z0-9 .-]+$/.test(query.trim()) || !/^[A-Z0-9]{1,16}$/.test(normalized)) : !normalized || Array.from(normalized).some((char) => { const code = char.charCodeAt(0); return code <= 31 || (code >= 127 && code <= 159); }))) {
            setInvalid(true);
            return;
        }
        setInvalid(false);
        const filter = more ? submitted : normalized;
        const next = more ? cursor ?? undefined : undefined;
        if (!more) {
            setSubmitted(filter);
            setVehicles([]);
            setCustomers([]);
            setCursor(null);
            setSearched(false);
        }
        if (vehicle)
            void action.run(() => api.vehicles(filter, next), (data) => { setVehicles((items) => more ? [...items, ...data.vehicles.filter((v) => !items.some((old) => old.vehicleId === v.vehicleId))] : data.vehicles); setCursor(data.nextCursor); setSearched(true); });
        else
            void action.run(() => api.customers(filter, next), (data) => { setCustomers((items) => more ? [...items, ...data.customers.filter((c) => !items.some((old) => old.customerId === c.customerId))] : data.customers); setCursor(data.nextCursor); setSearched(true); });
    };
    return <div className="reception-picker"><label>{vehicle ? 'Buscar vehículo por placa' : 'Buscar cliente por nombre'}<input value={query} disabled={disabled || action.blocked} onChange={(e) => { setQuery(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') {
        e.preventDefault();
        if (!action.blocked && !disabled)
            search();
    } }}/></label>
    <button type="button" disabled={disabled || action.blocked} onClick={() => { search(); }}>Buscar {vehicle ? 'vehículo' : 'cliente'}</button>
    {invalid && <p role="alert">{vehicle ? 'Ingresa una placa válida de 1 a 16 letras o números.' : 'Ingresa un nombre válido.'}</p>}
    {action.busy && <p role="status">Buscando…</p>}<RequestReference failure={action.failure}/>
    {action.failure !== null && <button type="button" disabled={disabled || action.blocked} onClick={() => { search(); }}>Reintentar búsqueda</button>}
    {searched && (vehicle ? vehicles.length === 0 : customers.length === 0) && <p>No se encontraron resultados.</p>}
    <ul>{vehicle ? vehicles.map((v) => <li key={v.vehicleId}><button type="button" disabled={disabled || action.blocked} onClick={() => onVehicle?.(v)}>{v.plate} — {v.brand} {v.model}</button></li>) : customers.map((c) => <li key={c.customerId}><button type="button" disabled={disabled || action.blocked} onClick={() => onCustomer?.(c)}>{c.firstName} {c.lastName}</button></li>)}</ul>
    {cursor !== null && <button type="button" disabled={disabled || action.blocked} onClick={() => { search(true); }}>Más resultados</button>}
  </div>;
}
