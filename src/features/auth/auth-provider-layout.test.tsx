import { act, fireEvent, render, screen } from '@testing-library/react';
import { useLayoutEffect, type EffectCallback, type ReactNode } from 'react';
import type * as ReactModule from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { createApiClient } from '@/shared/api/http-client';

import { AuthContextProvider, useAuthContext } from './auth-provider';
import type { AuthSessionPort } from './session-port';
import { identityOf, type AuthState } from './workshop-context';

const passiveEffects = vi.hoisted(() => ({
  held: false,
  pending: [] as (() => void)[],
}));

// Retiene solo la ejecución pasiva; React sigue renderizando y ejecutando layout.
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof ReactModule>();
  return {
    ...react,
    useEffect: (effect: EffectCallback, deps: readonly unknown[] | undefined) => {
      react.useEffect(() => {
        if (!passiveEffects.held) {
          return effect();
        }
        let cleanup: ReturnType<EffectCallback>;
        passiveEffects.pending.push(() => {
          cleanup = effect();
        });
        return () => cleanup?.();
      }, deps);
    },
  };
});

vi.mock('./clerk-session', () => ({
  ClerkAuthSessionProvider: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
  ClerkSignInPanel: () => null,
  useAuthSessionPort: () => {
    throw new Error('no se usa en esta prueba');
  },
}));

afterEach(() => {
  passiveEffects.held = false;
  passiveEffects.pending.length = 0;
});

it('conserva signed_out si signOut rechaza tras layout del nuevo port y antes del efecto pasivo', async () => {
  const states: AuthState[] = [];
  let rejectSignOut: () => void = () => {
    throw new Error('signOut aún no se inició');
  };
  const signOut = vi.fn(() => new Promise<void>((_resolve, reject) => {
    rejectSignOut = () => {
      reject(new Error('signOut rechazó'));
    };
  }));
  const signedInPort: AuthSessionPort = {
    snapshot: { status: 'signed_in', identity: 'user-1:session-1' },
    getToken: () => Promise.resolve({ kind: 'no_session' }),
    signOut,
  };
  const signedOutPort: AuthSessionPort = {
    ...signedInPort,
    snapshot: { status: 'signed_out' },
  };
  const apiClient = createApiClient({
    apiOrigin: 'https://api.example.test',
    getToken: (options) => signedInPort.getToken(options),
    fetchImpl: () => Promise.reject(new Error('no debe llamarse')),
  });

  function Probe() {
    const { state, actions } = useAuthContext();
    useLayoutEffect(() => {
      states.push(state);
    }, [state]);
    return <button onClick={actions.onSignOut}>Cerrar sesión</button>;
  }

  function view(port: AuthSessionPort) {
    return (
      <AuthContextProvider port={port} apiClient={apiClient}>
        <Probe />
      </AuthContextProvider>
    );
  }

  const { rerender } = render(view(signedInPort));
  expect(states.at(-1)?.kind).toBe('signed_in_context_pending');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(states.at(-1)?.kind).toBe('signed_out');
  states.splice(0, states.length - 1);

  passiveEffects.held = true;
  rerender(view(signedOutPort));
  expect(passiveEffects.pending).toHaveLength(1);

  // El catch corre con el nuevo port ya comprometido, pero session_changed aún retenido.
  await act(async () => {
    rejectSignOut();
    await Promise.resolve();
  });
  expect(states.map((state) => state.kind)).toEqual(['signed_out']);
  expect(passiveEffects.pending).toHaveLength(1);

  passiveEffects.held = false;
  act(() => {
    for (const run of passiveEffects.pending.splice(0)) {
      run();
    }
  });
  expect(states.at(-1)?.kind).toBe('signed_out');
  expect(states.every((state) => state.kind === 'signed_out')).toBe(true);
  expect(states.every((state) => identityOf(state) === null)).toBe(true);
});
