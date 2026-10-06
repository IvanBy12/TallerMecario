import { describe, expect, it } from 'vitest';

import playwrightConfig from '../../playwright.config';
import { ARTIFACT_POLICY } from '../../e2e/support/artifact-policy';
import { MOBILE_DEVICE, MOBILE_VIEWPORT_WIDTH_RANGE } from '../../e2e/support/devices';
import { mobileRuntimeProblems } from '../../e2e/support/mobile-runtime';
import { readRepoFile } from '../helpers/repo';

const mobileProject = playwrightConfig.projects?.find((project) => project.name === 'mobile-chromium');

describe('proyecto mobile-chromium (configuración)', () => {
  it('existe, depende del setup y solo ejecuta los specs s3-*', () => {
    expect(mobileProject).toBeDefined();
    expect(mobileProject?.dependencies).toEqual(['setup']);
    const match = mobileProject?.testMatch;
    expect(match).toBeInstanceOf(RegExp);
    expect((match as RegExp).test('/repo/e2e/s3-happy-path.spec.ts')).toBe(true);
    expect((match as RegExp).test('/repo/e2e/desktop-smoke.spec.ts')).toBe(false);
  });

  it('exige táctil, móvil y viewport móvil', () => {
    const use = mobileProject?.use;
    expect(use?.hasTouch).toBe(true);
    expect(use?.isMobile).toBe(true);
    const width = use?.viewport?.width ?? 0;
    const height = use?.viewport?.height ?? 0;
    expect(width).toBeGreaterThanOrEqual(MOBILE_VIEWPORT_WIDTH_RANGE.min);
    expect(width).toBeLessThanOrEqual(MOBILE_VIEWPORT_WIDTH_RANGE.max);
    expect(height).toBeGreaterThan(width);
    expect(use?.userAgent).toMatch(/Mobile/);
  });

  it('el perfil móvil no es el de escritorio ni se degrada: el proyecto de escritorio es otro y no es el gate', () => {
    const desktop = playwrightConfig.projects?.find((project) => project.name === 'desktop-smoke');
    expect(desktop?.use?.hasTouch).not.toBe(true);
    expect(mobileProject?.use?.viewport).toEqual(MOBILE_DEVICE.viewport);
    const packageJson = JSON.parse(readRepoFile('package.json')) as { scripts: Record<string, string> };
    expect(packageJson.scripts['e2e:mobile']).toBe('playwright test --project=mobile-chromium');
  });

  it('política de artefactos con credenciales: trace, screenshot y video en off (global y por proyecto)', () => {
    expect(ARTIFACT_POLICY).toEqual({ trace: 'off', screenshot: 'off', video: 'off' });
    expect(playwrightConfig.use).toMatchObject(ARTIFACT_POLICY);
    for (const project of playwrightConfig.projects ?? []) {
      expect(project.use?.trace ?? 'off', project.name).toBe('off');
      expect(project.use?.screenshot ?? 'off', project.name).toBe('off');
      expect(project.use?.video ?? 'off', project.name).toBe('off');
    }
  });

  it('un solo worker, sin reintentos (las pruebas mutan un ambiente compartido)', () => {
    expect(playwrightConfig.workers).toBe(1);
    expect(playwrightConfig.retries).toBe(0);
  });
});

describe('runtime móvil del navegador', () => {
  it('móvil táctil en rango → sin problemas', () => {
    expect(mobileRuntimeProblems({ maxTouchPoints: 5, innerWidth: 393, innerHeight: 727 })).toEqual([]);
  });

  it('maxTouchPoints = 0 → problema (sin fallback a ratón)', () => {
    expect(mobileRuntimeProblems({ maxTouchPoints: 0, innerWidth: 393, innerHeight: 727 }).join()).toContain('maxTouchPoints');
  });

  it('viewport de escritorio o de tablet → problema', () => {
    expect(mobileRuntimeProblems({ maxTouchPoints: 5, innerWidth: 1280, innerHeight: 720 }).join()).toContain('viewport');
    expect(mobileRuntimeProblems({ maxTouchPoints: 5, innerWidth: 820, innerHeight: 1180 }).join()).toContain('viewport');
    expect(mobileRuntimeProblems({ maxTouchPoints: 5, innerWidth: 200, innerHeight: 400 }).join()).toContain('viewport');
  });

  it('ambos problemas se reportan juntos', () => {
    expect(mobileRuntimeProblems({ maxTouchPoints: 0, innerWidth: 1280, innerHeight: 720 })).toHaveLength(2);
  });

  it('los specs del gate comprueban el runtime móvil y la firma no tiene rama de ratón', () => {
    for (const file of ['e2e/s3-happy-path.spec.ts', 'e2e/s3-rbac.spec.ts', 'e2e/s3-cross-tenant.spec.ts']) {
      expect(readRepoFile(file), file).toContain('assertMobileRuntime(page)');
    }
    const flow = readRepoFile('e2e/support/reception-flow.ts');
    expect(flow).not.toMatch(/page\.mouse\./);
    expect(flow).toContain('Input.dispatchTouchEvent');
    expect(readRepoFile('e2e/s3-happy-path.spec.ts')).toMatch(/hasTouch[\s\S]{0,80}toBe\(true\)/);
  });
});
