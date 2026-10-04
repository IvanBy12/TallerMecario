import { describe, expect, it } from 'vitest';

import { readRepoFile } from '../helpers/repo';

const doc = readRepoFile('docs/quality/s3-mobile-e2e.md');

describe('estado documental del gate E2E', () => {
  it('sigue en READY_FOR_GATE: el entorno real está pendiente', () => {
    expect(doc).toMatch(/\*\*Decisión: `READY_FOR_GATE`\*\*/);
    expect(doc).toMatch(/harness hardened/i);
    expect(doc).toMatch(/real environment pending/i);
    expect(doc).not.toMatch(/Decisión: `PASSED`/);
  });

  it('ninguno de los 6 casos reales (ni setup ni smoke) figura como PASS', () => {
    const rows = doc.split('\n').filter((line) => /^\|\s*(Setup|E2E-0[1-6]|Smoke escritorio)\s*\|/.test(line));
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row, row.slice(0, 40)).toMatch(/\|\s*NOT_RUN/);
      expect(row, row.slice(0, 40)).not.toMatch(/\|\s*PASS\s*\|/);
    }
  });

  it('no declara una corrida real ejecutada', () => {
    expect(doc).toMatch(/Corrida real contra infraestructura \| \*\*NO EJECUTADA\*\*/);
    expect(doc).toMatch(/Ambiente de la corrida \| _pendiente_/);
  });
});
