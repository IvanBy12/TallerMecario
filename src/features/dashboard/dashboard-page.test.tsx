import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { EffectivePermissions } from '@/shared/auth/effective-permissions';
import type { DashboardDataSource } from './dashboard-data-source';
import { DashboardPage, type DashboardContext } from './dashboard-page';
import type { DashboardSnapshot } from './dashboard-types';

const routes = { newReception: '/recepciones/nueva', receptions: '/recepciones', customers: null, vehicles: null };
const context: DashboardContext = { identity: 'session-demo-A', tenantId: 'tenant-demo-A', permissions: [{ code: 'dashboard.operational.read', scopes: ['tenant'] }] };
const empty: DashboardSnapshot = { kpis: [], activity: [], pendingWork: [] };
const snapshot = (label: string): DashboardSnapshot => ({ ...empty, activity: [{ id: label, event: 'reception_created', plate: label, customer: `Cliente demo ${label}`, vehicle: 'Vehículo demo', occurredAt: '2026-10-02T15:00:00Z' }] });
function deferred() {
  let resolve: (snapshot: DashboardSnapshot) => void = () => { throw new Error('sin inicializar'); };
  let reject: (error: Error) => void = () => { throw new Error('sin inicializar'); };
  const promise = new Promise<DashboardSnapshot>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function controlled(isDemo = true) {
  const requests: ReturnType<typeof deferred>[] = [];
  // Intencionalmente ignora AbortSignal para probar resultados, no solo cancelación.
  const load = vi.fn(() => { const request = deferred(); requests.push(request); return request.promise; });
  const source: DashboardDataSource = { isDemo, load };
  return { source, requests, load };
}
const view = (source: DashboardDataSource, current = context, strict = false) => {
  const page = <MemoryRouter><DashboardPage context={current} dataSource={source} routes={routes} /></MemoryRouter>;
  return strict ? <StrictMode>{page}</StrictMode> : page;
};

describe('Dashboard: fuente y contexto vigente', () => {
  it.each(['datasource', 'tenant', 'identity', 'permissions'])('invalida inmediatamente A al cambiar %s y descarta A tardía antes de resolver B', async (change) => {
    const a = controlled();
    const b = change === 'datasource' ? controlled(false) : a;
    const rendered = render(view(a.source, context, true));
    expect(a.requests).toHaveLength(2);
    await act(async () => { await Promise.resolve(); a.requests[1]?.resolve(snapshot('DEMO-A')); });
    expect(screen.getByText('DEMO-A')).toBeDefined();
    const next = change === 'tenant' ? { ...context, tenantId: 'tenant-demo-B' }
      : change === 'identity' ? { ...context, identity: 'session-demo-B' }
      : change === 'permissions' ? { ...context, permissions: [...context.permissions, { code: 'receptions.read', scopes: ['tenant'] }] } : context;
    rendered.rerender(view(b.source, next, true));
    expect(screen.queryByText('DEMO-A')).toBeNull();
    expect(screen.getByText('Cargando el resumen del taller…')).toBeDefined();
    expect(screen.queryByText('Datos de demostración') === null).toBe(change === 'datasource');
    await act(async () => { await Promise.resolve(); a.requests[0]?.resolve(snapshot('DEMO-A-TARDIA')); });
    expect(screen.queryByText('DEMO-A-TARDIA')).toBeNull();
    expect(screen.getByText('Cargando el resumen del taller…')).toBeDefined();
    await act(async () => { await Promise.resolve(); b.requests.at(-1)?.resolve(snapshot('DEMO-B')); });
    expect(screen.getByText('DEMO-B')).toBeDefined();
    expect(screen.queryByText('DEMO-A')).toBeNull();
  });

  it.each(['resolve', 'reject'])('una promesa vieja no puede sobrescribir B listo al %s', async (settlement) => {
    const a = controlled();
    const b = controlled(false);
    const rendered = render(view(a.source));
    rendered.rerender(view(b.source));
    await act(async () => { await Promise.resolve(); b.requests[0]?.resolve(snapshot('DEMO-B')); });
    await act(async () => { await Promise.resolve();
      if (settlement === 'resolve') a.requests[0]?.resolve(snapshot('DEMO-A'));
      else a.requests[0]?.reject(new Error('fallo viejo'));
    });
    expect(screen.getByText('DEMO-B')).toBeDefined();
    expect(screen.queryByText('DEMO-A')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('volver a la misma fuente no recupera el snapshot de un intento anterior', async () => {
    const a = controlled(); const b = controlled();
    const rendered = render(view(a.source));
    await act(async () => { await Promise.resolve(); a.requests[0]?.resolve(snapshot('DEMO-A')); });
    rendered.rerender(view(b.source));
    rendered.rerender(view(a.source));
    expect(screen.queryByText('DEMO-A')).toBeNull();
    await act(async () => { await Promise.resolve(); b.requests[0]?.resolve(snapshot('DEMO-B')); });
    expect(screen.queryByText('DEMO-B')).toBeNull();
    await act(async () => { await Promise.resolve(); a.requests[1]?.resolve(snapshot('DEMO-A-NUEVA')); });
    expect(screen.getByText('DEMO-A-NUEVA')).toBeDefined();
  });

  it('el aviso demo permanece en loading, empty, error, retry y populated', async () => {
    const source = controlled(); const rendered = render(view(source.source));
    expect(screen.getByText('Datos de demostración')).toBeDefined();
    await act(async () => { await Promise.resolve(); source.requests[0]?.resolve(empty); });
    expect(screen.getByText('Todavía no hay actividad')).toBeDefined();
    expect(screen.getByText('Datos de demostración')).toBeDefined();
    const failing = controlled(); rendered.rerender(view(failing.source));
    await act(async () => { await Promise.resolve(); failing.requests[0]?.reject(new Error('fallo demo')); });
    expect(screen.getByText('No se pudo cargar el resumen')).toBeDefined();
    expect(screen.getByText('Datos de demostración')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('Datos de demostración')).toBeDefined();
    expect(screen.getByText('Cargando el resumen del taller…')).toBeDefined();
    await act(async () => { await Promise.resolve(); failing.requests[1]?.resolve(snapshot('DEMO-001')); });
    expect(screen.getByText('DEMO-001')).toBeDefined();
    expect(screen.getByText('Datos de demostración')).toBeDefined();
  });
});

describe('Dashboard: grants efectivos y scopes', () => {
  it.each(['tenant', 'assigned', 'quality_control'])('dashboard.operational.read con %s', async (scope) => {
    const source = controlled();
    render(view(source.source, { ...context, permissions: [{ code: 'dashboard.operational.read', scopes: [scope] }] }));
    if (scope === 'tenant') {
      expect(source.load).toHaveBeenCalledTimes(1);
      await act(async () => { await Promise.resolve(); source.requests[0]?.resolve(snapshot('DEMO-001')); });
      expect(screen.getByRole('region', { name: 'Actividad reciente' })).toBeDefined();
    } else {
      expect(screen.getByRole('alert').textContent).toContain('No tienes permiso');
      expect(source.load).not.toHaveBeenCalled();
    }
  });

  it('dashboard.business.read tenant por sí solo no carga contenido operacional', () => {
    const source = controlled();
    render(view(source.source, { ...context, permissions: [{ code: 'dashboard.business.read', scopes: ['tenant'] }] }));
    expect(screen.getByRole('alert')).toBeDefined();
    expect(source.load).not.toHaveBeenCalled();
  });

  it.each(['tenant', 'assigned', 'quality_control'])('accesos rápidos de Recepciones con %s coinciden con los guards de destino', async (scope) => {
    const permissions: EffectivePermissions = [...context.permissions, ...['receptions.read', 'receptions.create'].map((code) => ({ code, scopes: [scope] }))];
    render(view({ load: () => Promise.resolve(snapshot('DEMO-001')) }, { ...context, permissions }));
    await screen.findByText('DEMO-001');
    expect(screen.queryByRole('link', { name: 'Ver recepciones' }) !== null).toBe(scope === 'tenant');
    expect(screen.queryAllByRole('link', { name: 'Nueva recepción' }).length).toBe(scope === 'tenant' ? 2 : 0);
  });

  it('revocar scope tenant oculta datos y descarta respuestas en vuelo', async () => {
    const source = controlled(); const rendered = render(view(source.source));
    rendered.rerender(view(source.source, { ...context, permissions: [{ code: 'dashboard.operational.read', scopes: ['assigned'] }] }));
    await act(async () => { await Promise.resolve(); source.requests[0]?.resolve(snapshot('DEMO-001')); });
    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.queryByText('DEMO-001')).toBeNull();
    expect(source.load).toHaveBeenCalledTimes(1);
  });
});
