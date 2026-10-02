import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app/App';
import { NAVIGATION_ITEMS } from '@/app/navigation';
import type { AuthSessionPort } from '@/features/auth/session-port';
import type { PublicEnvResult } from '@/shared/config/public-env';

import { PUBLIC_SECTIONS, TRIAL_PATH } from '@/features/public/public-links';

const session = vi.hoisted(() => {
  const state: { snapshot: AuthSessionPort['snapshot']; mountClerk: ReturnType<typeof vi.fn<() => void>> } = {
    snapshot: { status: 'signed_out' },
    mountClerk: vi.fn(),
  };
  return state;
});

vi.mock('@/features/auth/clerk-session', () => ({
  ClerkAuthSessionProvider: ({ children }: { readonly children: ReactNode }) => {
    session.mountClerk();
    return <>{children}</>;
  },
  ClerkSignInPanel: () => <p>Panel de inicio de sesión de Clerk</p>,
  useAuthSessionPort: (): AuthSessionPort => ({
    snapshot: session.snapshot,
    getToken: () => Promise.resolve({ kind: 'token', token: 'synthetic-test-token' }),
    signOut: () => Promise.resolve(),
  }),
}));

const configuredEnv: PublicEnvResult = {
  ok: true,
  env: { appEnv: 'local', apiOrigin: 'https://api.example.test', clerkPublishableKey: 'pk_test_c3ludGhldGlj' },
};
const tenantId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

function mount(path: string, envResult = configuredEnv) {
  window.history.replaceState(null, '', path);
  return render(<App envResult={envResult} />);
}

beforeEach(() => {
  session.snapshot = { status: 'signed_out' };
  session.mountClerk.mockClear();
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
      (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).endsWith('/me')
        ? { user: { id: userId }, memberships: [{ tenantId, membershipId }], tenantSelection: { mode: 'automatic', tenantId } }
        : { context: { tenantId, membershipId, userId, workshop: { displayName: 'Taller de ejemplo', timezone: 'America/Bogota', currency: 'COP' }, roles: ['owner'], permissions: [{ code: 'dashboard.operational.read', scopes: ['tenant'] }] } },
    ), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    mount('/login');
    expect(await screen.findByRole('heading', { level: 1, name: 'Panel' })).toBeDefined();
    expect(window.location.pathname).toBe('/panel');
    expect(screen.queryByText('Panel de inicio de sesión de Clerk')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Clientes' })).toBeNull();
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
