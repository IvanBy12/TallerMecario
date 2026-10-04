import fs from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from './run-playwright';

export function readRepoFile(relative: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

/** Contenido sin comentarios de línea (`# …`) para analizar YAML sin que un comentario dispare falsos positivos. */
export function withoutYamlComments(yaml: string): string {
  return yaml
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, ''))
    .join('\n');
}
