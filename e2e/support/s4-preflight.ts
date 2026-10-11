import fs from 'node:fs';
import path from 'node:path';
import { invalidVariables, missingVariables, type EnvSource } from './env';

export const S4_FIXTURE_DIR = path.resolve('e2e/fixtures/s4');
export function s4Origins(source: EnvSource = process.env) {
  return {
    frontend: new URL(source['E2E_BASE_URL']?.trim() || 'http://localhost:5173').origin,
    api: new URL(source['VITE_API_BASE_URL'] ?? '').origin,
    storage: new URL(source['E2E_S4_R2_ORIGIN'] ?? '').origin,
  };
}
/** Static safety checks; sandbox declaration is operator evidence, never a network/DB PASS. */
export function s4PreflightProblems(source: EnvSource = process.env): readonly string[] {
  const problems = [...missingVariables(source), ...invalidVariables(source)];
  for (const name of ['E2E_S4_SANDBOX_FILE', 'E2E_S4_R2_ORIGIN']) {
    if (!source[name]?.trim()) problems.push(`${name}: ausente`);
  }
  let origins: ReturnType<typeof s4Origins>;
  try {
    origins = s4Origins(source);
    for (const name of ['E2E_BASE_URL', 'VITE_API_BASE_URL', 'E2E_S4_R2_ORIGIN']) {
      const raw = source[name]?.trim();
      if (!raw && name === 'E2E_BASE_URL') continue;
      const url = new URL(raw ?? '');
      if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
          (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
        problems.push(`${name}: debe ser un origen seguro sin path, credenciales ni query`);
      }
    }
    const storage = new URL(origins.storage);
    if (storage.protocol !== 'https:' || !storage.hostname.endsWith('.r2.cloudflarestorage.com') ||
        origins.storage === origins.api || origins.storage === origins.frontend) {
      problems.push('E2E_S4_R2_ORIGIN: se requiere un origen R2 directo independiente');
    }
  } catch {
    problems.push('Orígenes S4: configuración inválida');
    return problems;
  }
  try {
    const declaration: unknown = JSON.parse(fs.readFileSync(source['E2E_S4_SANDBOX_FILE'] ?? '', 'utf8'));
    const value = typeof declaration === 'object' && declaration !== null ? declaration : {};
    if (Reflect.get(value, 'environment') !== 'test' || Reflect.get(value, 'production') !== false ||
        Reflect.get(value, 'postgresqlFixturesValidated') !== true ||
        Reflect.get(value, 'frontendOrigin') !== origins.frontend || Reflect.get(value, 'apiOrigin') !== origins.api ||
        Reflect.get(value, 'r2Origin') !== origins.storage) {
      problems.push('E2E_S4_SANDBOX_FILE: falta declaración de ambiente/bucket de pruebas y fixtures PostgreSQL para los orígenes exactos');
    }
  } catch {
    problems.push('E2E_S4_SANDBOX_FILE: no legible o JSON inválido');
  }
  for (const [file, max] of [['photo.png', 20_971_520], ['video360.mp4', 786_432_000]] as const) {
    try {
      const size = fs.statSync(path.join(S4_FIXTURE_DIR, file)).size;
      if (size <= 0 || size > max) problems.push(`Fixture S4 ${file}: tamaño inválido`);
    } catch { problems.push(`Fixture S4 ${file}: ausente`); }
  }
  return problems;
}
export function requireS4Preflight(source: EnvSource = process.env): void {
  const problems = s4PreflightProblems(source);
  if (problems.length) throw new Error(`S4 REAL E2E: BLOCKED — preflight sin entorno válido. ${problems.join('; ')}`);
}
