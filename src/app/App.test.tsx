import { BrowserRouter, useBlocker } from 'react-router-dom';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app/App';

const clerkKey = (environment: 'test' | 'live', payload = 'Zm9vLmJhcg') =>
  ['pk', environment, payload].join('_');

describe('App', () => {
  beforeEach(() => { window.history.replaceState(null, '', '/panel'); });
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('caso 1: entorno público inválido muestra la pantalla de configuración', () => {
    render(
      <App
        envResult={{
          ok: false,
          issues: [
            { variable: 'VITE_APP_ENV', reason: 'unknown_value' },
            { variable: 'VITE_API_BASE_URL', reason: 'invalid_origin' },
          ],
        }}
      />,
    );

    expect(screen.getByRole('main')).toBeDefined();
    expect(screen.getByRole('heading', { level: 1, name: 'TallerMecario' })).toBeDefined();
    expect(screen.getByRole('alert')).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Configuración pública inválida' }),
    ).toBeDefined();
    expect(screen.getByText('VITE_APP_ENV')).toBeDefined();
    expect(screen.getByText('VITE_API_BASE_URL')).toBeDefined();
  });

  it('caso 2: sin apiOrigin no monta Clerk ni hace red (config_error)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <App
        envResult={{
          ok: true,
          env: { appEnv: 'local', apiOrigin: null, clerkPublishableKey: clerkKey('test') },
        }}
      />,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('VITE_CLERK_PUBLISHABLE_KEY')).toBeDefined();
    expect(screen.getByText('VITE_API_BASE_URL')).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('caso 3: sin clave publicable tampoco monta Clerk ni hace red (config_error)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(
      <App
        envResult={{
          ok: true,
          env: {
            appEnv: 'production',
            apiOrigin: 'https://api.example.test',
            clerkPublishableKey: null,
          },
        }}
      />,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('VITE_CLERK_PUBLISHABLE_KEY')).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('Strict Mode and unmount dispose data-router history and exit listeners', () => {
    const add = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener');
    const h = render(<StrictMode><App envResult={{ ok: false, issues: [] }}/></StrictMode>);
    h.unmount();
    for (const event of ['popstate', 'beforeunload']) {
      const registrations = add.mock.calls.filter(call => call[0] === event);
      expect(registrations.length).toBeGreaterThan(0);
      for (const [, listener] of registrations) expect(remove.mock.calls.some(call => call[0] === event && call[1] === listener)).toBe(true);
    }
  });

  it('installed useBlocker rejects a declarative BrowserRouter at runtime', () => {
    function Probe() { useBlocker(false); return null; }
    expect(() => render(<BrowserRouter><Probe/></BrowserRouter>)).toThrow('useBlocker must be used within a data router');
  });

});
