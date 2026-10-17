import type { APIRequestContext } from '@playwright/test';
import { field } from './api-probe';
import { S4CheckFailure, s4Check } from './s4-media-evidence';

/** Only connectivity failures from the health GET are infrastructure failures. Never inspect/log HTTP bodies. */
export function isS4ConnectivityError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code: unknown = Reflect.get(error, 'code');
  const codes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH'];
  return (typeof code === 'string' && codes.includes(code)) ||
    /\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNRESET|ENETUNREACH|EHOSTUNREACH)\b|\bconnection timed out\b|\bTimeout \d+ms exceeded\b/i.test(error.message);
}
export async function requireS4ApiReady(request: Pick<APIRequestContext, 'get'>, origin: string): Promise<void> {
  for (const endpoint of ['/health/live', '/health/ready']) {
    const response = await request.get(`${origin}${endpoint}`, { timeout: 10_000 }).catch((error: unknown) => {
      if (isS4ConnectivityError(error)) throw new S4CheckFailure('S4 BLOCKED: API de pruebas no alcanzable.');
      throw error;
    });
    const status = response.status();
    s4Check(status !== 401, 'Health/readiness: autenticación rechazada (HTTP 401).');
    s4Check(status !== 403, 'Health/readiness: acceso/permiso rechazado (HTTP 403).');
    s4Check(status === 200, 'Health/readiness API devolvió HTTP incorrecto.');
    if (endpoint.endsWith('/ready')) {
      const body: unknown = await response.json().catch(() => null);
      s4Check(typeof body === 'object' && body !== null && Reflect.get(body, 'status') === 'ready' &&
        field(body, 'checks', 'database') === true, 'Health/readiness API devolvió contrato inválido.');
    }
  }
}
