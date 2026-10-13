import type { APIRequestContext } from '@playwright/test';
import ts from 'typescript';
import type { EnvSource } from './env';
import { S4CheckFailure, s4Check } from './s4-media-evidence';
import { s4Origins } from './s4-preflight';

/** Inspect Vite's effective public env assignment, not comments or an operator's expected process env. */
export function matchesS4Frontend(module: string, source: EnvSource): boolean {
  const ast = ts.createSourceFile('main.js', module, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const assignments = ast.statements.filter(ts.isExpressionStatement).map(node => node.expression)
    .filter(ts.isBinaryExpression).filter(node => node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) && node.left.name.text === 'env' &&
      ts.isMetaProperty(node.left.expression) && node.left.expression.keywordToken === ts.SyntaxKind.ImportKeyword);
  if (assignments.length !== 1 || !assignments[0]) return false;
  try {
    const env: unknown = JSON.parse(assignments[0].right.getText(ast));
    if (typeof env !== 'object' || env === null) return false;
    const expectedEnv = source['VITE_APP_ENV']?.trim().toLowerCase() || 'local';
    const actualEnv: unknown = Reflect.get(env, 'VITE_APP_ENV');
    if (actualEnv !== undefined && typeof actualEnv !== 'string') return false;
    return Reflect.get(env, 'PROD') === false &&
      (typeof actualEnv === 'string' ? actualEnv.trim().toLowerCase() || 'local' : 'local') === expectedEnv &&
      Reflect.get(env, 'VITE_API_BASE_URL') === source['VITE_API_BASE_URL'] &&
      Reflect.get(env, 'VITE_CLERK_PUBLISHABLE_KEY') === source['VITE_CLERK_PUBLISHABLE_KEY'];
  } catch { return false; }
}
/** Read-only before login/mutations. Uninspectable external builds fail closed; no new product endpoint. */
export async function verifyS4Frontend(request: Pick<APIRequestContext, 'get'>, source: EnvSource = process.env): Promise<void> {
  const response = await request.get(`${s4Origins(source).frontend}/src/main.tsx`, { timeout: 10_000 }).catch(() => {
    throw new S4CheckFailure('S4 BLOCKED: frontend de pruebas no verificable.');
  });
  s4Check(new URL(response.url()).origin === s4Origins(source).frontend && response.status() === 200 && matchesS4Frontend(await response.text(), source),
    'S4 BLOCKED: frontend cargado no coincide con entorno/API/Clerk aprobados o no expone módulo Vite verificable.');
}
