import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MARKER_ENV, SYNTHETIC_MARKERS, type MarkerKey } from './markers';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CONFIG = path.join(REPO_ROOT, 'e2e-harness-tests', 'browser', 'playwright.harness.config.ts');

/** Variables de sistema que el proceso hijo necesita para encontrar Node y los navegadores. Nada de E2E_*, VITE_* ni CI. */
const PASSTHROUGH = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SystemRoot', 'LOCALAPPDATA', 'USERPROFILE', 'PLAYWRIGHT_BROWSERS_PATH'] as const;

export interface JsonTest {
  readonly title: string;
  readonly projectName: string;
  readonly status: string;
  readonly errors: readonly string[];
}

export interface PlaywrightRun {
  readonly suite: 'secure' | 'control';
  readonly outDir: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly tests: readonly JsonTest[];
}

function stripAnsi(text: string): string {
  // Secuencias de escape ANSI de los reporters (ESC = código 27).
  return text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
}

function collectTests(node: unknown, titles: readonly string[], out: JsonTest[]): void {
  if (typeof node !== 'object' || node === null) return;
  const record = node as Record<string, unknown>;
  const suites = Array.isArray(record['suites']) ? (record['suites'] as unknown[]) : [];
  const specs = Array.isArray(record['specs']) ? (record['specs'] as unknown[]) : [];
  for (const spec of specs) {
    const specRecord = spec as { title: string; tests?: { projectName: string; results: { status: string; errors?: { message?: string }[] }[] }[] };
    for (const test of specRecord.tests ?? []) {
      const last = test.results.at(-1);
      out.push({
        title: specRecord.title,
        projectName: test.projectName,
        status: last?.status ?? 'missing',
        errors: (last?.errors ?? []).map((error) => stripAnsi(error.message ?? '')),
      });
    }
  }
  for (const suite of suites) collectTests(suite, titles, out);
}

/**
 * Lanza el suite sintético de Playwright en un proceso hijo con un entorno LIMPIO (solo lo imprescindible + marcadores
 * sintéticos) y salidas en el directorio temporal del sistema operativo.
 */
export function runSyntheticPlaywright(suite: 'secure' | 'control'): PlaywrightRun {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `tm-e2e-harness-${suite}-`));
  const env: Record<string, string> = {
    HARNESS_OUT_DIR: outDir,
    HARNESS_SUITE: suite,
    FORCE_COLOR: '0',
  };
  // El valor de cada marcador es su propio texto (AUDIT_SYNTHETIC_*): así se reconoce tal cual si se filtra.
  for (const key of Object.keys(SYNTHETIC_MARKERS) as MarkerKey[]) env[MARKER_ENV[key]] = SYNTHETIC_MARKERS[key];
  for (const name of PASSTHROUGH) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [cli, 'test', '--config', CONFIG], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 270_000,
  });
  const tests: JsonTest[] = [];
  const reportPath = path.join(outDir, 'report.json');
  if (fs.existsSync(reportPath)) {
    collectTests(JSON.parse(fs.readFileSync(reportPath, 'utf8')) as unknown, [], tests);
  }
  return { suite, outDir, exitCode: result.status, stdout: result.stdout, stderr: result.stderr, tests };
}
