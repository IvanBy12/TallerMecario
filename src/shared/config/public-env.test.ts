import { describe, expect, it } from 'vitest';

import type { PublicEnvIssue, PublicEnvResult } from '@/shared/config/public-env';
import { parsePublicEnv } from '@/shared/config/public-env';

const UNKNOWN_APP_ENV_ISSUE: PublicEnvIssue = { variable: 'VITE_APP_ENV', reason: 'unknown_value' };
const INVALID_ORIGIN_ISSUE: PublicEnvIssue = {
  variable: 'VITE_API_BASE_URL',
  reason: 'invalid_origin',
};
const HTTPS_REQUIRED_ISSUE: PublicEnvIssue = {
  variable: 'VITE_API_BASE_URL',
  reason: 'https_required',
};

function issuesOf(result: PublicEnvResult): readonly PublicEnvIssue[] {
  return result.ok ? [] : result.issues;
}

describe('parsePublicEnv', () => {
  it('caso 1: sin variables y PROD=false usa local y sin API', () => {
    expect(parsePublicEnv({ PROD: false })).toEqual({
      ok: true,
      env: { appEnv: 'local', apiOrigin: null },
    });
  });

  it('caso 2: sin variables y PROD=true usa production', () => {
    expect(parsePublicEnv({ PROD: true })).toEqual({
      ok: true,
      env: { appEnv: 'production', apiOrigin: null },
    });
  });

  it('caso 3: cadenas vacías o solo espacios se tratan como no definido', () => {
    expect(parsePublicEnv({ PROD: true, VITE_APP_ENV: '' })).toEqual({
      ok: true,
      env: { appEnv: 'production', apiOrigin: null },
    });
    expect(parsePublicEnv({ PROD: true, VITE_APP_ENV: '   ' })).toEqual({
      ok: true,
      env: { appEnv: 'production', apiOrigin: null },
    });
  });

  it('caso 4: la variable explícita prevalece sobre PROD', () => {
    expect(parsePublicEnv({ PROD: true, VITE_APP_ENV: 'staging' })).toEqual({
      ok: true,
      env: { appEnv: 'staging', apiOrigin: null },
    });
  });

  it('caso 5: valor de entorno desconocido', () => {
    expect(parsePublicEnv({ PROD: false, VITE_APP_ENV: 'prod' })).toEqual({
      ok: false,
      issues: [UNKNOWN_APP_ENV_ISSUE],
    });
  });

  it('caso 6: acepta un origen https en production', () => {
    expect(
      parsePublicEnv({ PROD: true, VITE_API_BASE_URL: 'https://api.example.test' }),
    ).toEqual({ ok: true, env: { appEnv: 'production', apiOrigin: 'https://api.example.test' } });
  });

  it('caso 7: acepta http en local', () => {
    expect(
      parsePublicEnv({ PROD: false, VITE_API_BASE_URL: 'http://localhost:3000' }),
    ).toEqual({ ok: true, env: { appEnv: 'local', apiOrigin: 'http://localhost:3000' } });
  });

  it('caso 8: exige https cuando el entorno no es local', () => {
    expect(
      parsePublicEnv({
        PROD: true,
        VITE_APP_ENV: 'staging',
        VITE_API_BASE_URL: 'http://api.example.test',
      }),
    ).toEqual({ ok: false, issues: [HTTPS_REQUIRED_ISSUE] });
    expect(
      parsePublicEnv({
        PROD: true,
        VITE_APP_ENV: 'production',
        VITE_API_BASE_URL: 'http://api.example.test',
      }),
    ).toEqual({ ok: false, issues: [HTTPS_REQUIRED_ISSUE] });
  });

  it('caso 9: rechaza textos que no son un origen http(s) válido', () => {
    const values = [
      'no es url',
      'ftp://x.example.test',
      'https://user:pass@x.example.test',
      'https://x.example.test/?a=1',
      'https://x.example.test/?',
      'https://x.example.test/#frag',
    ];
    for (const value of values) {
      expect(parsePublicEnv({ PROD: true, VITE_API_BASE_URL: value })).toEqual({
        ok: false,
        issues: [INVALID_ORIGIN_ISSUE],
      });
    }
  });

  it('caso 10: con entorno inválido no se evalúa la regla https', () => {
    expect(
      parsePublicEnv({
        PROD: true,
        VITE_APP_ENV: 'prod',
        VITE_API_BASE_URL: 'http://api.example.test',
      }),
    ).toEqual({ ok: false, issues: [UNKNOWN_APP_ENV_ISSUE] });
  });

  it('caso 11: acumula un issue por variable inválida', () => {
    expect(
      parsePublicEnv({
        PROD: true,
        VITE_APP_ENV: 'prod',
        VITE_API_BASE_URL: 'no es url',
      }),
    ).toEqual({ ok: false, issues: [UNKNOWN_APP_ENV_ISSUE, INVALID_ORIGIN_ISSUE] });
  });

  it('caso 12: los issues nunca filtran el valor recibido', () => {
    const result = parsePublicEnv({
      PROD: true,
      VITE_APP_ENV: 'production',
      VITE_API_BASE_URL: 'https://user:pass@x.example.test',
    });
    expect(result).toEqual({ ok: false, issues: [INVALID_ORIGIN_ISSUE] });
    const serialized = JSON.stringify(issuesOf(result));
    expect(serialized).not.toContain('user');
    expect(serialized).not.toContain('pass');
  });

  it('caso 13: rechaza cualquier ruta distinta de "/"', () => {
    const values = [
      'https://api.example.test/api',
      'https://api.example.test/v1/',
      'https://api.example.test//',
    ];
    for (const value of values) {
      expect(
        parsePublicEnv({ PROD: true, VITE_APP_ENV: 'production', VITE_API_BASE_URL: value }),
      ).toEqual({ ok: false, issues: [INVALID_ORIGIN_ISSUE] });
    }
  });

  it('caso 14: normaliza el origen (sin "/" final, minúsculas, puerto por defecto)', () => {
    const values = [
      'https://api.example.test/',
      '  https://api.example.test  ',
      'HTTPS://API.Example.TEST:443/',
    ];
    for (const value of values) {
      expect(
        parsePublicEnv({ PROD: true, VITE_APP_ENV: 'production', VITE_API_BASE_URL: value }),
      ).toEqual({ ok: true, env: { appEnv: 'production', apiOrigin: 'https://api.example.test' } });
    }
  });

  it('caso 15: conserva un puerto no por defecto', () => {
    const values = ['https://api.example.test:8443', 'https://api.example.test:8443/'];
    for (const value of values) {
      expect(
        parsePublicEnv({ PROD: true, VITE_APP_ENV: 'production', VITE_API_BASE_URL: value }),
      ).toEqual({
        ok: true,
        env: { appEnv: 'production', apiOrigin: 'https://api.example.test:8443' },
      });
    }
  });
});
