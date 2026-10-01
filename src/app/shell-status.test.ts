import { describe, expect, it } from 'vitest';

import type { ReadyState } from '@/features/auth/workshop-context';

import { shellStatusOf } from './shell-status';

const IDENTITY = 'user-1:session-1';

const READY: ReadyState = {
  kind: 'ready',
  identity: IDENTITY,
  tenantId: 'T-A',
  membershipId: 'M-A',
  notice: null,
  degraded: null,
};

describe('shellStatusOf', () => {
  it('una sesión iniciada sin contexto de taller integrado entra al shell con aviso', () => {
    expect(shellStatusOf({ kind: 'signed_in_context_pending', identity: IDENTITY })).toBe(
      'context_pending',
    );
  });

  it('un contexto listo y sin incidencias entra al shell sin aviso', () => {
    expect(shellStatusOf(READY)).toBe('context_ready');
  });

  it('un contexto degradado o con aviso sigue en manos del AuthGate', () => {
    expect(
      shellStatusOf({
        ...READY,
        degraded: { reason: 'network', requestId: null, retryNotBefore: null },
      }),
    ).toBeNull();
    expect(shellStatusOf({ ...READY, notice: 'workshop_access_revoked' })).toBeNull();
  });

  it('los estados sin sesión válida no entran al shell', () => {
    expect(shellStatusOf({ kind: 'loading_identity' })).toBeNull();
    expect(shellStatusOf({ kind: 'signed_out' })).toBeNull();
    expect(shellStatusOf({ kind: 'no_access', identity: IDENTITY, notice: null })).toBeNull();
    expect(shellStatusOf({ kind: 'session_expired' })).toBeNull();
  });
});
