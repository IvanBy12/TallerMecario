import { describe, expect, it } from 'vitest';

import { e2eEnv, invalidVariables, missingVariables, RETIRED_FIXED_PLATE_VARIABLE } from '../../e2e/support/env';
import { SYNTHETIC_MARKERS } from '../helpers/markers';
import { syntheticEnv, without } from '../helpers/synthetic-env';

describe('preflight del ambiente E2E', () => {
  it('env completo sintético → válido', () => {
    const env = syntheticEnv();
    expect(missingVariables(env)).toEqual([]);
    expect(invalidVariables(env)).toEqual([]);
    expect(() => e2eEnv(env)).not.toThrow();
  });

  it.each([
    ['owner (correo)', 'E2E_USER_EMAIL'],
    ['owner (contraseña)', 'E2E_USER_PASSWORD'],
    ['restricted (correo)', 'E2E_RESTRICTED_EMAIL'],
    ['restricted (contraseña)', 'E2E_RESTRICTED_PASSWORD'],
    ['tenant B (id)', 'E2E_TENANT_B_ID'],
    ['tenant B (correo)', 'E2E_TENANT_B_USER_EMAIL'],
    ['tenant B (contraseña)', 'E2E_TENANT_B_USER_PASSWORD'],
    ['tenant B (recepción real)', 'E2E_TENANT_B_RECEPTION_ID'],
  ])('falta %s → error que nombra la variable', (_label, variable) => {
    const env = without(syntheticEnv(), variable);
    expect(missingVariables(env)).toEqual([variable]);
    expect(() => e2eEnv(env)).toThrow(variable);
  });

  it('variable vacía o con solo espacios cuenta como ausente', () => {
    expect(missingVariables({ ...syntheticEnv(), E2E_USER_EMAIL: '   ' })).toEqual(['E2E_USER_EMAIL']);
  });

  it('config parcial → error con TODAS las variables ausentes', () => {
    const partial = {
      VITE_API_BASE_URL: 'https://api.example.invalid',
      VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic',
      E2E_TENANT_ID: syntheticEnv()['E2E_TENANT_ID'] ?? '',
      E2E_USER_EMAIL: 'owner@example.invalid',
    };
    expect(missingVariables(partial)).toEqual([
      'E2E_USER_PASSWORD',
      'E2E_RESTRICTED_EMAIL',
      'E2E_RESTRICTED_PASSWORD',
      'E2E_TENANT_B_ID',
      'E2E_TENANT_B_USER_EMAIL',
      'E2E_TENANT_B_USER_PASSWORD',
      'E2E_TENANT_B_RECEPTION_ID',
    ]);
    expect(() => e2eEnv(partial)).toThrow(/Falta la variable de entorno/);
  });

  it('entorno vacío → faltan todas', () => {
    expect(missingVariables({})).toHaveLength(11);
  });

  it('los mensajes de error nombran variables y jamás valores', () => {
    const env = { ...syntheticEnv(), E2E_USER_PASSWORD: SYNTHETIC_MARKERS.password };
    const messages = [
      ...missingVariables(without(env, 'E2E_RESTRICTED_EMAIL')),
      ...invalidVariables({ ...env, VITE_CLERK_PUBLISHABLE_KEY: `pk_live_${SYNTHETIC_MARKERS.token}` }),
    ];
    let thrown = '';
    try {
      e2eEnv(without(env, 'E2E_TENANT_B_ID'));
    } catch (error) {
      thrown = error instanceof Error ? error.message : '';
    }
    expect([...messages, thrown].join('\n')).not.toContain('AUDIT_SYNTHETIC');
  });

  it('rechaza claves Clerk que no son de prueba, URLs inválidas, UUID inválidos y talleres iguales', () => {
    const env = syntheticEnv();
    expect(invalidVariables({ ...env, VITE_CLERK_PUBLISHABLE_KEY: 'pk_live_x' }).join()).toContain('VITE_CLERK_PUBLISHABLE_KEY');
    expect(invalidVariables({ ...env, VITE_API_BASE_URL: 'no es url' }).join()).toContain('VITE_API_BASE_URL');
    expect(invalidVariables({ ...env, E2E_TENANT_ID: 'xyz' }).join()).toContain('E2E_TENANT_ID');
    expect(invalidVariables({ ...env, E2E_TENANT_B_ID: env['E2E_TENANT_ID'] ?? '' }).join()).toContain('E2E_TENANT_B_ID');
  });

  it('F5: la placa fija retirada se rechaza (no se puede forzar la reutilización de un recurso mutante)', () => {
    const problems = invalidVariables({ ...syntheticEnv(), [RETIRED_FIXED_PLATE_VARIABLE]: 'ABC123' });
    expect(problems.join()).toContain(RETIRED_FIXED_PLATE_VARIABLE);
    expect(problems.join()).not.toContain('ABC123');
  });
});
