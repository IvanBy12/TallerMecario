import { AuthContextProvider } from '@/features/auth/auth-provider';
import type { WorkshopContext } from '@/features/auth/me-contract';
import type { WorkshopContextSource } from '@/features/auth/workshop-context';
import { createApiClient } from '@/shared/api/http-client';
import { createFakeSessionPort, signedInSnapshot } from '@/test/render-with-auth';
import { AuthenticatedRoot } from './authenticated-root';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockDashboardDataSource,
  type DashboardDataSource,
} from '@/features/dashboard/dashboard-data-source';
import type { DashboardSnapshot } from '@/features/dashboard/dashboard-types';
import { jsonResponse, PERMISSIONS, renderReception } from '@/test/render-reception';

import { AppRoutes } from './app-routes';

const instant = createMockDashboardDataSource({ delayMs: 0, now: () => new Date('2026-10-02T15:00:00Z') });

const EMPTY: DashboardSnapshot = {
  kpis: [
    { id: 'receptions_today', value: 0 },
    { id: 'in_diagnosis', value: 0 },
    { id: 'in_repair', value: 0 },
    { id: 'awaiting_authorization', value: 0 },
    { id: 'ready_for_delivery', value: 0 },
  ],
  activity: [],
  pendingWork: [],
};

function renderPanel(options: {
  readonly permissions: readonly string[];
  readonly dataSource?: DashboardDataSource;
  readonly workshopName?: string;
}) {
  return render(
    <MemoryRouter initialEntries={['/panel']}>
      <AppRoutes
        shellStatus="context_ready"
        onSignOut={() => undefined}
        workshopName={options.workshopName ?? 'Taller Alfa'}
        grantedPermissions={new Set(options.permissions)}
        dashboardDataSource={options.dataSource ?? instant}
        receptionRuntime={{ identity: 'demo-session', tenantId: 'demo-tenant', apiClient: createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'no_session' }) }), permissions: options.permissions.map((code) => ({ code, scopes: ['tenant'] })) }}
      />
    </MemoryRouter>,
  );
}

const main = () => screen.getByRole('main');
const WITH_DASHBOARD = [...PERMISSIONS, { code: 'dashboard.operational.read', scopes: ['tenant' as const] }];
const FULL = ['dashboard.operational.read', 'receptions.create', 'receptions.read', 'customers.read', 'vehicles.read'];

describe('Dashboard operativo en /panel', () => {
  it('renderiza el resumen con el taller del contexto, KPIs, actividad y trabajo pendiente', async () => {
    renderPanel({ permissions: FULL });

    expect(await screen.findByRole('heading', { level: 1, name: 'Resumen del taller' })).toBeDefined();
    expect(within(main()).getByText('Taller Alfa')).toBeDefined();
    expect(within(main()).getByText('Esto es lo que está pasando hoy')).toBeDefined();

    const section = await screen.findByRole('region', { name: 'Indicadores de hoy' });
    const labels = within(section).getAllByRole('listitem').map((item) => item.textContent);
    expect(labels).toEqual([
      'Recepciones hoy6',
      'En diagnóstico3',
      'En reparación4',
      'Esperando autorización2',
      'Listos para entregar2',
    ]);

    const activity = screen.getByRole('region', { name: 'Actividad reciente' });
    expect(within(activity).getAllByRole('listitem')).toHaveLength(6);
    expect(within(activity).getByText('DEMO-001')).toBeDefined();
    expect(within(activity).getByText('Recepción creada')).toBeDefined();
    expect(within(activity).getByText('Cliente demo 01')).toBeDefined();

    const pending = screen.getByRole('region', { name: 'Requiere atención' });
    expect(within(pending).getByText('Diagnósticos pendientes')).toBeDefined();
    expect(within(pending).getByText('Autorizaciones pendientes')).toBeDefined();
    expect(within(pending).queryAllByRole('link')).toHaveLength(0); // sin rutas reales de órdenes
    expect(screen.getByText('Datos de demostración')).toBeDefined();
  });

  it('el CTA «Nueva recepción» apunta a la ruta real y navega al formulario', async () => {
    renderReception('/panel', () => jsonResponse({}), WITH_DASHBOARD);
    // Hay un CTA de cabecera y un acceso rápido: ambos usan la misma ruta real.
    await screen.findByRole('region', { name: 'Accesos rápidos' });
    const links = screen.getAllByRole('link', { name: 'Nueva recepción' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.getAttribute('href')).toBe('/recepciones/nueva');

    fireEvent.click(links[0] as HTMLElement);
    expect(await screen.findByRole('heading', { level: 1, name: 'Nueva recepción' })).toBeDefined();
  });

  it('«Ver recepciones» lleva al listado de Recepciones, que sigue accesible', async () => {
    renderReception('/panel', (call) =>
      call.url.pathname === '/api/v1/receptions' ? jsonResponse({ receptions: [], nextCursor: null }) : jsonResponse({}),
      WITH_DASHBOARD,
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Ver recepciones' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Recepciones' })).toBeDefined();
  });

  it('los accesos rápidos solo enlazan rutas reales; Clientes y Vehículos tienen rutas CRM', async () => {
    renderPanel({ permissions: FULL });
    const actions = await screen.findByRole('region', { name: 'Accesos rápidos' });

    const hrefs = within(actions).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['/recepciones/nueva', '/recepciones', '/clientes', '/vehiculos']);
    expect(within(actions).getByRole('link', { name: /Clientes/ }).getAttribute('href')).toBe('/clientes');
    expect(within(actions).getByRole('link', { name: /Vehículos/ }).getAttribute('href')).toBe('/vehiculos');
    expect(within(actions).getByText('Clientes')).toBeDefined();
    expect(within(actions).queryByText('Próximamente')).toBeNull();
  });

  it('solo muestra los accesos y el CTA que los permisos efectivos permiten', async () => {
    renderPanel({ permissions: ['dashboard.operational.read', 'receptions.read'] });
    const actions = await screen.findByRole('region', { name: 'Accesos rápidos' });
    expect(within(actions).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/recepciones']);
    expect(screen.queryByRole('link', { name: 'Nueva recepción' })).toBeNull();
  });

  it.each<{ roles: WorkshopContext['roles'] }>([{ roles: ['owner'] }, { roles: ['technician'] }, { roles: ['admin', 'service_advisor'] }])('context.roles=%j no cambia el acceso con el mismo grant tenant', async ({ roles }) => {
    const port = createFakeSessionPort(signedInSnapshot());
    const apiClient = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'no_session' }) });
    const context: WorkshopContext = {
      tenantId: 'demo-tenant', membershipId: 'demo-membership', userId: 'demo-user',
      workshop: { displayName: 'Taller demo', timezone: 'America/Bogota', currency: 'COP' },
      roles, permissions: [{ code: 'dashboard.operational.read', scopes: ['tenant'] }],
    };
    const contextSource: WorkshopContextSource = { load: () => Promise.resolve({ ok: true, data: { kind: 'single', membership: { tenantId: context.tenantId, membershipId: context.membershipId }, context } }) };
    render(<AuthContextProvider port={port} apiClient={apiClient} contextSource={contextSource}><MemoryRouter initialEntries={['/panel']}><AuthenticatedRoot /></MemoryRouter></AuthContextProvider>);
    expect(await screen.findByRole('region', { name: 'Indicadores de hoy' })).toBeDefined();
  });

  it('owner sin el grant operacional no recibe acceso por su rol', async () => {
    const port = createFakeSessionPort(signedInSnapshot());
    const apiClient = createApiClient({ apiOrigin: 'https://api.example.test', getToken: () => Promise.resolve({ kind: 'no_session' }) });
    const contextSource: WorkshopContextSource = { load: () => Promise.resolve({ ok: true, data: {
      kind: 'single', membership: { tenantId: 'demo-tenant', membershipId: 'demo-member' },
      context: { tenantId: 'demo-tenant', membershipId: 'demo-member', userId: 'demo-user', workshop: { displayName: 'Taller demo', timezone: 'America/Bogota', currency: 'COP' }, roles: ['owner'], permissions: [{ code: 'dashboard.business.read', scopes: ['tenant'] }] },
    } }) };
    render(<AuthContextProvider port={port} apiClient={apiClient} contextSource={contextSource}><MemoryRouter initialEntries={['/panel']}><AuthenticatedRoot /></MemoryRouter></AuthContextProvider>);
    expect((await screen.findByRole('alert')).textContent).toContain('No tienes permiso');
    expect(screen.queryByRole('region', { name: 'Indicadores de hoy' })).toBeNull();
  });

  it('sin dashboard.operational.read muestra acceso restringido y no lee datos', () => {
    const load = vi.fn(() => Promise.resolve(EMPTY));
    renderPanel({ permissions: ['receptions.read', 'receptions.create', 'dashboard.business.read'], dataSource: { load } });

    expect(screen.getByRole('heading', { level: 1, name: 'Resumen del taller' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('No tienes permiso para acceder a esta sección.');
    expect(screen.queryByRole('region', { name: 'Indicadores de hoy' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Actividad reciente' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nueva recepción' })).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('sin catálogo de permisos (contexto pendiente) también es acceso restringido', () => {
    render(
      <MemoryRouter initialEntries={['/panel']}>
        <AppRoutes shellStatus="context_pending" onSignOut={() => undefined} dashboardDataSource={instant} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert').textContent).toContain('No tienes permiso');
  });

  it('muestra esqueletos accesibles mientras carga', () => {
    renderPanel({ permissions: FULL, dataSource: { load: () => new Promise(() => undefined) } });
    expect(screen.getByRole('status').textContent).toContain('Cargando el resumen del taller');
    expect(screen.queryByRole('region', { name: 'Actividad reciente' })).toBeNull();
  });

  it('muestra el estado vacío con CTA cuando no hay actividad', async () => {
    renderPanel({ permissions: FULL, dataSource: { load: () => Promise.resolve(EMPTY) } });
    expect(await screen.findByRole('heading', { name: 'Todavía no hay actividad' })).toBeDefined();
    // CTA de cabecera + CTA del estado vacío.
    const ctas = within(main()).getAllByRole('link', { name: 'Nueva recepción' });
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) expect(cta.getAttribute('href')).toBe('/recepciones/nueva');
    expect(screen.queryByRole('region', { name: 'Indicadores de hoy' })).toBeNull();
  });

  it('el estado vacío no ofrece CTA sin permiso de crear recepciones', async () => {
    renderPanel({ permissions: ['dashboard.operational.read'], dataSource: { load: () => Promise.resolve(EMPTY) } });
    expect(await screen.findByRole('heading', { name: 'Todavía no hay actividad' })).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Nueva recepción' })).toBeNull();
  });

  it('muestra el error y se recupera al reintentar', async () => {
    const load = vi
      .fn<DashboardDataSource['load']>()
      .mockRejectedValueOnce(new Error('fallo sintético'))
      .mockImplementation((signal) => instant.load(signal));
    renderPanel({ permissions: FULL, dataSource: { load } });

    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar el resumen');
    expect(screen.queryByText('fallo sintético')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Actividad reciente' })).toBeDefined();
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cancela la lectura al salir del panel', async () => {
    let received: AbortSignal | undefined;
    const view = renderPanel({
      permissions: FULL,
      dataSource: {
        load: (signal) => {
          received = signal;
          return new Promise(() => undefined);
        },
      },
    });
    await waitFor(() => { expect(received).toBeDefined(); });
    view.unmount();
    expect(received?.aborted).toBe(true);
  });
});
