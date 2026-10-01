import { describe, expect, it, vi } from 'vitest';

import { toSessionSnapshot, toTokenResult } from './clerk-session';

/**
 * Pruebas del adaptador REAL de `clerk-session.tsx` (§8.2.A, AC-A30). El resto de las pruebas de
 * la aplicación sustituyen `./clerk-session` con `vi.mock`, de modo que aquí se ejecutan de verdad
 * `toTokenResult` y `toSessionSnapshot`.
 *
 * `@clerk/*` solo puede importarse desde `clerk-session.tsx` (D-A04, AC-A04). Por eso el SDK se
 * sustituye con `vi.mock` mediante especificadores literales (que no son sentencias de importación)
 * y el doble reproduce el único miembro que el adaptador consume: `ClerkOfflineError.is`.
 */

const VALID_TOKEN = 'token-de-prueba-sintetico-sin-valor-real';

const { offlineError } = vi.hoisted(() => ({ offlineError: new Error('clerk_offline') }));

vi.mock('@clerk/react', () => ({
  ClerkProvider: () => null,
  SignIn: () => null,
  useAuth: () => ({}),
}));

vi.mock('@clerk/react/errors', () => ({
  ClerkOfflineError: { is: (error: unknown) => error === offlineError },
}));

/** Doble del `getToken` de Clerk: promesa ya resuelta con el resultado indicado. */
const resolvedToken = (token: string | null) => (): Promise<string | null> =>
  Promise.resolve(token);

describe('toTokenResult (adaptador real de Clerk)', () => {
  it('traduce un token válido', async () => {
    const result = await toTokenResult(resolvedToken(VALID_TOKEN));

    expect(result).toEqual({ kind: 'token', token: VALID_TOKEN });
  });

  it('traduce null a no_session (Clerk sin sesión)', async () => {
    const result = await toTokenResult(resolvedToken(null));

    expect(result).toEqual({ kind: 'no_session' });
  });

  it('traduce ClerkOfflineError a offline consultando ClerkOfflineError.is', async () => {
    const result = await toTokenResult(() => Promise.reject(offlineError));

    expect(result).toEqual({ kind: 'offline' });
  });

  it('traduce un Promise rechazado con Error a error, nunca a offline', async () => {
    const result = await toTokenResult(() => Promise.reject(new Error('fallo del SDK')));

    expect(result).toEqual({ kind: 'error' });
  });

  it('traduce un TypeError a error', async () => {
    const result = await toTokenResult(() => Promise.reject(new TypeError('tipo inesperado')));

    expect(result).toEqual({ kind: 'error' });
  });

  it('traduce un lanzamiento síncrono a error', async () => {
    const result = await toTokenResult(() => {
      throw new Error('lanzamiento síncrono');
    });

    expect(result).toEqual({ kind: 'error' });
  });

  it('traslada las opciones a getToken, incluido skipCache', async () => {
    const seen: (boolean | undefined)[] = [];
    const getToken = (options?: { readonly skipCache?: boolean }): Promise<string | null> => {
      seen.push(options?.skipCache);
      return Promise.resolve(VALID_TOKEN);
    };

    await toTokenResult(getToken);
    await toTokenResult(getToken, { skipCache: true });

    expect(seen).toEqual([undefined, true]);
  });

  it('no filtra el token ni el mensaje del SDK en los resultados que no son token', async () => {
    const secret = 'secreto-que-no-debe-filtrarse';

    const results = [
      await toTokenResult(() => Promise.reject(offlineError)),
      await toTokenResult(() => Promise.reject(new Error(secret))),
      await toTokenResult(resolvedToken(null)),
    ];

    for (const result of results) {
      expect(Object.keys(result)).toEqual(['kind']);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain(VALID_TOKEN);
    }
  });
});

describe('toSessionSnapshot (adaptador real de Clerk)', () => {
  it('mientras Clerk no ha cargado devuelve loading', () => {
    const snapshot = toSessionSnapshot({
      isLoaded: false,
      isSignedIn: undefined,
      userId: null,
      sessionId: null,
    });

    expect(snapshot).toEqual({ status: 'loading' });
  });

  it('sin sesión devuelve signed_out', () => {
    const snapshot = toSessionSnapshot({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      sessionId: null,
    });

    expect(snapshot).toEqual({ status: 'signed_out' });
  });

  it('compone la identidad en memoria como userId:sessionId', () => {
    const snapshot = toSessionSnapshot({
      isLoaded: true,
      isSignedIn: true,
      userId: 'user_sintetico',
      sessionId: 'sess_sintetica',
    });

    expect(snapshot).toEqual({ status: 'signed_in', identity: 'user_sintetico:sess_sintetica' });
  });

  it('no considera firmada una sesión a la que le falta userId o sessionId', () => {
    const snapshot = toSessionSnapshot({
      isLoaded: true,
      isSignedIn: true,
      userId: null,
      sessionId: 'sess_sintetica',
    });

    expect(snapshot).toEqual({ status: 'signed_out' });
  });
});
