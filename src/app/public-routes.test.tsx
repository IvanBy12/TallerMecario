import { fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app/App';
import { NAVIGATION_ITEMS } from '@/app/navigation';
import type { AuthSessionPort } from '@/features/auth/session-port';
import type { PublicEnvResult } from '@/shared/config/public-env';

import { PUBLIC_SECTIONS, TRIAL_PATH } from '@/features/public/public-links';

const session = vi.hoisted(() => {
  const state: { snapshot: AuthSessionPort['snapshot']; mountClerk: ReturnType<typeof vi.fn<() => void>>; unmountClerk: ReturnType<typeof vi.fn<() => void>> } = {
    snapshot: { status: 'signed_out' },
    mountClerk: vi.fn(),
    unmountClerk: vi.fn(),
  };
  return state;
});

vi.mock('@/features/auth/clerk-session', () => ({
  ClerkAuthSessionProvider: ({ children }: { readonly children: ReactNode }) => {
    useEffect(() => {
      session.mountClerk();
      return () => { session.unmountClerk(); };
    }, []);
    return <>{children}</>;
  },
  ClerkSignInPanel: () => <p>Panel de inicio de sesión de Clerk</p>,
  useAuthSessionPort: (): AuthSessionPort => {
    const snapshot = session.snapshot;
    return useMemo(() => ({
      snapshot,
      getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic-test-token' }),
      signOut: () => Promise.resolve(),
    }), [snapshot]);
  },
}));

const configuredEnv: PublicEnvResult = {
  ok: true,
  env: { appEnv: 'local', apiOrigin: 'https://api.example.test', clerkPublishableKey: 'pk_test_c3ludGhldGlj' },
};
const tenantId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

function mount(path: string, envResult = configuredEnv) {
  window.history.replaceState(null, '', path);
  return render(<App envResult={envResult} />);
}

beforeEach(() => {
  session.snapshot = { status: 'signed_out' };
  session.mountClerk.mockClear();
  session.unmountClerk.mockClear();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected request'));
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('S3-UI-01: rutas públicas y frontera de sesión', () => {
  it('/ muestra la landing sin sesión, Clerk ni llamadas de contexto', () => {
    mount('/');
    expect(screen.getByRole('heading', { level: 1, name: 'La operación completa de tu taller, en un solo lugar.' })).toBeDefined();
    expect(session.mountClerk).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull();
  });

  it('la landing sigue disponible con configuración de autenticación inválida', () => {
    mount('/', { ok: false, issues: [{ variable: 'VITE_CLERK_PUBLISHABLE_KEY', reason: 'invalid_publishable_key' }] });
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(session.mountClerk).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('/login presenta el layout y el panel existente de Clerk sin pedir contexto', async () => {
    mount('/login');
    expect(screen.getByRole('heading', { level: 1, name: 'Bienvenido a tu taller.' })).toBeDefined();
    expect(await screen.findByText('Panel de inicio de sesión de Clerk')).toBeDefined();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each<PublicEnvResult>([
    { ok: false, issues: [{ variable: 'VITE_CLERK_PUBLISHABLE_KEY', reason: 'invalid_publishable_key' }] },
    { ok: true, env: { appEnv: 'local', apiOrigin: null, clerkPublishableKey: null } },
  ])('/login mantiene su layout cuando falta configuración válida (%j)', (envResult) => {
    mount('/login', envResult);
    expect(screen.getByRole('heading', { level: 1, name: 'Bienvenido a tu taller.' })).toBeDefined();
    expect(screen.getByRole('alert')).toBeDefined();
    expect(session.mountClerk).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('el CTA de inicio de sesión navega a /login', async () => {
    mount('/');
    const nav = screen.getByRole('navigation', { name: 'Navegación pública' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Iniciar sesión' }));
    expect(window.location.pathname).toBe('/login');
    expect(await screen.findByText('Panel de inicio de sesión de Clerk')).toBeDefined();
    fireEvent.click(screen.getByRole('link', { name: /Volver al inicio/ }));
    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { level: 1, name: /La operación completa/ })).toBeDefined();
  });

  it('los CTA comerciales tienen el destino provisional centralizado', () => {
    mount('/');
    const trial = screen.getByRole('link', { name: /Probar gratis 7 días/ });
    expect(trial.getAttribute('href')).toBe(TRIAL_PATH);
    expect(screen.getByRole('link', { name: /Crear mi taller/ }).getAttribute('href')).toBe(TRIAL_PATH);
    expect(screen.getAllByRole('link', { name: /Probar gratis/ }).every((link) => link.getAttribute('href') === TRIAL_PATH)).toBe(true);
  });

  it('los anchors apuntan a secciones semánticas y presenta el flujo y los siete módulos', () => {
    mount('/');
    const nav = screen.getByRole('navigation', { name: 'Navegación pública' });
    for (const section of PUBLIC_SECTIONS) {
      const link = within(nav).getByRole('link', { name: section.label });
      expect(link.getAttribute('href')).toBe(`#${section.id}`);
      expect(document.getElementById(section.id)?.tagName).toBe('SECTION');
    }
    expect(screen.getByRole('link', { name: /Ver cómo funciona/ }).getAttribute('href')).toBe('#como-funciona');
    const workflow = document.getElementById('como-funciona');
    expect(workflow).not.toBeNull();
    if (workflow === null) throw new Error('falta el flujo');
    expect(within(workflow).getAllByRole('listitem')).toHaveLength(6);
    for (const name of ['Recepciones', 'Clientes', 'Vehículos', 'Órdenes', 'Inventario', 'Historial', 'Indicadores']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeDefined();
    }
    expect(screen.getByRole('heading', { name: 'Tu cliente no necesita instalar otra aplicación.' })).toBeDefined();
  });

  it('el menú móvil abre, cierra con Escape y devuelve el foco', () => {
    mount('/');
    const toggle = screen.getByRole('button', { name: 'Abrir menú' });
    const nav = screen.getByRole('navigation', { name: 'Navegación pública' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(nav.id);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(nav.classList.contains('is-open')).toBe(true);
    const product = within(nav).getByRole('link', { name: 'Producto' });
    product.focus();
    fireEvent.keyDown(product, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(nav.classList.contains('is-open')).toBe(false);
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    // jsdom no implementa navegación de documentos; los anchors se verifican también en navegador.
    product.addEventListener('click', (event) => { event.preventDefault(); }, { once: true });
    fireEvent.click(product);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('el login del menú móvil navega y no deja el menú abierto', async () => {
    mount('/');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Navegación pública' })).getByRole('link', { name: 'Iniciar sesión' }));
    expect(await screen.findByText('Panel de inicio de sesión de Clerk')).toBeDefined();
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByRole('button', { name: 'Cerrar menú' })).toBeNull();
  });

  it.each(NAVIGATION_ITEMS.map((item) => [item.path]))('%s permanece protegida sin sesión', async (path) => {
    mount(path);
    expect(await screen.findByText('Panel de inicio de sesión de Clerk')).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('una sesión existente en / no monta contexto ni altera la landing', () => {
    session.snapshot = { status: 'signed_in', identity: 'synthetic:session' };
    mount('/');
    expect(screen.getByRole('heading', { level: 1, name: /La operación completa/ })).toBeDefined();
    expect(session.mountClerk).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('la sesión existente en /login entra al panel respetando el contexto y permisos G5', async () => {
    session.snapshot = { status: 'signed_in', identity: 'synthetic:session' };
    vi.mocked(globalThis.fetch).mockImplementation((input) => Promise.resolve(new Response(JSON.stringify(
      requestUrl(input).endsWith('/me')
        ? { user: { id: userId }, memberships: [{ tenantId, membershipId }], tenantSelection: { mode: 'automatic', tenantId } }
        : { context: { tenantId, membershipId, userId, workshop: { displayName: 'Taller de ejemplo', timezone: 'America/Bogota', currency: 'COP' }, roles: ['owner'], permissions: [{ code: 'dashboard.operational.read', scopes: ['tenant'] }] } },
    ), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    mount('/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Panel' })).toBeDefined();
    expect(window.location.pathname).toBe('/panel');
    expect(screen.queryByText('Panel de inicio de sesión de Clerk')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Clientes' })).toBeNull();
    expect(vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => requestUrl(input).endsWith('/me'))).toHaveLength(1);
    expect(vi.mocked(globalThis.fetch).mock.calls.filter(([input]) => requestUrl(input).endsWith('/me/context'))).toHaveLength(1);
    expect(session.mountClerk).toHaveBeenCalledTimes(1);
    expect(session.unmountClerk).not.toHaveBeenCalled();
  });


  it('seleccionar taller B en /login conserva G5 al navegar al panel sin reiniciar selección', async () => {
    const tenantB = '44444444-4444-4444-8444-444444444444';
    const membershipB = '55555555-5555-4555-8555-555555555555';
    session.snapshot = { status: 'signed_in', identity: 'synthetic:session' };
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation((input, init) => {
      const url = requestUrl(input);
      if (url.endsWith('/me')) {
        return Promise.resolve(new Response(JSON.stringify({
          user: { id: userId },
          memberships: [{ tenantId, membershipId }, { tenantId: tenantB, membershipId: membershipB }],
          tenantSelection: { mode: 'required', tenantId: null },
        }), { status: 200 }));
      }
      if (!url.endsWith('/me/context')) throw new Error('unexpected request');
      const selectedTenant = new Headers(init?.headers).get('X-Tenant-Id');
      if (selectedTenant !== tenantId && selectedTenant !== tenantB) throw new Error('unexpected tenant');
      return Promise.resolve(new Response(JSON.stringify({
        context: {
          tenantId: selectedTenant,
          membershipId: selectedTenant === tenantB ? membershipB : membershipId,
          userId,
          workshop: { displayName: selectedTenant === tenantB ? 'Taller Beta' : 'Taller Alfa', timezone: 'America/Bogota', currency: 'COP' },
          roles: ['owner'],
          permissions: [{ code: 'dashboard.operational.read', scopes: ['tenant'] }],
        },
      }), { status: 200 }));
    });

    mount('/login');
    expect(await screen.findByRole('heading', { name: 'Selecciona un taller' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Taller Alfa' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Taller Beta' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Panel' })).toBeDefined();
    expect(window.location.pathname).toBe('/panel');
    expect(screen.queryByRole('heading', { name: 'Selecciona un taller' })).toBeNull();
    expect(screen.getByText('Taller Beta')).toBeDefined();
    expect(screen.queryByText('Taller Alfa')).toBeNull();
    // G5 hace un bootstrap para descubrir los nombres y otro para validar la selección.
    // La navegación al panel no debe iniciar un tercero ni desmontar el proveedor.
    expect(fetchMock.mock.calls.filter(([input]) => requestUrl(input).endsWith('/me'))).toHaveLength(2);
    const contextRequests = fetchMock.mock.calls.filter(([input]) => requestUrl(input).endsWith('/me/context'));
    expect(contextRequests.map(([, init]) => new Headers(init?.headers).get('X-Tenant-Id'))).toEqual([tenantId, tenantB, tenantB]);
    expect(session.mountClerk).toHaveBeenCalledTimes(1);
    expect(session.unmountClerk).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
  });

  it('la sesión sin membership conserva el estado sin acceso, sin crear un taller implícito', async () => {
    session.snapshot = { status: 'signed_in', identity: 'synthetic:session' };
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response(JSON.stringify({
      user: null, memberships: [], tenantSelection: { mode: 'unavailable', tenantId: null },
    }), { status: 200 }));
    mount('/login');
    expect(await screen.findByText('Tu cuenta no tiene acceso activo a un taller.')).toBeDefined();
    expect(window.location.pathname).toBe('/login');
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull();
  });
});
