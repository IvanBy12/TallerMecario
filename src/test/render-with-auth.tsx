import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

import { AuthContextProvider } from '@/features/auth/auth-provider';
import type { AuthSessionPort, SessionSnapshot } from '@/features/auth/session-port';
import { createApiClient } from '@/shared/api/http-client';

/**
 * Arnés de las pruebas de composición: monta `AuthContextProvider` con un puerto de sesión
 * sintético. No hay Clerk, no hay red y no existe ningún taller ni usuario real.
 *
 * Sin `contextSource` (G5 todavía pendiente) una sesión iniciada queda en
 * `signed_in_context_pending`, que es exactamente el estado en el que está la aplicación hoy.
 */

const API_ORIGIN = 'https://api.example.test';

export function loadingSnapshot(): SessionSnapshot {
  return { status: 'loading' };
}

export function signedOutSnapshot(): SessionSnapshot {
  return { status: 'signed_out' };
}

export function signedInSnapshot(identity = 'user-1:session-1'): SessionSnapshot {
  return { status: 'signed_in', identity };
}

export function createFakeSessionPort(snapshot: SessionSnapshot): AuthSessionPort {
  return {
    snapshot,
    getToken: () => Promise.resolve({ kind: 'no_session' }),
    signOut: () => Promise.resolve(),
  };
}

export interface RenderWithAuthOptions {
  readonly snapshot: SessionSnapshot;
}

export function renderWithAuth(ui: ReactNode, options: RenderWithAuthOptions) {
  const port = createFakeSessionPort(options.snapshot);
  const apiClient = createApiClient({
    apiOrigin: API_ORIGIN,
    getToken: (getTokenOptions) => port.getToken(getTokenOptions),
    fetchImpl: () => Promise.reject(new Error('la aplicación no hace peticiones en estas pruebas')),
  });

  return render(
    <AuthContextProvider port={port} apiClient={apiClient}>
      {ui}
    </AuthContextProvider>,
  );
}
