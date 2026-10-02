import { useCallback, useState } from 'react';
import type { CustomerSelection, SearchCustomers } from './customer-selection';
import { CrmFailure } from './copy';
import { CustomerSearchFields, EMPTY_CUSTOMER_SEARCH } from './search';
import { useCrmList } from './use-list';
export function CustomerPicker({ searchCustomers, selected, onSelect, signal, disabled }: { readonly searchCustomers: SearchCustomers; readonly selected: CustomerSelection | null; readonly onSelect: (customer: CustomerSelection | null) => void; readonly signal: AbortSignal; readonly disabled: boolean }) {
  const [draft, setDraft] = useState(EMPTY_CUSTOMER_SEARCH);
  const load = useCallback(async (search: typeof EMPTY_CUSTOMER_SEARCH, cursor?: string) => {
    const result = await searchCustomers(search, cursor);
    return result.ok ? { ok: true as const, data: { items: result.data.customers, nextCursor: result.data.nextCursor } } : result;
  }, [searchCustomers]);
  const list = useCrmList(load, EMPTY_CUSTOMER_SEARCH, true, signal);
  return <fieldset className="crm-picker" disabled={disabled}><legend>Cliente propietario</legend><p>Busca y selecciona el cliente que será el propietario inicial.</p>
    {selected === null ? <><div className="crm-search"><CustomerSearchFields search={draft} onChange={setDraft} prefix="owner-search" /><button className="ui-button" type="button" disabled={list.blocked} onClick={() => { list.search(draft); }}>Buscar cliente</button></div>
    {list.busy && <p role="status">Buscando clientes…</p>}<CrmFailure failure={list.failure} />
    {list.failure !== null && <button type="button" className="ui-button" disabled={list.blocked} onClick={list.retry}>Reintentar búsqueda</button>}
    <ul className="crm-picker-results">{list.items.map(c => <li key={c.customerId}><span><strong>{c.firstName} {c.lastName}</strong><small>{c.phone}</small></span><button type="button" className="ui-button" onClick={() => { onSelect(c); }}>Seleccionar {c.firstName} {c.lastName}</button></li>)}</ul>
    {list.loaded && list.items.length === 0 && <p role="status">No se encontraron clientes. Prueba otro dato de búsqueda.</p>}
    {list.cursor !== null && <button type="button" className="ui-button" disabled={list.blocked} onClick={list.more}>Cargar más clientes</button>}</> :
    <div className="crm-selected"><span><strong>{selected.firstName} {selected.lastName}</strong><small>{selected.phone}</small></span><button className="ui-button" type="button" onClick={() => { onSelect(null); }}>Cambiar cliente</button></div>}
  </fieldset>;
}
