import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthGate, type AuthGateActions } from './auth-gate';
import type { AuthState } from './workshop-context';

vi.mock('./clerk-session', () => ({
  ClerkSignInPanel: () => <div data-testid="clerk-signin" />,
}));

const actions: AuthGateActions = {
  onSignOut: vi.fn(),
  onSignInAgain: vi.fn(),
  onRetry: vi.fn(),
  onReload: vi.fn(),
  onDismissNotice: vi.fn(),
};

function renderState(state: AuthState) {
  return render(<AuthGate state={state} actions={actions} />);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('AuthGate', () => {
  it('config_error con issues nombra la variable y el motivo, nunca el valor', () => {
    renderState({
      kind: 'config_error',
      issues: [
        { variable: 'VITE_CLERK_PUBLISHABLE_KEY', reason: 'invalid_publishable_key' },
        { variable: 'VITE_API_BASE_URL', reason: 'invalid_origin' },
      ],
    });

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('VITE_CLERK_PUBLISHABLE_KEY')).toBeDefined();
    expect(screen.getByText('VITE_API_BASE_URL')).toBeDefined();
    // El estado solo transporta variable + motivo; ningún valor configurado se renderiza.
    expect(document.body.textContent).not.toContain('secret');
  });

  it('config_error por configuración ausente nombra ambas variables', () => {
    renderState({ kind: 'config_error', issues: 'missing_auth_config' });

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('VITE_CLERK_PUBLISHABLE_KEY')).toBeDefined();
    expect(screen.getByText('VITE_API_BASE_URL')).toBeDefined();
  });

  it('loading_identity anuncia la carga sin contenido protegido ni inicio de sesión', () => {
    renderState({ kind: 'loading_identity' });

    expect(screen.getByRole('status').textContent).toContain('Cargando sesión');
    expect(screen.queryByTestId('clerk-signin')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('signed_out muestra el inicio de sesión embebido', () => {
    renderState({ kind: 'signed_out' });

    expect(screen.getByRole('heading', { level: 2, name: 'Inicia sesión' })).toBeDefined();
    expect(screen.getByTestId('clerk-signin')).toBeDefined();
  });

  it('signed_in_context_pending no muestra datos de taller ni la identidad', () => {
    renderState({ kind: 'signed_in_context_pending', identity: 'user-1:session-1' });

    expect(screen.getByRole('status').textContent).toContain('El acceso a talleres aún no está integrado');
    expect(document.body.textContent).not.toContain('user-1');
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeDefined();
  });

  it('auth_rejected muestra request_id y ofrece reintentar o cerrar sesión', () => {
    renderState({ kind: 'auth_rejected', identity: 'id-A', requestId: 'req-401' });

    expect(screen.getByRole('alert').textContent).toContain('El servidor no aceptó tu sesión');
    expect(screen.getByText('req-401')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeDefined();
  });

  it('fatal_error no ofrece reintento y sí cerrar sesión y recargar', () => {
    renderState({ kind: 'fatal_error', identity: 'id-A', reason: 'contract_violation', requestId: 'req-1' });

    expect(screen.getByRole('alert').textContent).toContain('Ocurrió un error inesperado');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeDefined();
  });

  it('recoverable_error usa copy propio por razón, sin hablar de red en identity_client_error', () => {
    renderState({
      kind: 'recoverable_error',
      identity: 'id-A',
      reason: 'identity_client_error',
      requestId: null,
      retryNotBefore: null,
    });

    const alert = screen.getByRole('alert').textContent;
    expect(alert).toContain('Error al preparar tu sesión');
    expect(alert.toLowerCase()).not.toContain('red');
  });

  it('workshop_selection_required no muestra identificadores de taller', () => {
    renderState({
      kind: 'workshop_selection_required',
      identity: 'id-A',
      memberships: [{ tenantId: 'T-A', membershipId: 'M-A' }],
      notice: null,
    });

    expect(screen.getByRole('status').textContent).toContain('selección de taller aún no está disponible');
    expect(document.body.textContent).not.toContain('T-A');
    expect(document.body.textContent).not.toContain('M-A');
  });

  it('ready muestra el taller activo y, si está degradado, el aviso y *Reintentar*', () => {
    renderState({
      kind: 'ready',
      identity: 'id-A',
      tenantId: 'T-A',
      membershipId: 'M-A',
      notice: null,
      degraded: { reason: 'network', requestId: 'req-9', retryNotBefore: null },
    });

    expect(screen.getByRole('status').textContent).toContain('No se pudo verificar tu acceso');
    expect(screen.getByText('req-9')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDefined();
  });

  it('el aviso es visible y descartable', () => {
    renderState({
      kind: 'no_access',
      identity: 'id-A',
      notice: 'workshop_access_revoked',
    });

    expect(screen.getByRole('status').textContent).toContain('Tu acceso al taller cambió');
    expect(screen.getByRole('button', { name: 'Descartar aviso' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDefined();
  });

  it('sesión terminada ofrece iniciar sesión de nuevo', () => {
    renderState({ kind: 'session_expired' });

    expect(screen.getByRole('status').textContent).toContain('Tu sesión terminó');
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeDefined();
  });

  it('la espera de 429 mantiene *Reintentar* deshabilitado hasta la marca', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    renderState({
      kind: 'recoverable_error',
      identity: 'id-A',
      reason: 'rate_limited',
      requestId: null,
      retryNotBefore: now + 5000,
    });

    expect(screen.getByRole('button', { name: 'Reintentar' })).toHaveProperty('disabled', true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(screen.getByRole('button', { name: 'Reintentar' })).toHaveProperty('disabled', false);
  });

  it('se habilita al vencer el plazo y sincroniza de inmediato si el efecto arranca vencido', async () => {
    vi.useFakeTimers();
    const base = Date.now();
    const retryButton = () => screen.getByRole('button', { name: 'Reintentar' });

    // Cooldown activo: deshabilitado mientras no se alcanza la marca.
    const view = renderState({
      kind: 'recoverable_error',
      identity: 'id-A',
      reason: 'rate_limited',
      requestId: null,
      retryNotBefore: base + 5000,
    });
    expect(retryButton()).toHaveProperty('disabled', true);

    // Se alcanza el deadline: el temporizador lo habilita sin polling adicional.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(retryButton()).toHaveProperty('disabled', false);

    // El efecto arranca con el plazo ya vencido: el reloj debe corregirse de inmediato.
    vi.setSystemTime(base + 20000);
    view.rerender(
      <AuthGate
        state={{
          kind: 'recoverable_error',
          identity: 'id-A',
          reason: 'rate_limited',
          requestId: null,
          retryNotBefore: base + 10000,
        }}
        actions={actions}
      />,
    );
    expect(retryButton()).toHaveProperty('disabled', false);
  });

  it('sin espera, *Reintentar* está habilitado', () => {
    renderState({
      kind: 'recoverable_error',
      identity: 'id-A',
      reason: 'network',
      requestId: null,
      retryNotBefore: null,
    });

    expect(screen.getByRole('button', { name: 'Reintentar' })).toHaveProperty('disabled', false);
  });
});
