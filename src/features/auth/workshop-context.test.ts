import { describe, expect, it } from 'vitest';

import type { ApiFailure, ApiFailureKind } from '@/shared/api/api-failure';

import {
  createAuthReducer,
  withSingleFreshRetry,
  type AuthAction,
  type AuthStore,
  type ContextLoadAttempt,
  type ContextScope,
  type WorkshopContextSnapshot,
} from './workshop-context';

type NonRateLimitedKind = Exclude<ApiFailureKind, 'rate_limited'>;

function failure(kind: NonRateLimitedKind, requestId: string | null = null): ApiFailure {
  return { kind, status: null, code: null, requestId };
}

function httpFailure(kind: NonRateLimitedKind, status: number, code: string | null): ApiFailure {
  return { kind, status, code, requestId: 'req-'+String(status) };
}

function rateLimited(retryAfterSeconds: number | null, requestId: string | null = null): ApiFailure {
  return { kind: 'rate_limited', status: 429, code: 'RATE_LIMIT_EXCEEDED', requestId, retryAfterSeconds };
}

const withSource = createAuthReducer({ hasContextSource: true });
const withoutSource = createAuthReducer({ hasContextSource: false });

const READY: AuthStore = {
  generation: 3,
  auth: {
    kind: 'ready',
    identity: 'id-A',
    tenantId: 'T-A',
    membershipId: 'M-A',
    notice: null,
    degraded: null,
  },
};

const LOADING_CONTEXT: AuthStore = {
  generation: 3,
  auth: { kind: 'loading_context', identity: 'id-A', notice: null },
};

const SELECTION: AuthStore = {
  generation: 3,
  auth: {
    kind: 'workshop_selection_required',
    identity: 'id-A',
    memberships: [
      { tenantId: 'T-A', membershipId: 'M-A' },
      { tenantId: 'T-B', membershipId: 'M-B' },
    ],
    notice: null,
  },
};

function serialized(store: AuthStore): string {
  return JSON.stringify(store.auth);
}

function contextLoaded(generation: number, snapshot: WorkshopContextSnapshot): AuthAction {
  return { type: 'context_loaded', generation, snapshot };
}

describe('no retención de contexto y de identidad (prueba 1 de 4.7)', () => {
  it('el taller anterior nunca sobrevive', () => {
    const scenarios: readonly {
      readonly name: string;
      /** T7d–T7f repiten ids en la ENTRADA de la acción (no son contexto retenido). */
      readonly inputRepeatsTenantId?: boolean;
      readonly run: (store: AuthStore) => AuthStore;
    }[] = [
      {
        name: 'T3 session_changed(signed_out)',
        run: (store) => withSource(store, { type: 'session_changed', session: { status: 'signed_out' } }),
      },
      {
        name: 'T1 cambio de identidad',
        run: (store) =>
          withSource(store, {
            type: 'session_changed',
            session: { status: 'signed_in', identity: 'id-B' },
          }),
      },
      {
        name: 'T6 sign_out_requested',
        run: (store) => withSource(store, { type: 'sign_out_requested' }),
      },
      {
        name: 'T10 context_failed(no_session)',
        run: (store) =>
          withSource(store, {
            type: 'context_failed',
            generation: 3,
            failure: failure('no_session'),
            at: 0,
          }),
      },
      {
        name: 'T11 context_failed(unauthenticated)',
        run: (store) =>
          withSource(store, {
            type: 'context_failed',
            generation: 3,
            failure: failure('unauthenticated', 'req-401'),
            at: 0,
          }),
      },
      {
        name: 'T12 context_failed(contract_violation)',
        run: (store) =>
          withSource(store, {
            type: 'context_failed',
            generation: 3,
            failure: failure('contract_violation'),
            at: 0,
          }),
      },
      {
        name: 'T14 access_lost',
        run: (store) => withSource(store, { type: 'access_lost' }),
      },
      {
        name: 'T15 access_lost con aviso previo',
        run: (store) =>
          withSource(withSource(store, { type: 'access_lost' }), { type: 'access_lost' }),
      },
      {
        name: 'T9 context_failed(token_offline) tras access_lost',
        run: (store) =>
          withSource(withSource(store, { type: 'access_lost' }), {
            type: 'context_failed',
            generation: 4,
            failure: failure('token_offline', 'req-off'),
            at: 0,
          }),
      },
      {
        name: 'T6b sign_out_failed',
        run: (store) =>
          withSource(withSource(store, { type: 'sign_out_requested' }), {
            type: 'sign_out_failed',
            generation: 4,
            identity: 'id-A',
            failure: failure('token_error'),
            at: 0,
          }),
      },
      {
        name: 'T7d otro taller',
        run: (store) =>
          withSource(store, contextLoaded(3, { kind: 'single', membership: { tenantId: 'T-B', membershipId: 'M-B' } })),
      },
      {
        name: 'T7e otra membership del mismo taller',
        inputRepeatsTenantId: true,
        run: (store) =>
          withSource(store, contextLoaded(3, { kind: 'single', membership: { tenantId: 'T-A', membershipId: 'M-B' } })),
      },
      {
        name: 'T7f multiple sin el par activo',
        run: (store) =>
          withSource(store, contextLoaded(3, { kind: 'multiple', memberships: [{ tenantId: 'T-B', membershipId: 'M-B' }] })),
      },
      {
        name: 'T7g none',
        run: (store) => withSource(store, contextLoaded(3, { kind: 'none' })),
      },
    ];

    for (const scenario of scenarios) {
      const result = serialized(scenario.run(READY));
      if (scenario.inputRepeatsTenantId !== true) {
        expect(result, scenario.name).not.toContain('T-A');
      }
      expect(result, scenario.name).not.toContain('M-A');
    }

    // Segundo punto de partida: el selector tampoco retiene ids al salir de él.
    const fromSelection: readonly AuthAction[] = [
      { type: 'session_changed', session: { status: 'signed_out' } },
      { type: 'sign_out_requested' },
      { type: 'context_failed', generation: 3, failure: failure('unauthenticated', 'req-1'), at: 0 },
      { type: 'context_failed', generation: 3, failure: failure('contract_violation'), at: 0 },
      { type: 'access_lost' },
      { type: 'session_changed', session: { status: 'signed_in', identity: 'id-B' } },
    ];
    for (const action of fromSelection) {
      const result = serialized(withSource(SELECTION, action));
      expect(result, action.type).not.toContain('T-A');
      expect(result, action.type).not.toContain('M-A');
    }
  });

  it('la identidad desaparece tras logout, session_expired y cambio de identidad', () => {
    const afterSignOut = withSource(READY, { type: 'sign_out_requested' });
    const afterSessionEnded = withSource(READY, {
      type: 'session_changed',
      session: { status: 'signed_out' },
    });
    const afterNoSession = withSource(READY, {
      type: 'context_failed',
      generation: 3,
      failure: failure('no_session'),
      at: 0,
    });
    const afterIdentityChange = withSource(READY, {
      type: 'session_changed',
      session: { status: 'signed_in', identity: 'id-B' },
    });

    for (const store of [afterSignOut, afterSessionEnded, afterNoSession, afterIdentityChange]) {
      expect(serialized(store)).not.toContain('id-A');
    }
    expect(serialized(afterIdentityChange)).toContain('id-B');
  });

  it('la identidad se conserva solo en el campo identity donde corresponde', () => {
    const kept = [
      withSource(READY, {
        type: 'context_failed',
        generation: 3,
        failure: failure('unauthenticated', 'req-1'),
        at: 0,
      }),
      withSource(READY, {
        type: 'context_failed',
        generation: 3,
        failure: failure('contract_violation'),
        at: 0,
      }),
      withSource(READY, { type: 'access_lost' }),
      withSource(withSource(READY, { type: 'access_lost' }), { type: 'access_lost' }),
      withSource(withSource(READY, { type: 'access_lost' }), {
        type: 'context_failed',
        generation: 4,
        failure: failure('token_offline'),
        at: 0,
      }),
      withSource(withSource(READY, { type: 'sign_out_requested' }), {
        type: 'sign_out_failed',
        generation: 4,
        identity: 'id-A',
        failure: failure('token_error'),
        at: 0,
      }),
    ];

    for (const store of kept) {
      expect(serialized(store)).toContain('id-A');
      // La identidad solo aparece en el campo `identity`.
      expect(JSON.stringify(store.auth)).toContain('"identity":"id-A"');
    }
  });
});

describe('retención solo degradada (prueba 2)', () => {
  it('ready + fallo recuperable conserva el contexto en ready.degraded', () => {
    const result = withSource(READY, {
      type: 'context_failed',
      generation: 3,
      failure: failure('network', 'req-net'),
      at: 1000,
    });

    expect(result.generation).toBe(3);
    expect(result.auth).toEqual({
      kind: 'ready',
      identity: 'id-A',
      tenantId: 'T-A',
      membershipId: 'M-A',
      notice: null,
      degraded: { reason: 'network', requestId: 'req-net', retryNotBefore: null },
    });
  });

  it('loading_context + fallo recuperable produce recoverable_error sin ids de taller', () => {
    const result = withSource(LOADING_CONTEXT, {
      type: 'context_failed',
      generation: 3,
      failure: failure('server_error', 'req-5'),
      at: 0,
    });

    expect(result.auth).toEqual({
      kind: 'recoverable_error',
      identity: 'id-A',
      reason: 'server_error',
      requestId: 'req-5',
      retryNotBefore: null,
    });
    expect(serialized(result)).not.toContain('T-A');
  });

  it('traduce cada razón recuperable', () => {
    const cases: readonly (readonly [ApiFailure, string])[] = [
      [failure('token_offline'), 'offline'],
      [failure('token_error'), 'identity_client_error'],
      [failure('network'), 'network'],
      [failure('timeout'), 'timeout'],
      [failure('server_error'), 'server_error'],
      [rateLimited(3), 'rate_limited'],
    ];
    for (const [apiFailure, reason] of cases) {
      const result = withSource(LOADING_CONTEXT, {
        type: 'context_failed',
        generation: 3,
        failure: apiFailure,
        at: 0,
      });
      if (result.auth.kind === 'recoverable_error') {
        expect(result.auth.reason).toBe(reason);
      } else {
        throw new Error('se esperaba recoverable_error');
      }
    }
  });
});

describe('degradado se limpia sin corte (prueba 3)', () => {
  const degradedReady: AuthStore = {
    ...READY,
    auth: {
      kind: 'ready',
      identity: 'id-A',
      tenantId: 'T-A',
      membershipId: 'M-A',
      notice: null,
      degraded: { reason: 'network', requestId: null, retryNotBefore: null },
    },
  };

  it('T7b: mismo par activo limpia degraded sin cambiar la generación', () => {
    const result = withSource(
      degradedReady,
      contextLoaded(3, { kind: 'single', membership: { tenantId: 'T-A', membershipId: 'M-A' } }),
    );

    expect(result.generation).toBe(3);
    if (result.auth.kind === 'ready') {
      expect(result.auth.degraded).toBeNull();
    } else {
      throw new Error('se esperaba ready');
    }
  });

  it('T7c: multiple que contiene el par activo limpia degraded sin cortar', () => {
    const result = withSource(
      degradedReady,
      contextLoaded(3, {
        kind: 'multiple',
        memberships: [
          { tenantId: 'T-A', membershipId: 'M-A' },
          { tenantId: 'T-B', membershipId: 'M-B' },
        ],
      }),
    );

    expect(result.generation).toBe(3);
    if (result.auth.kind === 'ready') {
      expect(result.auth.degraded).toBeNull();
    } else {
      throw new Error('se esperaba ready');
    }
  });
});

describe('generación obsoleta (prueba 4)', () => {
  it('las acciones con generación antigua devuelven el mismo objeto', () => {
    const stale: readonly AuthAction[] = [
      contextLoaded(2, { kind: 'none' }),
      { type: 'context_failed', generation: 2, failure: failure('network'), at: 0 },
      { type: 'sign_out_failed', generation: 2, identity: 'id-A', failure: failure('token_error'), at: 0 },
    ];

    for (const action of stale) {
      expect(withSource(READY, action)).toBe(READY);
    }
  });
});

describe('fatales (prueba 5)', () => {
  const fatalKinds: readonly NonRateLimitedKind[] = [
    'client_bug',
    'bad_request',
    'unexpected_status',
    'unexpected_redirect',
    'contract_violation',
    'forbidden_unknown',
    'permission_denied',
    'action_forbidden',
  ];

  it('cada kind de T12 produce fatal_error con requestId y sin ids de taller', () => {
    for (const kind of fatalKinds) {
      const result = withSource(LOADING_CONTEXT, {
        type: 'context_failed',
        generation: 3,
        failure: failure(kind, 'req-x'),
        at: 0,
      });

      expect(result.generation).toBe(4);
      expect(result.auth.kind).toBe('fatal_error');
      if (result.auth.kind === 'fatal_error') {
        const expected = kind === 'client_bug' || kind === 'bad_request' ? 'client_bug' : 'contract_violation';
        expect(result.auth.reason).toBe(expected);
        expect(result.auth.requestId).toBe('req-x');
      }
      expect(serialized(result)).not.toContain('T-A');
    }
  });

  it('T9 y T11 no producen fatal_error', () => {
    const recoverable = withSource(LOADING_CONTEXT, {
      type: 'context_failed',
      generation: 3,
      failure: failure('network'),
      at: 0,
    });
    const rejected = withSource(LOADING_CONTEXT, {
      type: 'context_failed',
      generation: 3,
      failure: httpFailure('unauthenticated', 401, 'AUTHENTICATION_REQUIRED'),
      at: 0,
    });

    expect(recoverable.auth.kind).toBe('recoverable_error');
    expect(rejected.auth.kind).toBe('auth_rejected');
  });

  it('T13 ignora aborted', () => {
    expect(
      withSource(LOADING_CONTEXT, {
        type: 'context_failed',
        generation: 3,
        failure: failure('aborted'),
        at: 0,
      }),
    ).toBe(LOADING_CONTEXT);
  });
});

describe('anti-bucle (prueba 6)', () => {
  it('access_lost con aviso previo lleva a no_access sin revalidar', () => {
    const first = withSource(READY, { type: 'access_lost' });
    const second = withSource(first, { type: 'access_lost' });

    expect(first.auth).toEqual({
      kind: 'loading_context',
      identity: 'id-A',
      notice: 'workshop_access_revoked',
    });
    expect(second.auth).toEqual({
      kind: 'no_access',
      identity: 'id-A',
      notice: 'workshop_access_revoked',
    });
  });
});

describe('sin contextSource (prueba 7)', () => {
  it('T1, T17 y la salida de auth_rejected producen signed_in_context_pending', () => {
    const t1 = withoutSource({ generation: 0, auth: { kind: 'loading_identity' } }, {
      type: 'session_changed',
      session: { status: 'signed_in', identity: 'id-A' },
    });
    expect(t1.auth).toEqual({ kind: 'signed_in_context_pending', identity: 'id-A' });

    const rejected: AuthStore = {
      generation: 2,
      auth: { kind: 'auth_rejected', identity: 'id-A', requestId: null },
    };
    const t17 = withoutSource(rejected, { type: 'retry_requested', at: 10 });
    expect(t17.auth).toEqual({ kind: 'signed_in_context_pending', identity: 'id-A' });

    const fromRecoverable = withoutSource(
      { generation: 2, auth: { kind: 'recoverable_error', identity: 'id-A', reason: 'network', requestId: null, retryNotBefore: null } },
      { type: 'retry_requested', at: 10 },
    );
    expect(fromRecoverable.auth).toEqual({ kind: 'signed_in_context_pending', identity: 'id-A' });
  });

  it('ninguna acción lleva a loading_context', () => {
    const actions: readonly AuthAction[] = [
      { type: 'session_changed', session: { status: 'loading' } },
      { type: 'session_changed', session: { status: 'signed_out' } },
      { type: 'session_changed', session: { status: 'signed_in', identity: 'id-B' } },
      { type: 'sign_out_requested' },
      { type: 'access_lost' },
      { type: 'retry_requested', at: 10 },
      { type: 'notice_dismissed' },
      contextLoaded(1, { kind: 'none' }),
      contextLoaded(1, { kind: 'single', membership: { tenantId: 'T-X', membershipId: 'M-X' } }),
      { type: 'context_failed', generation: 1, failure: failure('network'), at: 0 },
    ];

    for (const action of actions) {
      const result = withoutSource(
        { generation: 1, auth: { kind: 'signed_in_context_pending', identity: 'id-A' } },
        action,
      );
      expect(result.auth.kind).not.toBe('loading_context');
    }
  });
});

describe('sign_out_failed (prueba 8)', () => {
  it('T6b no retiene contexto y conserva la identidad viva', () => {
    const afterSignOut = withSource(READY, { type: 'sign_out_requested' });
    const result = withSource(afterSignOut, {
      type: 'sign_out_failed',
      generation: afterSignOut.generation,
      identity: 'id-A',
      failure: failure('token_error', 'req-so'),
      at: 0,
    });

    expect(result.auth).toEqual({
      kind: 'recoverable_error',
      identity: 'id-A',
      reason: 'identity_client_error',
      requestId: 'req-so',
      retryNotBefore: null,
    });
    expect(result.generation).toBe(afterSignOut.generation);
    expect(serialized(result)).not.toContain('T-A');
  });
});

describe('cortes de T7 (prueba 10)', () => {
  it('T7g none corta y no tiene access', () => {
    const result = withSource(READY, contextLoaded(3, { kind: 'none' }));

    expect(result.generation).toBe(4);
    expect(result.auth).toEqual({
      kind: 'no_access',
      identity: 'id-A',
      notice: 'workshop_access_revoked',
    });
  });

  it('T7f multiple sin el par activo corta y pide selección', () => {
    const result = withSource(
      READY,
      contextLoaded(3, { kind: 'multiple', memberships: [{ tenantId: 'T-B', membershipId: 'M-B' }] }),
    );

    expect(result.generation).toBe(4);
    expect(result.auth).toEqual({
      kind: 'workshop_selection_required',
      identity: 'id-A',
      memberships: [{ tenantId: 'T-B', membershipId: 'M-B' }],
      notice: 'workshop_access_revoked',
    });
  });

  it('T7d otro taller corta con aviso workshop_changed', () => {
    const result = withSource(
      READY,
      contextLoaded(3, { kind: 'single', membership: { tenantId: 'T-B', membershipId: 'M-B' } }),
    );

    expect(result.generation).toBe(4);
    expect(result.auth).toEqual({
      kind: 'ready',
      identity: 'id-A',
      tenantId: 'T-B',
      membershipId: 'M-B',
      notice: 'workshop_changed',
      degraded: null,
    });
  });

  it('T7e otra membership del mismo taller corta sin aviso', () => {
    const result = withSource(
      READY,
      contextLoaded(3, { kind: 'single', membership: { tenantId: 'T-A', membershipId: 'M-B' } }),
    );

    expect(result.generation).toBe(4);
    if (result.auth.kind === 'ready') {
      expect(result.auth.notice).toBeNull();
      expect(result.auth.membershipId).toBe('M-B');
    } else {
      throw new Error('se esperaba ready');
    }
  });

  it('T7a desde loading_context no corta y traslada el aviso', () => {
    const source: AuthStore = {
      generation: 5,
      auth: { kind: 'loading_context', identity: 'id-A', notice: 'workshop_access_revoked' },
    };

    const single = withSource(
      source,
      contextLoaded(5, { kind: 'single', membership: { tenantId: 'T-C', membershipId: 'M-C' } }),
    );
    expect(single.generation).toBe(5);
    expect(single.auth).toEqual({
      kind: 'ready',
      identity: 'id-A',
      tenantId: 'T-C',
      membershipId: 'M-C',
      notice: 'workshop_access_revoked',
      degraded: null,
    });

    const multiple = withSource(
      source,
      contextLoaded(5, { kind: 'multiple', memberships: [{ tenantId: 'T-C', membershipId: 'M-C' }] }),
    );
    expect(multiple.generation).toBe(5);
    expect(multiple.auth.kind).toBe('workshop_selection_required');

    const none = withSource(source, contextLoaded(5, { kind: 'none' }));
    expect(none.generation).toBe(5);
    expect(none.auth.kind).toBe('no_access');
  });

  it('T16 selección: solo acepta una membership de la instantánea', () => {
    const accepted = withSource(SELECTION, { type: 'tenant_selected', tenantId: 'T-B' });
    expect(accepted.generation).toBe(4);
    expect(accepted.auth).toEqual({
      kind: 'ready',
      identity: 'id-A',
      tenantId: 'T-B',
      membershipId: 'M-B',
      notice: null,
      degraded: null,
    });

    expect(withSource(SELECTION, { type: 'tenant_selected', tenantId: 'T-Z' })).toBe(SELECTION);
  });

  it('T19 descarta el aviso', () => {
    const withNotice: AuthStore = {
      generation: 4,
      auth: { kind: 'no_access', identity: 'id-A', notice: 'workshop_access_revoked' },
    };
    const cleared = withSource(withNotice, { type: 'notice_dismissed' });

    expect(cleared.generation).toBe(4);
    expect(cleared.auth).toEqual({ kind: 'no_access', identity: 'id-A', notice: null });
    expect(cleared).not.toBe(withNotice);
  });
});

describe('espera de 429 (prueba 11)', () => {
  it('ready.degraded conserva retryNotBefore con tope de 120 s', () => {
    const nine = withSource(READY, {
      type: 'context_failed',
      generation: 3,
      failure: rateLimited(9, 'req-429'),
      at: 1000,
    });
    if (nine.auth.kind === 'ready' && nine.auth.degraded !== null) {
      expect(nine.auth.degraded.retryNotBefore).toBe(1000 + 9000);
    } else {
      throw new Error('se esperaba ready degradado');
    }

    const capped = withSource(READY, {
      type: 'context_failed',
      generation: 3,
      failure: rateLimited(300),
      at: 0,
    });
    if (capped.auth.kind === 'ready' && capped.auth.degraded !== null) {
      expect(capped.auth.degraded.retryNotBefore).toBe(120000);
    } else {
      throw new Error('se esperaba ready degradado');
    }
  });

  it('sin Retry-After legible usa 5 s y las demás razones no fijan espera', () => {
    const unreadable = withSource(LOADING_CONTEXT, {
      type: 'context_failed',
      generation: 3,
      failure: rateLimited(null),
      at: 100,
    });
    if (unreadable.auth.kind === 'recoverable_error') {
      expect(unreadable.auth.retryNotBefore).toBe(100 + 5000);
    } else {
      throw new Error('se esperaba recoverable_error');
    }

    const network = withSource(LOADING_CONTEXT, {
      type: 'context_failed',
      generation: 3,
      failure: failure('network'),
      at: 100,
    });
    if (network.auth.kind === 'recoverable_error') {
      expect(network.auth.retryNotBefore).toBeNull();
    } else {
      throw new Error('se esperaba recoverable_error');
    }
  });

  it('retry_requested se ignora antes de retryNotBefore', () => {
    const limited: AuthStore = {
      generation: 4,
      auth: {
        kind: 'recoverable_error',
        identity: 'id-A',
        reason: 'rate_limited',
        requestId: null,
        retryNotBefore: 5000,
      },
    };

    expect(withSource(limited, { type: 'retry_requested', at: 4999 })).toBe(limited);

    const allowed = withSource(limited, { type: 'retry_requested', at: 5000 });
    expect(allowed.generation).toBe(5);
    expect(allowed.auth).toEqual({ kind: 'loading_context', identity: 'id-A', notice: null });
  });

  it('T18: retry_requested sobre ready degradado no cambia estado ni generación', () => {
    const degraded: AuthStore = {
      generation: 6,
      auth: {
        kind: 'ready',
        identity: 'id-A',
        tenantId: 'T-A',
        membershipId: 'M-A',
        notice: null,
        degraded: { reason: 'rate_limited', requestId: null, retryNotBefore: 1000 },
      },
    };

    expect(withSource(degraded, { type: 'retry_requested', at: 999 })).toBe(degraded);
    expect(withSource(degraded, { type: 'retry_requested', at: 1000 })).toBe(degraded);
  });
});

describe('withSingleFreshRetry (prueba 9)', () => {
  function scope(signal: AbortSignal): ContextScope {
    return { generation: 1, identity: 'id-A', tenantId: null, signal };
  }

  it('(a) reintenta una sola vez con token fresco y el mismo scope tras 401', async () => {
    const controller = new AbortController();
    const attempts: ContextLoadAttempt[] = [];

    const result = await withSingleFreshRetry(scope(controller.signal), (attempt) => {
      attempts.push(attempt);
      return Promise.resolve(
        attempts.length === 1
          ? { ok: false, failure: httpFailure('unauthenticated', 401, 'AUTHENTICATION_REQUIRED') }
          : { ok: true, data: { kind: 'none' } },
      );
    });

    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.tokenPolicy).toBe('cached');
    expect(attempts[1]?.tokenPolicy).toBe('fresh');
    expect(attempts[0]?.scope).toBe(attempts[1]?.scope);
    expect(result.ok).toBe(true);
  });

  it('(b) cualquier otro resultado no reintenta', async () => {
    const controller = new AbortController();
    const failures: readonly ApiFailure[] = [
      failure('network'),
      failure('no_session'),
      failure('token_error'),
      failure('server_error'),
      httpFailure('permission_denied', 403, 'PERMISSION_DENIED'),
    ];

    for (const apiFailure of failures) {
      const attempts: ContextLoadAttempt[] = [];
      await withSingleFreshRetry(scope(controller.signal), (attempt) => {
        attempts.push(attempt);
        return Promise.resolve({ ok: false, failure: apiFailure });
      });
      expect(attempts, apiFailure.kind).toHaveLength(1);
    }

    const successes: ContextLoadAttempt[] = [];
    await withSingleFreshRetry(scope(controller.signal), (attempt) => {
      successes.push(attempt);
      return Promise.resolve({ ok: true, data: { kind: 'single', membership: { tenantId: 'T-A', membershipId: 'M-A' } } });
    });
    expect(successes).toHaveLength(1);
  });

  it('(c) dos 401 devuelven el segundo fallo sin una tercera llamada', async () => {
    const controller = new AbortController();
    const attempts: ContextLoadAttempt[] = [];

    const result = await withSingleFreshRetry(scope(controller.signal), (attempt) => {
      attempts.push(attempt);
      return Promise.resolve({
        ok: false,
        failure: httpFailure('unauthenticated', 401, 'AUTHENTICATION_REQUIRED'),
      });
    });

    expect(attempts).toHaveLength(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('unauthenticated');
    }
  });

  it('(d) si la señal se aborta entre intentos no hay segunda llamada', async () => {
    const controller = new AbortController();
    const attempts: ContextLoadAttempt[] = [];

    const result = await withSingleFreshRetry(scope(controller.signal), (attempt) => {
      attempts.push(attempt);
      controller.abort();
      return Promise.resolve({
        ok: false,
        failure: httpFailure('unauthenticated', 401, 'AUTHENTICATION_REQUIRED'),
      });
    });

    expect(attempts).toHaveLength(1);
    expect(result.ok).toBe(false);
  });
});
