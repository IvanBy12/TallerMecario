import { afterEach, describe, expect, it, vi } from 'vitest';

import { newRunId, PLATE_FORMAT, plateForRun } from '../../e2e/support/env';
import { runFixture } from '../../e2e/support/reception-flow';
import { readRepoFile } from '../helpers/repo';

afterEach(() => {
  vi.useRealTimers();
});

describe('F5 · fixtures únicos por corrida', () => {
  it('run A → placa A, run B → placa B (distintas)', () => {
    const a = runFixture(newRunId());
    const b = runFixture(newRunId());
    expect(a.plate).not.toBe(b.plate);
    expect(a.firstName).not.toBe(b.firstName);
    expect(a.runId).not.toBe(b.runId);
  });

  it('las placas cumplen el formato canónico del backend ^[A-Z0-9]{1,16}$ y llevan el prefijo E2E', () => {
    for (let index = 0; index < 500; index += 1) {
      const { plate } = runFixture(newRunId());
      expect(plate).toMatch(PLATE_FORMAT);
      expect(plate.length).toBeLessThanOrEqual(16);
      expect(plate.startsWith('E2E')).toBe(true);
    }
  });

  it('sin colisión obvia: 20 000 ids consecutivos son únicos', () => {
    const ids = new Set(Array.from({ length: 20_000 }, () => newRunId()));
    expect(ids.size).toBe(20_000);
  });

  it('sin colisión aunque el reloj no avance (misma marca de tiempo)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const ids = new Set(Array.from({ length: 5_000 }, () => newRunId()));
    expect(ids.size).toBe(5_000);
  });

  it('el id mezcla reloj y entropía: dos instantes distintos dan prefijos de reloj distintos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const first = newRunId();
    vi.setSystemTime(new Date('2030-01-01T00:00:05.000Z'));
    const second = newRunId();
    expect(first.slice(0, 6)).not.toBe(second.slice(0, 6));
    expect(first).toMatch(/^[0-9A-Z]{10}$/);
  });

  it('plateForRun rechaza un runId que produciría una placa inválida', () => {
    expect(() => plateForRun('abc-123')).toThrow(/formato canónico/);
    expect(() => plateForRun('A'.repeat(14))).toThrow(/formato canónico/);
    expect(plateForRun('K3J9Z0QWER')).toBe('E2EK3J9Z0QWER');
  });

  it('runFixture no acepta una placa fija: la firma es solo (runId)', () => {
    expect(runFixture.length).toBe(1);
  });

  it('ningún spec ni helper de la suite lee una placa fija del entorno', () => {
    for (const file of ['e2e/s3-happy-path.spec.ts', 'e2e/s3-rbac.spec.ts', 'e2e/s3-cross-tenant.spec.ts', 'e2e/desktop-smoke.spec.ts', 'e2e/support/reception-flow.ts', 'e2e/auth.setup.ts']) {
      const source = readRepoFile(file);
      expect(source, file).not.toMatch(/vehiclePlate|E2E_VEHICLE_PLATE/);
    }
  });

  it('cada test que crea una recepción abierta pide su propio runId', () => {
    for (const file of ['e2e/s3-happy-path.spec.ts', 'e2e/s3-rbac.spec.ts']) {
      expect(readRepoFile(file), file).toMatch(/runFixture\(newRunId\(\)\)/);
    }
  });

  it('la variable de placa fija ya no figura en el ejemplo de entorno ni se documenta como configuración válida', () => {
    const example = readRepoFile('.env.e2e.example');
    expect(example).not.toMatch(/^E2E_VEHICLE_PLATE=/m);
    expect(readRepoFile('docs/quality/s3-mobile-e2e.md')).not.toMatch(/\|\s*`E2E_VEHICLE_PLATE`\s*\(opcional\)/);
  });
});
