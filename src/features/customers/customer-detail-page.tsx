import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { can } from '@/shared/auth/effective-permissions';
import { useWorkspace } from '@/shared/crm/workspace';
import { useCrmAction } from '@/shared/crm/use-action';
import { CrmFailure, displayDate, Forbidden } from '@/shared/crm/copy';
import { PageHeader } from '@/shared/ui/page-header';
import { createCustomerApi } from './customer-api';
import type { Customer } from './customer-contract';
export function CustomerDetailPage() { const { customerId = '' } = useParams(); return <Detail key={customerId} customerId={customerId} />; }
function Detail({ customerId }: { readonly customerId: string }) {
  const { apiClient, tenantId, signal, permissions } = useWorkspace();
  const api = useMemo(() => createCustomerApi(apiClient, tenantId, signal), [apiClient, tenantId, signal]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const { run, busy, blocked, failure } = useCrmAction(signal);
  const allowed = can(permissions, 'customers.read', true);
  const load = useCallback(() => { if (allowed) return run(() => api.detail(customerId), setCustomer); }, [allowed, api, customerId, run]);
  useEffect(() => { void load(); }, [load]);
  return <section className="crm-page"><PageHeader title={customer === null ? 'Detalle de cliente' : `${customer.firstName} ${customer.lastName}`} description="Datos del cliente" actions={customer !== null && can(permissions, 'customers.update', true) ? <Link className="ui-button crm-primary" to={`/clientes/${customerId}/editar`}>Editar cliente</Link> : undefined} /><Link className="crm-back" to="/clientes">Volver a clientes</Link>
    {!allowed ? <Forbidden /> : <>{busy && <p role="status">Cargando cliente…</p>}<CrmFailure failure={failure} />{failure !== null && <button className="ui-button" type="button" disabled={blocked} onClick={() => { void load(); }}>Reintentar</button>}
      {customer !== null && <div className="crm-panel"><dl className="crm-data"><div><dt>Teléfono</dt><dd>{customer.phone}</dd></div><div><dt>Email</dt><dd>{customer.email ?? 'Sin información'}</dd></div><div><dt>Documento</dt><dd>{customer.documentNumber === null ? 'Sin información' : `${customer.documentType ?? ''} ${customer.documentNumber}`}</dd></div><div><dt>Registrado</dt><dd>{displayDate(customer.createdAt)}</dd></div></dl><h2>Notas</h2><p className="crm-notes">{customer.notes ?? 'Sin notas registradas.'}</p></div>}
    </>}
  </section>;
}
