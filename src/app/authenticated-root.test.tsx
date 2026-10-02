import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  loadingSnapshot,
  renderWithAuth,
  signedInSnapshot,
  signedOutSnapshot,
} from '@/test/render-with-auth';

import { AuthenticatedRoot } from './authenticated-root';

// Clerk no se monta en estas pruebas: su panel de inicio de sesión se sustituye por un marcador.
vi.mock('@/features/auth/clerk-session', () => ({
  ClerkAuthSessionProvider: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
  ClerkSignInPanel: () => <p>Panel de inicio de sesión de Clerk</p>,
  useAuthSessionPort: () => {
    throw new Error('el puerto de Clerk no se usa en estas pruebas');
  },
}));

describe('AuthenticatedRoot', () => {
  it('con sesión iniciada y contexto de taller pendiente monta el shell con su aviso', async () => {
    renderWithAuth(<MemoryRouter initialEntries={['/panel']}><AuthenticatedRoot /></MemoryRouter>, { snapshot: signedInSnapshot() });

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Clientes' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeDefined();
    expect(screen.getByText('Contexto de taller pendiente')).toBeDefined();
  });

  it('sin sesión deja la pantalla en manos del AuthGate y no monta navegación', async () => {
    renderWithAuth(<MemoryRouter initialEntries={['/panel']}><AuthenticatedRoot /></MemoryRouter>, { snapshot: signedOutSnapshot() });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Inicia sesión' }),
    ).toBeDefined();
    expect(screen.getByText('Panel de inicio de sesión de Clerk')).toBeDefined();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('mientras carga la identidad no monta el shell', async () => {
    renderWithAuth(<MemoryRouter initialEntries={['/panel']}><AuthenticatedRoot /></MemoryRouter>, { snapshot: loadingSnapshot() });

    expect(await screen.findByText('Cargando sesión…')).toBeDefined();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByText('Contexto de taller pendiente')).toBeNull();
  });
});
