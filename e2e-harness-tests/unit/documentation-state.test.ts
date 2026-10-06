import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/repo';

const doc = readRepoFile('docs/quality/s3-mobile-e2e.md');
const spec = readRepoFile('e2e/s3-happy-path.spec.ts');

describe('estado documental del gate E2E', () => {
  it('sustenta el cierre formal en evidencia integrada y distingue su alcance', () => {
    expect(doc).toMatch(/\*\*Decisión: `PASSED`\*\*/);
    expect(doc).toMatch(/harness hardened/i);
    expect(doc).toContain('3b3425a2e1b42b5c7da35e268c9886e78813e3fc');
    expect(doc).toContain('2368716a00c37be887fa5c326d31f59a56d40a21');
    expect(doc).toContain('37397287326');
    expect(doc).toContain('37396527416');
    expect(doc).toMatch(/## Matriz A/);
    expect(doc).toMatch(/## Matriz B/);
    expect(doc).toMatch(/## DECISIÓN FINAL/);
    expect(doc).toContain('Media/R2 general no fue eliminado');
    expect(doc).toMatch(/Offline\/sync completo es `NOT_APPLICABLE`/);
    expect(doc).toMatch(/NO commit y NO push/);
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
