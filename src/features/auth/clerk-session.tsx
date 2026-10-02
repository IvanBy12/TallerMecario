import { ClerkProvider, SignIn, useAuth } from '@clerk/react';
import { ClerkOfflineError } from '@clerk/react/errors';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { TokenResult } from '@/shared/api/http-client';

import type { AuthSessionPort, SessionSnapshot } from './session-port';
import type { IdentityKey } from './workshop-context';

/**
 * ÚNICO archivo que importa `@clerk/*` (D-A04, AC-A04). Traduce el proveedor de identidad
 * al puerto `AuthSessionPort`; el resto de la aplicación nunca ve Clerk.
 */

export interface TokenRequestOptions {
  readonly skipCache?: boolean;
}

type ClerkGetToken = (options?: TokenRequestOptions) => Promise<string | null>;

interface ClerkSessionFields {
  readonly isLoaded: boolean;
  readonly isSignedIn: boolean | undefined;
  readonly userId: string | null | undefined;
  readonly sessionId: string | null | undefined;
}

/** `userId:sessionId` se usa solo en memoria como clave de identidad. */
export function toSessionSnapshot(fields: ClerkSessionFields): SessionSnapshot {
  if (!fields.isLoaded) {
    return { status: 'loading' };
  }
  const { userId, sessionId } = fields;
  if (fields.isSignedIn !== true || typeof userId !== 'string' || typeof sessionId !== 'string') {
    return { status: 'signed_out' };
  }
  const identity: IdentityKey = `${userId}:${sessionId}`;
  return { status: 'signed_in', identity };
}

/**
 * Traduce la obtención del token a un resultado discriminado.
 * Solo `ClerkOfflineError` (navegador sin red) se considera «sin conexión»; cualquier otra
 * excepción es causa desconocida y NO se afirma que sea un fallo de red.
 */
export async function toTokenResult(
  getToken: ClerkGetToken,
  options?: TokenRequestOptions,
): Promise<TokenResult> {
  try {
    const token = await getToken(options);
    return token === null ? { kind: 'no_session' } : { kind: 'token', token };
  } catch (error) {
    return ClerkOfflineError.is(error) ? { kind: 'offline' } : { kind: 'error' };
  }
}

const AuthSessionContext = createContext<AuthSessionPort | null>(null);

export function useAuthSessionPort(): AuthSessionPort {
  const port = useContext(AuthSessionContext);
  if (port === null) {
    throw new Error('useAuthSessionPort requiere <ClerkAuthSessionProvider>');
  }
  return port;
}

export interface ClerkAuthSessionProviderProps {
  readonly publishableKey: string;
  readonly children: ReactNode;
}

export function ClerkAuthSessionProvider({ publishableKey, children }: ClerkAuthSessionProviderProps) {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <PortBridge>{children}</PortBridge>
    </ClerkProvider>
  );
}

/** Único punto que lee `useAuth()` y construye el puerto. */
function PortBridge({ children }: { readonly children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, sessionId, getToken, signOut } = useAuth();
  const port = useMemo<AuthSessionPort>(
    () => ({
      snapshot: toSessionSnapshot({ isLoaded, isSignedIn, userId, sessionId }),
      getToken: (options) => toTokenResult(getToken, options),
      signOut: () => signOut(),
    }),
    [isLoaded, isSignedIn, userId, sessionId, getToken, signOut],
  );
  return <AuthSessionContext.Provider value={port}>{children}</AuthSessionContext.Provider>;
}

/** Inicio de sesión embebido. Usa el routing por hash por defecto del SDK (sin router de app). */
export function ClerkSignInPanel() {
  return <SignIn fallbackRedirectUrl="/panel" appearance={{
    variables: {
      colorPrimary: '#0D4FB8',
      colorForeground: '#202938',
      colorBackground: '#FFFFFF',
      borderRadius: '0.5rem',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    },
    elements: {
      rootBox: 'public-clerk-root',
      cardBox: 'public-clerk-card-box',
      card: 'public-clerk-card',
    },
  }} />;
}
