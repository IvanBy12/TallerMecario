import fs from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ALL_MARKERS, SYNTHETIC_MARKERS } from '../helpers/markers';
import { runSyntheticPlaywright, type PlaywrightRun } from '../helpers/run-playwright';
import { logicalContents, scanForMarkers, walkFiles } from '../helpers/scan';

/**
 * F1 + F4 + mobile en navegador real, sin credenciales: Playwright (Chromium) contra un formulario local que imita a Clerk.
 * Requiere Chromium instalado (`npx playwright install chromium`); si falta, el test FALLA (no se omite en silencio).
 */

let secure: PlaywrightRun;
let control: PlaywrightRun;
const ranOutDirs: string[] = [];

beforeAll(() => {
  secure = runSyntheticPlaywright('secure');
  control = runSyntheticPlaywright('control');
  ranOutDirs.push(secure.outDir, control.outDir);
}, 600_000);

afterAll(() => {
  // Artefactos desechables del harness (directorio temporal del sistema operativo). HARNESS_KEEP_OUT=1 los conserva para depurar.
  if (process.env['HARNESS_KEEP_OUT'] !== undefined) return;
  for (const outDir of ranOutDirs) fs.rmSync(outDir, { recursive: true, force: true });
});

const FORCED = '[forced-failure]';

describe('suite sintético con navegador (secure)', () => {
  it('se ejecutó de verdad: hay reportes y tests', () => {
    expect(secure.tests.length).toBeGreaterThanOrEqual(10);
    for (const file of ['report.json', 'junit.xml', path.join('html-report', 'index.html')]) {
      expect(fs.existsSync(path.join(secure.outDir, file)), `falta ${file}`).toBe(true);
    }
  });

  it('todo pasa salvo los 3 fallos forzados, que sí fallan', () => {
    const unexpected = secure.tests
      .filter((test) => (test.title.startsWith(FORCED) ? test.status !== 'failed' : test.status !== 'passed'))
      .map((test) => `${test.projectName} › ${test.title}: ${test.status}`);
    expect(unexpected).toEqual([]);
    expect(secure.tests.filter((test) => test.title.startsWith(FORCED))).toHaveLength(3);
  });

  it('los fallos forzados llevan un mensaje sanitizado y fijo', () => {
    const byTitle = (needle: string) => secure.tests.find((test) => test.title.includes(needle));
    const joined = (needle: string) => (byTitle(needle)?.errors ?? []).join('\n');
    expect(joined('contraseña rechazada')).toContain('Clerk rechazó el inicio de sesión');
    expect(joined('excepción durante la introducción')).toContain('la página lanzó una excepción al recibir el valor');
    expect(joined('timeout esperando el campo')).toMatch(/paso «contraseña» \(TimeoutError\)\. Detalle omitido/);
    for (const test of secure.tests.filter((item) => item.title.startsWith(FORCED))) {
      expect(test.errors.join('\n'), 'el error no debe incluir el call log del locator').not.toMatch(/Call log|waiting for/);
    }
  });

  it('NINGÚN canal persistible contiene los marcadores sintéticos (stdout, stderr, JSON, JUnit, HTML con su zip, adjuntos)', () => {
    const hits = scanForMarkers(secure.outDir, ALL_MARKERS, { stdout: secure.stdout, stderr: secure.stderr });
    expect(hits).toEqual([]);
  });

  it('el HTML report es analizable: su zip embebido se descomprime y contiene el reporte', () => {
    const html = fs.readFileSync(path.join(secure.outDir, 'html-report', 'index.html'));
    const embedded = logicalContents(html).filter((content) => content.label.startsWith('embedded-zip:'));
    expect(embedded.length, 'el escáner debe poder ver DENTRO del HTML report').toBeGreaterThan(0);
    const names = embedded.map((content) => content.label);
    expect(names.some((name) => name.endsWith('report.json'))).toBe(true);
  });

  it('política de artefactos: sin trace, capturas ni vídeo', () => {
    const files = walkFiles(secure.outDir).map((file) => path.relative(secure.outDir, file));
    expect(files.filter((file) => /\.(zip|png|jpe?g|webm|mp4|trace|network)$/i.test(file) && !file.startsWith('html-report'))).toEqual([]);
    expect(files.filter((file) => /trace|screenshot/i.test(path.basename(file)))).toEqual([]);
  });
});

describe('control positivo del escáner (control)', () => {
  it('el suite inseguro con fill() FALLA y el escáner SÍ encuentra el marcador en el reporte', () => {
    expect(control.tests.map((test) => test.status)).toEqual(['failed']);
    const hits = scanForMarkers(control.outDir, [SYNTHETIC_MARKERS.password]);
    expect(hits.length, 'si esto es 0, el escáner es ciego y el resultado «sin filtraciones» no vale').toBeGreaterThan(0);
    expect(hits.some((hit) => hit.where.includes('html-report')), 'el HTML guarda los datos comprimidos: se detecta dentro de su zip').toBe(true);
  });
});
