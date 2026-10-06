import path from 'node:path';

import type { Browser } from '@playwright/test';
import { describe, expect, it } from 'vitest';

import { e2eEnv, PERSONA_KEYS, PERSONA_VARIABLES, STATE_FILES, invalidVariables, type PersonaKey } from '../../e2e/support/env';
import { openPersona } from '../../e2e/support/persona';
import { readRepoFile } from '../helpers/repo';
import { syntheticEnv, without } from '../helpers/synthetic-env';

describe('aislamiento de personas (owner / restricted / tenant B)', () => {
  it('cada persona tiene su propio storageState', () => {
    const files = PERSONA_KEYS.map((persona) => STATE_FILES[persona]);
    expect(new Set(files).size).toBe(3);
    for (const file of files) expect(path.basename(path.dirname(file))).toBe('.auth');
  });

  it('cada persona tiene variables de identidad propias y distintas', () => {
    const names = PERSONA_KEYS.flatMap((persona) => [PERSONA_VARIABLES[persona].email, PERSONA_VARIABLES[persona].password]);
    expect(new Set(names).size).toBe(6);
  });

  it('la configuración resuelve identidades distintas por persona', () => {
    const env = e2eEnv(syntheticEnv());
    const emails = PERSONA_KEYS.map((persona) => env.credentials[persona].email);
    expect(new Set(emails).size).toBe(3);
  });

  it('no existe fallback owner → restricted / tenant B', () => {
    const base = syntheticEnv();
    expect(() => e2eEnv(without(base, 'E2E_RESTRICTED_EMAIL', 'E2E_RESTRICTED_PASSWORD'))).toThrow('E2E_RESTRICTED_EMAIL');
    expect(() => e2eEnv(without(base, 'E2E_TENANT_B_USER_EMAIL', 'E2E_TENANT_B_USER_PASSWORD'))).toThrow('E2E_TENANT_B_USER_EMAIL');
    // Solo el owner configurado: ninguna otra persona hereda sus credenciales.
    const ownerOnly = {
      VITE_API_BASE_URL: base['VITE_API_BASE_URL'] ?? '',
      E2E_TENANT_ID: base['E2E_TENANT_ID'] ?? '',
      E2E_USER_EMAIL: base['E2E_USER_EMAIL'] ?? '',
      E2E_USER_PASSWORD: base['E2E_USER_PASSWORD'] ?? '',
    };
    expect(() => e2eEnv(ownerOnly)).toThrow(/E2E_TENANT_B_ID|E2E_RESTRICTED_EMAIL/);
  });

  it('compartir correo entre personas es una configuración inválida', () => {
    const env = { ...syntheticEnv(), E2E_RESTRICTED_EMAIL: 'OWNER@example.invalid' };
    expect(invalidVariables(env).join()).toContain('E2E_RESTRICTED_EMAIL');
    expect(invalidVariables({ ...syntheticEnv(), E2E_TENANT_B_USER_EMAIL: 'owner@example.invalid' }).join()).toContain('E2E_TENANT_B_USER_EMAIL');
  });

  it('openPersona abre el contexto con el storageState de ESA persona y ninguna otra', async () => {
    const seen: Record<string, unknown>[] = [];
    const browser = {
      newContext: (options: Record<string, unknown>) => {
        seen.push(options);
        return Promise.resolve({ newPage: () => Promise.resolve({}) });
      },
    } as unknown as Browser;
    for (const persona of PERSONA_KEYS) await openPersona(browser, 'http://localhost:5173', persona);
    expect(seen.map((options) => options['storageState'])).toEqual(PERSONA_KEYS.map((persona) => STATE_FILES[persona]));
    for (const options of seen) {
      expect(options['hasTouch']).toBe(true);
      expect(options['isMobile']).toBe(true);
    }
  });

  it('el setup inicia sesión y persiste cada persona en su archivo, sin cruces', () => {
    const setup = readRepoFile('e2e/auth.setup.ts');
    const pairs: readonly [PersonaKey, PersonaKey][] = [['advisor', 'advisor'], ['restricted', 'restricted'], ['tenantB', 'tenantB']];
    for (const [loginAs, persistAs] of pairs) {
      expect(setup).toContain(`login(page, '${loginAs}')`);
      expect(setup).toContain(`persist(page, '${persistAs}')`);
    }
    expect(setup).toContain('env.credentials[persona]');
    expect(readRepoFile('e2e/support/env.ts')).not.toMatch(/credentials\.(advisor|restricted|tenantB)\s*(\?\?|\|\|)/);
    expect(readRepoFile('e2e/support/persona.ts')).toContain('STATE_FILES[persona]');
  });
});
