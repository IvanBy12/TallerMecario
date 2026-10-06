import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/repo';

const doc = readRepoFile('docs/quality/s3-mobile-e2e.md');
const spec = readRepoFile('e2e/s3-happy-path.spec.ts');

describe('estado documental del gate E2E', () => {
  it('no declara Sprint 3 aprobado tras la revisión del flujo', () => {
    expect(doc).toMatch(/\*\*Decisión: `READY_FOR_GATE`\*\*/);
    expect(doc).toMatch(/harness hardened/i);
    expect(doc).not.toMatch(/Decisión: `PASSED`/);
    expect(doc).toMatch(/Gates externos\/documentales de Sprint 3/);
  });
  it('registra los casos y retira firma/R2 sin contarlo como PASS', () => {
    const rows = doc.split('\n').filter(line => /^\|\s*(Setup|E2E-0[1-6]|Smoke escritorio)\s*\|/.test(line));
    expect(rows).toHaveLength(8);
    const removed = rows.find(row => /^\|\s*E2E-06/.test(row));
    expect(removed).toMatch(/\| RETIRADO \|$/);
    expect(spec).not.toMatch(/test\('E2E-06/);
    expect(doc).toMatch(/no convierte esa corrida fallida en PASS/);
  });
  it('conserva el límite observable del historial y la política de artefactos', () => {
    expect(doc).toMatch(/no ofrece endpoint de historial/);
    expect(doc).toMatch(/no genera `s3-signature-r2-evidence.json`/);
    expect(doc).toMatch(/trace.*,.*screenshot.*y.*video.*off/);
  });
});
