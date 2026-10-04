import { describe, expect, it } from 'vitest';

import { readRepoFile, withoutYamlComments } from '../helpers/repo';

const e2eWorkflow = readRepoFile('.github/workflows/e2e-mobile.yml');
const e2eActive = withoutYamlComments(e2eWorkflow);
const ciActive = withoutYamlComments(readRepoFile('.github/workflows/frontend-ci.yml'));

/** Líneas `run:` (una línea) y bloques `run: |` de un workflow, ya sin comentarios. */
function runCommands(yaml: string): readonly string[] {
  const lines = yaml.split('\n');
  const commands: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const inline = /^\s*(?:-\s+)?run:\s*(\S.*)$/.exec(line);
    if (inline?.[1] !== undefined && !/^[|>][+-]?$/.test(inline[1])) {
      commands.push(inline[1]);
      continue;
    }
    if (/^\s*(?:-\s+)?run:\s*[|>][+-]?\s*$/.test(line)) {
      const indent = (/^\s*/.exec(lines[index + 1] ?? '') ?? [''])[0].length;
      const block: string[] = [];
      for (let next = index + 1; next < lines.length; next += 1) {
        const candidate = lines[next] ?? '';
        if (candidate.trim() !== '' && (/^\s*/.exec(candidate) ?? [''])[0].length < indent) break;
        block.push(candidate);
      }
      commands.push(block.join('\n'));
    }
  }
  return commands;
}

describe('workflow e2e-mobile.yml (gate real, manual)', () => {
  it('se dispara SOLO con workflow_dispatch', () => {
    const onBlock = /^on:\s*\n((?:[ \t]+.*\n|\n)+)/m.exec(e2eActive)?.[1] ?? '';
    expect(onBlock).toMatch(/^\s+workflow_dispatch:/m);
    expect(onBlock).not.toMatch(/\b(push|pull_request|pull_request_target|schedule|workflow_run|workflow_call|issue_comment)\s*:/);
  });

  it('ejecuta realmente npm run e2e:mobile, sin tuberías que enmascaren el código de salida', () => {
    const commands = runCommands(e2eActive);
    const gate = commands.filter((command) => /\be2e:mobile\b/.test(command));
    expect(gate).toEqual(['npm run e2e:mobile']);
    for (const command of gate) expect(command).not.toMatch(/[|;&]|\|\||&&/);
  });

  it('no enmascara fallos: sin continue-on-error ni "|| true" ni "|| :" ni "set +e"', () => {
    expect(e2eActive).not.toMatch(/continue-on-error/);
    for (const command of runCommands(e2eActive)) {
      expect(command).not.toMatch(/\|\|\s*(true|:|exit\s+0)/);
      expect(command).not.toMatch(/set\s+\+e/);
    }
    expect(e2eActive).not.toMatch(/\bfail-fast:\s*false/);
  });

  it('el paso del gate no tiene condición que lo omita y precede al resumen', () => {
    const gateIndex = e2eActive.indexOf('run: npm run e2e:mobile');
    const stepStart = e2eActive.lastIndexOf('- name:', gateIndex);
    expect(e2eActive.slice(stepStart, gateIndex)).not.toMatch(/\bif:/);
    expect(e2eActive.indexOf('Job summary')).toBeGreaterThan(gateIndex);
  });

  it('no imprime secretos: sin set -x, env/printenv, echo de secrets ni DEBUG', () => {
    expect(e2eActive).not.toMatch(/set\s+-[a-z]*x/);
    expect(e2eActive).not.toMatch(/ACTIONS_STEP_DEBUG|ACTIONS_RUNNER_DEBUG|\bDEBUG\s*:|PWDEBUG|DEBUG=pw/);
    for (const command of runCommands(e2eActive)) {
      expect(command).not.toMatch(/(^|[\s;&|])(env|printenv|export\s+-p|declare\s+-x|set)\s*($|[|;&\n])/m);
      expect(command).not.toMatch(/\$\{\{\s*secrets\./);
      expect(command).not.toMatch(/E2E_[A-Z_]*(PASSWORD|CODE|EMAIL|SENTINEL)/);
    }
  });

  it('los secrets solo se inyectan como variables de entorno del job, nunca dentro de comandos', () => {
    const references = [...e2eActive.matchAll(/\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/g)];
    expect(references.length).toBeGreaterThan(0);
    for (const match of references) {
      const lineStart = e2eActive.lastIndexOf('\n', match.index) + 1;
      expect(e2eActive.slice(lineStart, match.index)).toMatch(/^\s+E2E_[A-Z0-9_]+:\s*$/);
    }
  });

  it('NO sube el reporte HTML ni ningún artefacto de una corrida autenticada', () => {
    expect(e2eActive).not.toMatch(/upload-artifact|actions\/cache|playwright-report|show-report/);
    expect(e2eActive).not.toMatch(/\bcat\b[^\n]*(test-results|playwright-report|\.auth)(?!\/\*\/s3-signature)/);
  });

  it('el resumen del job solo lee la evidencia sanitizada de firma', () => {
    const summary = runCommands(e2eActive).find((command) => command.includes('GITHUB_STEP_SUMMARY')) ?? '';
    expect(summary).toContain('s3-signature-r2-evidence.json');
    expect(summary.match(/\bcat\b/g)?.length ?? 0).toBe(1);
  });

  it('usa un Environment con permisos mínimos y sin permisos de escritura', () => {
    expect(e2eActive).toMatch(/environment:\s*e2e-mobile/);
    expect(e2eActive).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(e2eActive).not.toMatch(/permissions:[\s\S]*?:\s*write/);
  });
});

describe('workflow frontend-ci.yml (PR normal, sin secretos)', () => {
  it('corre en pull_request y ejecuta typecheck → lint → test → test:e2e:harness → build en ese orden', () => {
    expect(ciActive).toMatch(/\bpull_request:/);
    const commands = runCommands(ciActive).filter((command) => command.startsWith('npm'));
    const order = ['npm run typecheck', 'npm run lint', 'npm test', 'npm run test:e2e:harness', 'npm run build'];
    const positions = order.map((command) => commands.indexOf(command));
    expect(positions.every((position) => position >= 0), `faltan pasos: ${JSON.stringify(positions)}`).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('instala Chromium antes de las pruebas del harness', () => {
    const commands = runCommands(ciActive);
    const install = commands.findIndex((command) => /playwright install[^\n]*chromium/.test(command));
    const harness = commands.indexOf('npm run test:e2e:harness');
    expect(install).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(harness);
  });

  it('no depende de Clerk/R2/secretos ni ejecuta el E2E real', () => {
    expect(ciActive).not.toMatch(/secrets\.E2E_|environment:|E2E_[A-Z_]+:|VITE_CLERK/);
    expect(ciActive).not.toMatch(/e2e:mobile|npm run e2e\b|playwright test/);
    expect(ciActive).not.toMatch(/continue-on-error/);
  });
});

describe('scripts de package.json', () => {
  const scripts = (JSON.parse(readRepoFile('package.json')) as { scripts: Record<string, string> }).scripts;

  it('test:e2e:harness existe, no usa el E2E real y es independiente de npm test', () => {
    expect(scripts['test:e2e:harness']).toBe('vitest run --config e2e-harness-tests/vitest.config.ts');
    expect(scripts['test']).toBe('vitest run');
  });
});
