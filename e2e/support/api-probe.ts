import type { Page } from '@playwright/test';

/**
 * Petición REAL al backend con la sesión Clerk viva de la página. El token se obtiene y se usa dentro del navegador
 * (`window.Clerk.session.getToken()`); nunca sale hacia el runner, los logs ni los reportes. Solo se devuelve estado,
 * código de error estable y el JSON de respuesta (sin cabeceras).
 *
 * Solo se usa con endpoints ya publicados en docs/api/reception-contract.md y me-and-workshop-context.md.
 */

export interface ProbeRequest {
  readonly method: 'GET' | 'POST' | 'PATCH';
  readonly path: string;
  readonly tenantId: string;
  readonly body?: Readonly<Record<string, unknown>>;
}

export interface ProbeResponse {
  readonly status: number;
  /** `error.code` del envelope estable, o null. */
  readonly code: string | null;
  readonly json: unknown;
}

interface ProbeArgs extends ProbeRequest {
  readonly apiOrigin: string;
}

export async function waitForClerkSession(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const clerk = Reflect.get(window, 'Clerk') as { session?: unknown } | undefined;
    return clerk?.session !== undefined && clerk.session !== null;
  }, undefined, { timeout: 60_000 });
}

export async function probeApi(page: Page, apiOrigin: string, request: ProbeRequest): Promise<ProbeResponse> {
  await waitForClerkSession(page);
  const args: ProbeArgs = { ...request, apiOrigin };
  return page.evaluate(async ({ apiOrigin: origin, method, path, tenantId, body }: ProbeArgs) => {
    const clerk = Reflect.get(window, 'Clerk') as { session?: { getToken(): Promise<string | null> } | null } | undefined;
    const token = await clerk?.session?.getToken();
    if (token === undefined || token === null) {
      throw new Error('La página no tiene sesión de Clerk.');
    }
    const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'x-tenant-id': tenantId };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(`${origin}${path}`, {
      method,
      headers,
      credentials: 'omit',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json: unknown = await response.json().catch(() => null);
    let code: string | null = null;
    if (typeof json === 'object' && json !== null) {
      const error: unknown = Reflect.get(json, 'error');
      if (typeof error === 'object' && error !== null) {
        const value: unknown = Reflect.get(error, 'code');
        code = typeof value === 'string' ? value : null;
      }
    }
    return { status: response.status, code, json };
  }, args);
}

export function field(value: unknown, ...keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = Reflect.get(current, key);
  }
  return current;
}
