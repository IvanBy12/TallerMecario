import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import { classifyFailure } from '@/shared/api/api-failure';
import { createApiClient, type ApiClient } from '@/shared/api/http-client';
import type { PublicEnv } from '@/shared/config/public-env';

import { AuthGate, ConfigIssuesPanel, type AuthGateActions } from './auth-gate';
import { ClerkAuthSessionProvider, useAuthSessionPort } from './clerk-session';
import type { AuthSessionPort, SessionSnapshot } from './session-port';
import {
  createAuthReducer,
  identityOf,
  retryAllowed,
  withSingleFreshRetry,
  type AuthState,
  type AuthStore,
  type ContextScope,
  type SessionChange,
  type WorkshopContextSource,
} from './workshop-context';

const INITIAL_STORE: AuthStore = { generation: 0, auth: { kind: 'loading_identity' } };

export interface AuthContextValue {
  readonly state: AuthState;
  readonly actions: AuthGateActions;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuthContext requiere <AuthContextProvider>');
  }
  return value;
}

function toSessionChange(snapshot: SessionSnapshot): SessionChange {
  switch (snapshot.status) {
    case 'loading':
      return { status: 'loading' };
    case 'signed_out':
      return { status: 'signed_out' };
    case 'signed_in':
      return { status: 'signed_in', identity: snapshot.identity };
  }
}

function buildScope(
  current: { readonly generation: number; readonly controller: AbortController } | null,
  auth: AuthState,
): ContextScope | null {
  if (current === null) {
    return null;
  }
  return {
    generation: current.generation,
    identity: identityOf(auth),
    tenantId: auth.kind === 'ready' ? auth.tenantId : null,
    signal: current.controller.signal,
  };
}

export interface AuthContextProviderProps {
  readonly port: AuthSessionPort;
  /** Reservado para G5; hoy no se consume porque no hay operaciones de contexto cableadas. */
  readonly apiClient: ApiClient;
  /** Sin `contextSource` (G5 pendiente) el reducer se crea con `hasContextSource: false`. */
  readonly contextSource?: WorkshopContextSource;
  readonly children: ReactNode;
}

export function AuthContextProvider(props: AuthContextProviderProps) {
  const { port, contextSource, children } = props;
  const hasContextSource = contextSource !== undefined;
  const reducer = useMemo(() => createAuthReducer({ hasContextSource }), [hasContextSource]);
  const [store, dispatch] = useReducer(reducer, INITIAL_STORE);
  const scopeRef = useRef<{ generation: number; controller: AbortController } | null>(null);
  // Snapshot vigente de Clerk: la fuente actual prevalece sobre el estado capturado al cerrar sesión.
  const portRef = useRef(port);

  // Un AbortController por generación: el corte aborta todo lo que seguía en vuelo.
  useEffect(() => {
    const current = scopeRef.current;
    if (current === null || current.generation !== store.generation) {
      if (current !== null) {
        current.controller.abort();
      }
      scopeRef.current = { generation: store.generation, controller: new AbortController() };
    }
  }, [store.generation]);

  useEffect(() => {
    return () => {
      const current = scopeRef.current;
      if (current !== null) {
        current.controller.abort();
        scopeRef.current = null;
      }
    };
  }, []);

  // La sesión de Clerk es la fuente; la app solo reacciona al snapshot del puerto.
  useLayoutEffect(() => {
    portRef.current = port;
  }, [port]);

  useEffect(() => {
    dispatch({ type: 'session_changed', session: toSessionChange(port.snapshot) });
  }, [port]);

  const loadContext = useCallback(
    async (scope: ContextScope | null): Promise<void> => {
      if (scope === null || contextSource === undefined) {
        return;
      }
      const result = await withSingleFreshRetry(scope, (attempt) => contextSource.load(attempt));
      if (result.ok) {
        dispatch({ type: 'context_loaded', generation: scope.generation, snapshot: result.data });
        return;
      }
      dispatch({
        type: 'context_failed',
        generation: scope.generation,
        failure: result.failure,
        at: Date.now(),
      });
    },
    [contextSource],
  );

  const auth = store.auth;
  useEffect(() => {
    if (contextSource === undefined || auth.kind !== 'loading_context') {
      return;
    }
    // No se inicia ninguna operación hasta que exista el controlador de la generación vigente.
    void loadContext(buildScope(scopeRef.current, auth));
  }, [auth, contextSource, loadContext]);

  const actions = useMemo<AuthGateActions>(
    () => ({
      onSignOut: () => {
        const identity = identityOf(store.auth);
        if (identity === null) {
          return;
        }
        // T6: primero se descarta el contexto local y después se llama a Clerk.
        dispatch({ type: 'sign_out_requested' });
        void port.signOut().catch(() => {
          // T6b solo si Clerk sigue confirmando ESA sesión. Si entretanto pasó a `signed_out`
          // (u otra sesión), la fuente vigente prevalece y no se restaura una identidad cerrada.
          const live = portRef.current.snapshot;
          if (live.status !== 'signed_in' || live.identity !== identity) {
            return;
          }
          dispatch({
            type: 'sign_out_failed',
            generation: store.generation + 1,
            identity,
            failure: classifyFailure({ source: 'token', reason: 'error' }),
            at: Date.now(),
          });
        });
      },
      onSignInAgain: () => {
        dispatch({ type: 'session_changed', session: { status: 'signed_out' } });
      },
      onRetry: () => {
        const at = Date.now();
        if (!retryAllowed(store.auth, at)) {
          return;
        }
        if (store.auth.kind === 'ready') {
          // T18: revalidación bajo el scope vigente, sin cambio de generación.
          const current = scopeRef.current;
          if (current !== null && current.generation === store.generation) {
            void loadContext(buildScope(current, store.auth));
          }
          return;
        }
        dispatch({ type: 'retry_requested', at });
      },
      onReload: () => {
        window.location.reload();
      },
      onDismissNotice: () => {
        dispatch({ type: 'notice_dismissed' });
      },
    }),
    [loadContext, port, store],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ state: store.auth, actions }),
    [actions, store.auth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthGateConnected() {
  const { state, actions } = useAuthContext();
  return <AuthGate state={state} actions={actions} />;
}

export interface AuthProviderProps {
  readonly env: PublicEnv;
}

/**
 * Composición real: Clerk + contexto. Si falta configuración pública esencial no se monta
 * Clerk y no se hace ninguna petición (AC-A03).
 */
export function AuthProvider({ env }: AuthProviderProps) {
  if (env.clerkPublishableKey === null || env.apiOrigin === null) {
    return <ConfigIssuesPanel issues="missing_auth_config" />;
  }
  return (
    <ClerkAuthSessionProvider publishableKey={env.clerkPublishableKey}>
      <ClerkAuthContext apiOrigin={env.apiOrigin} />
    </ClerkAuthSessionProvider>
  );
}

function ClerkAuthContext({ apiOrigin }: { readonly apiOrigin: string }) {
  const port = useAuthSessionPort();
  const apiClient = useMemo(
    () => createApiClient({ apiOrigin, getToken: (options) => port.getToken(options) }),
    [apiOrigin, port],
  );
  return (
    <AuthContextProvider port={port} apiClient={apiClient}>
      <AuthGateConnected />
    </AuthContextProvider>
  );
}
