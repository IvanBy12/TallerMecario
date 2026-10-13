import type { Page } from '@playwright/test';
import { parseMe, parseMeContext, type MeResponse, type WorkshopContext } from '../../src/features/auth/me-contract';
import { probeApi, type ProbeResponse } from './api-probe';
import { S4CheckFailure, s4Check } from './s4-media-evidence';
import { verifyS4Frontend } from './s4-frontend';
import { s4Origins } from './s4-preflight';

export class S4SessionUnavailable extends S4CheckFailure {}

export const S4_PERMISSIONS = [
  'workshop.read', 'media.upload', 'media.read', 'receptions.read', 'receptions.create',
  'customers.read', 'customers.create', 'vehicles.read', 'vehicles.create', 'vehicle_owners.manage',
  'privacy_consents.read', 'privacy_consents.capture',
] as const;
export function usableS4Context(me: MeResponse, body: unknown): WorkshopContext | null {
  const context = parseMeContext(body);
  if (!context || context.userId !== me.user?.id || !me.memberships.some(member =>
    member.tenantId === context.tenantId && member.membershipId === context.membershipId)) return null;
  return S4_PERMISSIONS.every(code => context.permissions.some(grant =>
    grant.code === code && grant.scopes.includes('tenant'))) ? context : null;
}
/** Identity-only bootstrap. Token stays inside the browser; no invented tenant header. */
export async function probeS4Me(page: Page): Promise<ProbeResponse> {
  return page.evaluate(async origin => {
    const clerk = Reflect.get(window, 'Clerk') as { session?: { status: string; getToken(): Promise<string | null> } } | undefined;
    if (clerk?.session?.status !== 'active') return { status: 401, code: null, json: null };
    const token = await clerk.session.getToken();
    if (!token) return { status: 401, code: null, json: null };
    const response = await fetch(`${origin}/api/v1/me`, {
      headers: { authorization: `Bearer ${token}` }, credentials: 'omit', cache: 'no-store',
    });
    return { status: response.status, code: null, json: await response.json().catch(() => null) as unknown };
  }, s4Origins().api);
}
export async function resolveS4Context(page: Page): Promise<WorkshopContext> {
  const response = await probeS4Me(page);
  if (response.status === 401) throw new S4SessionUnavailable('S4 BLOCKED: sesión Clerk no válida.');
  s4Check(response.status === 200, 'S4 BLOCKED: API bootstrap no disponible.');
  const me = parseMe(response.json);
  s4Check(me !== null, 'S4 BLOCKED: contrato bootstrap inválido.');
  if (me.memberships.length === 0) throw new S4SessionUnavailable('S4 BLOCKED: memberships activas no verificadas.');
  // Deterministic discovery only among backend-returned memberships; no configured/historical ID.
  for (const member of [...me.memberships].sort((a, b) => a.tenantId.localeCompare(b.tenantId))) {
    const result = await probeApi(page, s4Origins().api, { method: 'GET', path: '/api/v1/me/context', tenantId: member.tenantId });
    if (result.status === 403) continue;
    s4Check(result.status === 200, 'S4 BLOCKED: contexto backend no disponible.');
    const parsed = parseMeContext(result.json);
    s4Check(parsed !== null && parsed.tenantId === member.tenantId && parsed.membershipId === member.membershipId && parsed.userId === me.user?.id,
      'S4 BLOCKED: contexto no coincide con identidad/membership verificadas.');
    const context = usableS4Context(me, result.json);
    if (context) return context;
  }
  throw new S4SessionUnavailable('S4 BLOCKED: ninguna membership concede los permisos tenant requeridos.');
}
/** Let the product select the same verified context, including accounts with multiple memberships. */
export async function openS4App(page: Page, destination = '/panel'): Promise<WorkshopContext> {
  await verifyS4Frontend(page.request);
  await page.goto(destination);
  s4Check(new URL(page.url()).origin === s4Origins().frontend, 'S4 BLOCKED: navegación a un frontend distinto del aprobado.');
  await page.waitForFunction(() => {
    const clerk = Reflect.get(window, 'Clerk') as { loaded?: boolean } | undefined;
    return clerk?.loaded === true;
  });
  const context = await resolveS4Context(page);
  const shell = page.locator('main#contenido-principal');
  const selection = page.getByRole('heading', { name: 'Selecciona un taller', exact: true });
  await shell.or(selection).first().waitFor();
  if (await selection.isVisible()) {
    const choice = page.getByRole('button', { name: context.workshop.displayName, exact: true });
    s4Check(await choice.count() === 1, 'S4 BLOCKED: selección de taller ambigua en la UI.');
    const selectedResponse = page.waitForResponse(response => new URL(response.url()).origin === s4Origins().api &&
      new URL(response.url()).pathname === '/api/v1/me/context' && response.request().headers()['x-tenant-id'] === context.tenantId);
    await choice.click();
    const selected = await selectedResponse;
    const selectedBody: unknown = await selected.json();
    const verified = parseMeContext(selectedBody);
    s4Check(selected.status() === 200 && verified?.tenantId === context.tenantId && verified.membershipId === context.membershipId &&
      verified.userId === context.userId, 'S4 BLOCKED: la UI no confirmó el taller verificado.');
    await shell.waitFor();
  }
  // Observe the actual product context request, never set app storage/claims as authority.
  return context;
}
