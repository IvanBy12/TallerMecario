import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { can } from '@/shared/auth/effective-permissions';
import { useWorkspace } from '@/shared/crm/workspace';
import { PageHeader } from '@/shared/ui/page-header';
import { EmptyState } from '@/shared/ui/empty-state';
import { CrmFailure, Forbidden } from '@/shared/crm/copy';
import { CustomerSearchFields, EMPTY_CUSTOMER_SEARCH } from '@/shared/crm/search';
import { useCrmList } from '@/shared/crm/use-list';
import { createCustomerApi } from './customer-api';
export function CustomersListPage() {
  const { apiClient, tenantId, signal, permissions } = useWorkspace();
  const api = useMemo(() => createCustomerApi(apiClient, tenantId, signal), [apiClient, tenantId, signal]);
  const [draft, setDraft] = useState(EMPTY_CUSTOMER_SEARCH);
  const allowed = can(permissions, 'customers.read', true);
  const load = useCallback(async (search: typeof EMPTY_CUSTOMER_SEARCH, cursor?: string) => {
    const result = await api.list(search, cursor);
    return result.ok ? { ok: true as const, data: { items: result.data.customers, nextCursor: result.data.nextCursor } } : result;
  }, [api]);
  const list = useCrmList(load, EMPTY_CUSTOMER_SEARCH, allowed, signal);
  const filtered = Boolean(list.filter.value.trim());
  return <section className="crm-page"><PageHeader title="Clientes" description="Gestiona las personas relacionadas con los vehículos del taller." actions={allowed && can(permissions, 'customers.create', true) ? <Link className="ui-button crm-primary" to="/clientes/nuevo">+ Nuevo cliente</Link> : undefined} />
    {!allowed ? <Forbidden /> : <>
      <form className="crm-search" onSubmit={e => { e.preventDefault(); list.search(draft); }}><CustomerSearchFields search={draft} onChange={setDraft} /><button className="ui-button crm-primary" disabled={list.blocked} type="submit">Buscar</button><button className="ui-button" disabled={list.blocked} type="button" onClick={() => { setDraft(EMPTY_CUSTOMER_SEARCH); list.search(EMPTY_CUSTOMER_SEARCH); }}>Limpiar búsqueda</button></form>
      {list.busy && <p role="status">Cargando clientes…</p>}<CrmFailure failure={list.failure} />
      {list.failure !== null && <button className="ui-button" type="button" disabled={list.blocked} onClick={list.retry}>Reintentar</button>}
      {list.loaded && list.items.length === 0 && list.failure === null && <EmptyState title={filtered ? 'No encontramos clientes' : 'Todavía no hay clientes'} description={filtered ? 'Prueba otro nombre, teléfono o documento, o limpia la búsqueda.' : 'Registra tu primer cliente para relacionarlo con sus vehículos.'} />}
      {list.items.length > 0 && <div className="crm-results"><div className="crm-list-heading" aria-hidden="true"><span>Cliente</span><span>Contacto</span><span>Documento</span><span /></div><ul className="crm-list">{list.items.map(c => <li key={c.customerId}><div><Link className="crm-record-title" to={`/clientes/${c.customerId}`}>{c.firstName} {c.lastName}</Link></div><div><span>{c.phone}</span>{c.email !== null && <small>{c.email}</small>}</div><div><span className="crm-mobile-label">Documento</span>{c.documentNumber === null ? <span className="crm-muted">Sin documento</span> : <span>{c.documentType} {c.documentNumber}</span>}</div><Link className="crm-detail-link" aria-label={`Ver cliente ${c.firstName} ${c.lastName}`} to={`/clientes/${c.customerId}`}>Ver detalle →</Link></li>)}</ul></div>}
      {list.cursor !== null && <button className="ui-button crm-load-more" type="button" disabled={list.blocked} onClick={list.more}>Cargar más</button>}
    </>}
  </section>;
}
