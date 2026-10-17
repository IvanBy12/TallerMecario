import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/** S4-only public env loader. Never forward arbitrary backend variables to Vite. Existing process wins. */
export function loadS4PublicEnv(source: NodeJS.ProcessEnv = process.env): void {
  const explicit = source['E2E_S4_PUBLIC_ENV_FILE']?.trim();
  const file = explicit || path.resolve('.env');
  if (!explicit && !fs.existsSync(file)) return;
  try {
    const values = parseEnv(fs.readFileSync(file, 'utf8'));
    for (const name of ['VITE_APP_ENV', 'VITE_API_BASE_URL', 'VITE_CLERK_PUBLISHABLE_KEY']) {
      if (source[name] === undefined && values[name] !== undefined) source[name] = values[name];
    }
  } catch { throw new Error('S4 REAL E2E: BLOCKED — E2E_S4_PUBLIC_ENV_FILE no legible.'); }
}
