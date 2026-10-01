import { describe, expect, it } from 'vitest';

import {
  classifyFailure,
  parseErrorEnvelope,
  parseRetryAfterSeconds,
  type FailureInput,
} from '@/shared/api/api-failure';

describe('parseErrorEnvelope', () => {
  it('lee code y request_id del envelope válido', () => {
    expect(
      parseErrorEnvelope({
        error: { code: 'PERMISSION_DENIED', message: 'no', request_id: 'req-1' },
      }),
    ).toEqual({ code: 'PERMISSION_DENIED', requestId: 'req-1' });
  });

  it('descarta códigos con formato inválido y request_id largos', () => {
    expect(parseErrorEnvelope({ error: { code: 'bad-code', request_id: 'x'.repeat(65) } })).toEqual({
      code: null,
      requestId: null,
    });
    expect(parseErrorEnvelope({ error: { code: '_LEADING', request_id: 'ok' } })).toEqual({
      code: null,
      requestId: 'ok',
    });
    expect(parseErrorEnvelope({ error: { code: 'A'.repeat(81) } })).toEqual({
      code: null,
      requestId: null,
    });
  });

  it('acepta el código de longitud mínima y máxima del contrato', () => {
    expect(parseErrorEnvelope({ error: { code: 'A' } }).code).toBe('A');
    expect(parseErrorEnvelope({ error: { code: `A${'B'.repeat(79)}` } }).code).toBe(
      `A${'B'.repeat(79)}`,
    );
  });

  it('no expone el mensaje del servidor ni estructuras inesperadas', () => {
    const parsed = parseErrorEnvelope({
      error: { code: 'X', message: 'detalle interno', request_id: 42 },
    });
    expect(parsed).toEqual({ code: 'X', requestId: null });
    expect(JSON.stringify(parsed)).not.toContain('detalle interno');
  });

  it('tolera cuerpos que no son envelope', () => {
    for (const body of [null, undefined, 'texto', 42, [], { error: 'no-objeto' }]) {
      expect(parseErrorEnvelope(body)).toEqual({ code: null, requestId: null });
    }
  });
});

describe('parseRetryAfterSeconds', () => {
  it('lee segundos enteros no negativos', () => {
    expect(parseRetryAfterSeconds('0')).toBe(0);
    expect(parseRetryAfterSeconds('30')).toBe(30);
    expect(parseRetryAfterSeconds(' 7 ')).toBe(7);
  });

  it('considera ilegible lo que no es un entero no negativo', () => {
    for (const raw of [null, '', '   ', 'abc', '-5', '1.5', 'Wed, 21 Oct 2026 07:28:00 GMT']) {
      expect(parseRetryAfterSeconds(raw)).toBeNull();
    }
  });
});

describe('classifyFailure', () => {
  it('clasifica fallas sin respuesta HTTP', () => {
    expect(classifyFailure({ source: 'client', reason: 'client_bug' }).kind).toBe('client_bug');
    expect(classifyFailure({ source: 'contract' }).kind).toBe('contract_violation');
    expect(classifyFailure({ source: 'redirect' }).kind).toBe('unexpected_redirect');
    expect(classifyFailure({ source: 'transport', reason: 'network' }).kind).toBe('network');
    expect(classifyFailure({ source: 'transport', reason: 'timeout' }).kind).toBe('timeout');
    expect(classifyFailure({ source: 'transport', reason: 'aborted' }).kind).toBe('aborted');
  });

  it('traduce el resultado del token sin compartir tipos de Clerk', () => {
    expect(classifyFailure({ source: 'token', reason: 'no_session' }).kind).toBe('no_session');
    expect(classifyFailure({ source: 'token', reason: 'offline' }).kind).toBe('token_offline');
    expect(classifyFailure({ source: 'token', reason: 'error' }).kind).toBe('token_error');
  });

  it('clasifica 401 y 403 conocidos', () => {
    expect(http(401, 'AUTHENTICATION_REQUIRED').kind).toBe('unauthenticated');
    expect(http(403, 'PERMISSION_DENIED').kind).toBe('permission_denied');
    for (const code of [
      'DOMAIN_ACTION_FORBIDDEN',
      'ROLE_ASSIGNMENT_NOT_ALLOWED',
      'SELF_ROLE_MODIFICATION_FORBIDDEN',
    ]) {
      expect(http(403, code).kind).toBe('action_forbidden');
    }
    expect(http(403, 'OTRO_CODIGO').kind).toBe('forbidden_unknown');
    expect(http(403, null).kind).toBe('forbidden_unknown');
  });

  it('clasifica 429, 5xx, 400 y otros 4xx', () => {
    expect(http(429, 'RATE_LIMIT_EXCEEDED').kind).toBe('rate_limited');
    expect(http(500, 'INTERNAL_ERROR').kind).toBe('server_error');
    expect(http(503, 'IDENTITY_PROVIDER_UNAVAILABLE').kind).toBe('server_error');
    expect(http(400, 'ALGO').kind).toBe('bad_request');
    for (const status of [404, 405, 409, 413, 415, 422]) {
      expect(http(status, null).kind).toBe('unexpected_status');
    }
  });

  it('clasifica los códigos del selector por status y contrato aprobado', () => {
    expect(http(403, 'ACTIVE_MEMBERSHIP_REQUIRED').kind).toBe('active_membership_required');
    expect(http(403, 'TENANT_ACCESS_DENIED').kind).toBe('tenant_access_denied');
    expect(http(409, 'TENANT_SELECTION_REQUIRED').kind).toBe('tenant_selection_required');
    expect(http(400, 'TENANT_SELECTION_INVALID').kind).toBe('client_bug');
  });

  it('conserva status, code y requestId, y retryAfterSeconds en rate_limited', () => {
    const limited = classifyFailure({
      source: 'http',
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      requestId: 'req-9',
      retryAfterSeconds: 12,
    });
    expect(limited).toEqual({
      kind: 'rate_limited',
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      requestId: 'req-9',
      retryAfterSeconds: 12,
    });

    const denied = classifyFailure({
      source: 'http',
      status: 403,
      code: 'PERMISSION_DENIED',
      requestId: 'req-10',
      retryAfterSeconds: null,
    });
    expect(denied).toEqual({
      kind: 'permission_denied',
      status: 403,
      code: 'PERMISSION_DENIED',
      requestId: 'req-10',
    });
    expect('retryAfterSeconds' in denied).toBe(false);
  });

  it('las fallas sin respuesta no llevan status ni code', () => {
    for (const input of [
      { source: 'client', reason: 'client_bug' },
      { source: 'contract' },
      { source: 'transport', reason: 'network' },
    ] satisfies readonly FailureInput[]) {
      const failure = classifyFailure(input);
      expect(failure.status).toBeNull();
      expect(failure.code).toBeNull();
      expect(failure.requestId).toBeNull();
    }
  });
});

function http(status: number, code: string | null) {
  return classifyFailure({
    source: 'http',
    status,
    code,
    requestId: null,
    retryAfterSeconds: null,
  });
}
