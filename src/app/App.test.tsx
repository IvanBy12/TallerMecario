import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@/app/App';

describe('App', () => {
  it('caso 1: muestra el estado base con un entorno válido sin API', () => {
    render(<App envResult={{ ok: true, env: { appEnv: 'local', apiOrigin: null } }} />);

    expect(screen.getByRole('main')).toBeDefined();
    expect(screen.getByRole('heading', { level: 1, name: 'TallerMecario' })).toBeDefined();
    expect(screen.getByText('Entorno')).toBeDefined();
    expect(screen.getByText('local')).toBeDefined();
    expect(screen.getByText('API del backend')).toBeDefined();
    expect(screen.getByText('No configurada')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('caso 2: indica que la API está configurada sin mostrar su valor', () => {
    render(
      <App
        envResult={{
          ok: true,
          env: { appEnv: 'production', apiOrigin: 'https://api.example.test' },
        }}
      />,
    );

    expect(screen.getByText('Configurada')).toBeDefined();
    expect(screen.queryByText(/api\.example\.test/)).toBeNull();
  });

  it('caso 3: muestra los issues de configuración sin el bloque de estado', () => {
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

    expect(screen.getByRole('alert')).toBeDefined();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Configuración pública inválida' }),
    ).toBeDefined();
    expect(screen.getByText('VITE_APP_ENV')).toBeDefined();
    expect(screen.getByText('VITE_API_BASE_URL')).toBeDefined();
    expect(screen.queryByText('Entorno')).toBeNull();
  });
});
