import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useMemo, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiFailure } from '@/shared/api/api-failure';
import { createApiClient, type ApiResult } from '@/shared/api/http-client';

import { AuthContextProvider, AuthGateConnected, useAuthContext } from './auth-provider';
import type { ResourceScope, WorkshopContext } from './me-contract';
import type { AuthSessionPort, SessionSnapshot } from './session-port';
import type {
  ContextLoadAttempt,
  WorkshopContextSnapshot,
  WorkshopContextSource,
} from './workshop-context';

vi.mock('./clerk-session', () => ({
  ClerkAuthSessionProvider: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
  ClerkSignInPanel: () => <div data-testid="clerk-signin" />,
  useAuthSessionPort: () => {
    throw new Error('no se usa en pruebas');
  },
}));

const API_ORIGIN = 'https://api.example.test';

const defaultGetToken: AuthSessionPort['getToken'] = () =>
  Promise.resolve({ kind: 'token', token: 'token-no-visible' });
const defaultSignOut: AuthSessionPort['signOut'] = () => Promise.resolve();

function unauthorized(): ApiFailure {
  return { kind: 'unauthenticated', status: 401, code: 'AUTHENTICATION_REQUIRED', requestId: 'req-401' };
}

const CONTEXT_FAILURES: readonly (readonly [ApiFailure, string])[] = [
  [{ kind: 'no_session', status: null, code: null, requestId: null }, 'session_expired'],
  [{ kind: 'token_error', status: null, code: null, requestId: null }, 'recoverable_error'],
  [{ kind: 'network', status: null, code: null, requestId: null }, 'recoverable_error'],
];

function Probe() {
  const { state } = useAuthContext();
  return (
    <>
      <span data-testid="kind">{state.kind}</span>
      <span data-testid="tenant">{state.kind === 'ready' ? state.tenantId : ''}</span>
      <span data-testid="permissions">
        {state.kind === 'ready' && state.context !== undefined
          ? state.context.permissions.map((permission) => permission.code).join(',')
          : ''}
      </span>
      <AuthGateConnected />
    </>
  );
}

interface HarnessProps {
  readonly snapshot: SessionSnapshot;
  readonly source?: WorkshopContextSource;
  readonly getToken?: AuthSessionPort['getToken'];
  readonly signOut?: AuthSessionPort['signOut'];
}

function Harness({ snapshot, source, getToken, signOut }: HarnessProps) {
  const port = useMemo<AuthSessionPort>(
    () => ({
      snapshot,
      getToken: getToken ?? defaultGetToken,
      signOut: signOut ?? defaultSignOut,
    }),
    [getToken, signOut, snapshot],
  );
  const apiClient = useMemo(
    () =>
      createApiClient({
        apiOrigin: API_ORIGIN,
        getToken: (options) => port.getToken(options),
        fetchImpl: () => Promise.reject(new Error('no debe llamarse sin G5')),
      }),
    [port],
  );
  return (
    <AuthContextProvider port={port} apiClient={apiClient} contextSource={source}>
      <Probe />
    </AuthContextProvider>
  );
}

function kind(): string {
  return screen.getByTestId('kind').textContent;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sin contextSource (G4 / AC-A06b)', () => {
  it('loading_identity no escribe ni pide tokens', () => {
    const getToken = vi.fn(defaultGetToken);
    render(<Harness snapshot={{ status: 'loading' }} getToken={getToken} />);

    expect(kind()).toBe('loading_identity');
    expect(getToken).not.toHaveBeenCalled();
  });

  it('una sesión iniciada queda en signed_in_context_pending sin llamar al backend', async () => {
    const getToken = vi.fn(defaultGetToken);
    render(
      <Harness snapshot={{ status: 'signed_in', identity: 'user-1:session-1' }} getToken={getToken} />,
    );

    await waitFor(() => {
      expect(kind()).toBe('signed_in_context_pending');
    });
    expect(getToken).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('user-1');
    expect(screen.getByRole('status').textContent).toContain('El acceso a talleres aún no está integrado');
  });

  it('desde signed_out, iniciar sesión también termina en signed_in_context_pending', async () => {
    const { rerender } = render(<Harness snapshot={{ status: 'signed_out' }} />);

    await waitFor(() => {
      expect(kind()).toBe('signed_out');
    });
    expect(screen.getByTestId('clerk-signin')).toBeDefined();

    rerender(<Harness snapshot={{ status: 'signed_in', identity: 'user-2:session-2' }} />);

    await waitFor(() => {
      expect(kind()).toBe('signed_in_context_pending');
    });
    expect(document.body.textContent).not.toContain('user-2');
  });

  it('el cambio de identidad no retiene nada del usuario anterior', async () => {
    const { rerender } = render(
      <Harness snapshot={{ status: 'signed_in', identity: 'user-A:session-A' }} />,
    );

    await waitFor(() => {
      expect(kind()).toBe('signed_in_context_pending');
    });

    rerender(<Harness snapshot={{ status: 'signed_in', identity: 'user-B:session-B' }} />);

    await waitFor(() => {
      expect(kind()).toBe('signed_in_context_pending');
    });
    expect(document.body.textContent).not.toContain('user-A');
    expect(document.body.textContent).not.toContain('user-B');
  });

  it('la sesión que desaparece sin pedirlo el usuario produce session_expired', async () => {
    const { rerender } = render(
      <Harness snapshot={{ status: 'signed_in', identity: 'user-A:session-A' }} />,
    );

    await waitFor(() => {
      expect(kind()).toBe('signed_in_context_pending');
    });

    rerender(<Harness snapshot={{ status: 'signed_out' }} />);

    await waitFor(() => {
      expect(kind()).toBe('session_expired');
    });
    expect(document.body.textContent).not.toContain('user-A');
  });
});

/** `signOut` diferido: la prueba decide cuándo rechaza, con la promesa todavía pendiente. */
function deferSignOut(): {
  readonly signOut: AuthSessionPort['signOut'];
  readonly reject: () => void;
} {
  let rejectPending: (reason: unknown) => void = () => undefined;
  const signOut: AuthSessionPort['signOut'] = () =>
    new Promise<void>((_resolve, reject) => {
      rejectPending = reject;
    });
  return {
    signOut,
    reject: () => {
      rejectPending(new Error('signOut rechazó'));
    },
  };
}

describe('cierre de sesión (T6/T6b)', () => {
  it('no restaura una identidad ya cerrada si Clerk pasa a signed_out antes del rechazo', async () => {
    const { signOut, reject } = deferSignOut();
    const spySignOut = vi.fn(signOut);
    const { rerender } = render(
      <Harness snapshot={{ status: 'signed_in', identity: 'user-1:session-1' }} signOut={spySignOut} />,
    );

    // 1. Sesión firmada.
    await waitFor(() => {
      expect(kind()).toBe('signed_in_context_pending');
    });

    // 2. Comienza signOut(): T6 descarta el contexto local y queda `signed_out`.
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(spySignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(kind()).toBe('signed_out');
    });

    // 3. Clerk emite `signed_out` mientras la promesa sigue pendiente.
    rerender(<Harness snapshot={{ status: 'signed_out' }} signOut={spySignOut} />);
    await waitFor(() => {
      expect(kind()).toBe('signed_out');
    });

    // 4. signOut() rechaza después de que Clerk ya cerró la sesión.
    await act(async () => {
      reject();
      // Deja correr la microtarea del `.catch()` del proveedor antes de observar el estado.
      await Promise.resolve();
    });

    // 5. La sesión vigente de Clerk prevalece: nunca se restaura la identidad anterior.
    expect(kind()).toBe('signed_out');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
    expect(document.body.textContent).not.toContain('user-1');
  });

  it('mantiene T6b cuando Clerk sigue confirmando la misma sesión', async () => {
    const { signOut, reject } = deferSignOut();
    const spySignOut = vi.fn(signOut);

    render(
      <Harness snapshot={{ status: 'signed_in', identity: 'user-1:session-1' }} signOut={spySignOut} />,
    );

    await waitFor(() => {
      expect(kind()).toBe('signed_in_context_pending');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => {
      expect(kind()).toBe('signed_out');
    });

    await act(async () => {
      reject();
      // Deja correr la microtarea del `.catch()` del proveedor antes de observar el estado.
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(kind()).toBe('recoverable_error');
    });
  });
});

describe('con contextSource falso (G1/G3)', () => {
  it('carga el contexto con tokenPolicy cached y llega a ready', async () => {
    const attempts: ContextLoadAttempt[] = [];
    const source: WorkshopContextSource = {
      load: (attempt) => {
        attempts.push(attempt);
        return Promise.resolve({
          ok: true,
          data: { kind: 'single', membership: { tenantId: 'T-A', membershipId: 'M-A' } },
        });
      },
    };

    render(<Harness snapshot={{ status: 'signed_in', identity: 'id-A' }} source={source} />);

    await waitFor(() => {
      expect(kind()).toBe('ready');
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.tokenPolicy).toBe('cached');
    expect(screen.getByTestId('tenant').textContent).toBe('T-A');
  });

  it('tras un 401 reintenta una sola vez con token fresco y el mismo scope', async () => {
    const attempts: ContextLoadAttempt[] = [];
    const signOut = vi.fn(defaultSignOut);
    const source: WorkshopContextSource = {
      load: (attempt) => {
        attempts.push(attempt);
        return Promise.resolve({ ok: false, failure: unauthorized() });
      },
    };

    render(
      <Harness
        snapshot={{ status: 'signed_in', identity: 'id-A' }}
        source={source}
        signOut={signOut}
      />,
    );

    await waitFor(() => {
      expect(kind()).toBe('auth_rejected');
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[1]?.tokenPolicy).toBe('fresh');
    expect(attempts[1]?.scope).toBe(attempts[0]?.scope);
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('El servidor no aceptó tu sesión');
    expect(document.body.textContent).toContain('req-401');
  });

  it.each(CONTEXT_FAILURES)(
    'traduce %j a %s sin cerrar sesión',
    async (apiFailure, expectedKind) => {
    const signOut = vi.fn(defaultSignOut);
    const source: WorkshopContextSource = {
      load: () => Promise.resolve({ ok: false, failure: apiFailure }),
    };

    render(
      <Harness
        snapshot={{ status: 'signed_in', identity: 'id-A' }}
        source={source}
        signOut={signOut}
      />,
    );

    await waitFor(() => {
      expect(kind()).toBe(expectedKind);
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('una respuesta tardía de la generación anterior no altera el estado', async () => {
    const attempts: ContextLoadAttempt[] = [];
    const pendingResolvers: ((value: ApiResult<WorkshopContextSnapshot>) => void)[] = [];
    const source: WorkshopContextSource = {
      load: (attempt) => {
        attempts.push(attempt);
        if (attempts.length === 1) {
          return Promise.resolve({ ok: false, failure: unauthorized() });
        }
        if (attempts.length === 2) {
          return new Promise((resolve) => {
            pendingResolvers.push(resolve);
          });
        }
        return Promise.resolve({
          ok: true,
          data: { kind: 'single', membership: { tenantId: 'T-B', membershipId: 'M-B' } },
        });
      },
    };

    const { rerender } = render(
      <Harness snapshot={{ status: 'signed_in', identity: 'id-A' }} source={source} />,
    );

    await waitFor(() => {
      expect(attempts).toHaveLength(2);
    });

    rerender(<Harness snapshot={{ status: 'signed_in', identity: 'id-B' }} source={source} />);

    await waitFor(() => {
      expect(attempts).toHaveLength(3);
    });

    const [resolveLate] = pendingResolvers;
    resolveLate?.({
      ok: true,
      data: { kind: 'single', membership: { tenantId: 'T-A', membershipId: 'M-A' } },
    });

    await waitFor(() => {
      expect(kind()).toBe('ready');
    });
    expect(screen.getByTestId('tenant').textContent).toBe('T-B');
    expect(document.body.textContent).not.toContain('T-A');
  });

  it('StrictMode no deja más de una operación viva', async () => {
    const attempts: ContextLoadAttempt[] = [];
    const source: WorkshopContextSource = {
      load: (attempt) => {
        attempts.push(attempt);
        return new Promise(() => undefined);
      },
    };

    render(
      <StrictMode>
        <Harness snapshot={{ status: 'signed_in', identity: 'id-A' }} source={source} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(attempts.length).toBeGreaterThan(0);
    });
    expect(attempts.filter((attempt) => !attempt.scope.signal.aborted)).toHaveLength(1);
  });
});

describe('revalidación concurrente en la misma generación (P2)', () => {
  const TENANT_SCOPE: readonly ResourceScope[] = ['tenant'];

  function workshopContext(permissionCodes: readonly string[]): WorkshopContext {
    return {
      tenantId: 'T-A',
      membershipId: 'M-A',
      userId: 'U-A',
      workshop: { displayName: 'Taller A', timezone: 'America/Bogota', currency: 'COP' },
      roles: ['service_advisor'],
      permissions: permissionCodes.map((code) => ({ code, scopes: TENANT_SCOPE })),
    };
  }

  function single(permissionCodes: readonly string[]): ApiResult<WorkshopContextSnapshot> {
    return {
      ok: true,
      data: {
        kind: 'single',
        membership: { tenantId: 'T-A', membershipId: 'M-A' },
        context: workshopContext(permissionCodes),
      },
    };
  }

  it('un intento anterior que responde tarde no sobrescribe el contexto vigente', async () => {
    const attempts: ContextLoadAttempt[] = [];
    const pending: ((value: ApiResult<WorkshopContextSnapshot>) => void)[] = [];
    const source: WorkshopContextSource = {
      load: (attempt) => {
        attempts.push(attempt);
        if (attempts.length === 1) {
          // La carga inicial declara acceso perdido: la app queda con aviso y recarga sola.
          return Promise.resolve({
            ok: false,
            failure: { kind: 'tenant_access_denied', status: 403, code: null, requestId: null },
          });
        }
        return new Promise((resolve) => {
          pending.push(resolve);
        });
      },
    };

    render(<Harness snapshot={{ status: 'signed_in', identity: 'id-A' }} source={source} />);

    await waitFor(() => {
      expect(attempts).toHaveLength(2);
    });

    // El usuario descarta el aviso mientras la recarga sigue en vuelo. El recorte del aviso no
    // cambia la generación, así que los dos intentos vivos comparten generación: exactamente el
    // caso que la guarda por attempt debe resolver.
    fireEvent.click(screen.getByRole('button', { name: 'Descartar aviso' }));

    await waitFor(() => {
      expect(attempts).toHaveLength(3);
    });

    const [staleAttempt, currentAttempt] = pending;
    expect(attempts[2]?.scope.generation).toBe(attempts[1]?.scope.generation);
    expect(attempts[1]?.scope.signal.aborted).toBe(false);
    expect(attempts[2]?.scope.signal.aborted).toBe(false);

    // El intento vigente responde primero, con los permisos actualizados.
    currentAttempt?.(single(['receptions.read', 'receptions.create']));
    await waitFor(() => {
      expect(kind()).toBe('ready');
    });
    expect(screen.getByTestId('permissions').textContent).toBe('receptions.read,receptions.create');

    // El intento anterior responde después con los permisos antiguos: no puede hacer commit.
    staleAttempt?.(single(['receptions.read']));
    await act(async () => {
      await Promise.resolve();
    });

    expect(kind()).toBe('ready');
    expect(screen.getByTestId('permissions').textContent).toBe('receptions.read,receptions.create');
  });
});

describe('aislamiento local (AC-A13)', () => {
  it('no escribe token, identidad ni taller en almacenamiento', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const source: WorkshopContextSource = {
      load: () =>
        Promise.resolve({
          ok: true,
          data: { kind: 'single', membership: { tenantId: 'T-A', membershipId: 'M-A' } },
        }),
    };

    render(<Harness snapshot={{ status: 'signed_in', identity: 'id-A' }} source={source} />);

    await waitFor(() => {
      expect(kind()).toBe('ready');
    });
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.body.textContent).not.toContain('token-no-visible');
  });
});
