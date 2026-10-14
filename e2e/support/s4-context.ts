import type { Page } from '@playwright/test';
import { parseMe, parseMeContext, type MeResponse, type WorkshopContext } from '../../src/features/auth/me-contract';
import { probeApi, type ProbeResponse } from './api-probe';
import { S4CheckFailure, s4Check } from './s4-media-evidence';
import { verifyS4Frontend } from './s4-frontend';
import { s4Origins } from './s4-preflight';

export class S4SessionUnavailable extends S4CheckFailure {
  constructor(message: string) { super(message, 'BLOCKED'); }
}
type S4ContextPhase = 'precondition' | 'scenario';
function unavailableContext(phase: S4ContextPhase, reason: string): never {
  if (phase === 'precondition') throw new S4SessionUnavailable(`S4 BLOCKED: ${reason}`);
  throw new S4CheckFailure(`Contexto S4 revocado o perdido durante el escenario: ${reason}`, 'FAIL');
}

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
export async function resolveS4Context(page: Page, phase: S4ContextPhase = 'precondition'): Promise<WorkshopContext> {
  const response = await probeS4Me(page).catch(() => {
    // Browser fetch/CORS/token errors do not prove infrastructure outage. Health classifies known connectivity.
    throw new S4CheckFailure('No se pudo completar bootstrap S4.', 'FAIL');
  });
  if (response.status === 401) unavailableContext(phase, 'sesión Clerk no válida.');
  s4Check(response.status === 200, 'API bootstrap no disponible: HTTP incorrecto.', 'FAIL');
  const me = parseMe(response.json);
  s4Check(me !== null, 'Contrato bootstrap inválido.', 'FAIL');
  if (me.memberships.length === 0) unavailableContext(phase, 'memberships activas no verificadas.');
  // Deterministic discovery only among backend-returned memberships; no configured/historical ID.
  for (const member of [...me.memberships].sort((a, b) => a.tenantId.localeCompare(b.tenantId))) {
    const result = await probeApi(page, s4Origins().api, { method: 'GET', path: '/api/v1/me/context', tenantId: member.tenantId }).catch(() => {
      throw new S4CheckFailure('No se pudo completar consulta de contexto S4.', 'FAIL');
    });
    if (result.status === 401) unavailableContext(phase, 'sesión Clerk no válida.');
    if (result.status === 403) continue;
    s4Check(result.status === 200, 'Contexto backend devolvió HTTP incorrecto.', 'FAIL');
    const parsed = parseMeContext(result.json);
    s4Check(parsed !== null && parsed.tenantId === member.tenantId && parsed.membershipId === member.membershipId && parsed.userId === me.user?.id,
      'Contexto no coincide con identidad/membership verificadas.', 'FAIL');
    const context = usableS4Context(me, result.json);
    if (context) return context;
  }
  unavailableContext(phase, 'ninguna membership concede los permisos tenant requeridos.');
}
/** Unexpected Clerk loading faults are functional failures, not a missing test identity. */
export async function waitForS4Clerk(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const clerk = Reflect.get(window, 'Clerk') as { loaded?: boolean } | undefined;
    return clerk?.loaded === true;
  }, undefined, { timeout: 30_000 }).catch(() => { throw new S4CheckFailure('Clerk no se pudo cargar correctamente.', 'FAIL'); });
}
/** Cold start is a precondition until live context and the UI have both been confirmed. */
export class S4ScenarioSession {
  #phase: S4ContextPhase = 'precondition';
  #context: WorkshopContext | undefined;
  get phase(): S4ContextPhase { return this.#phase; }
  async open(page: Page, destination = '/panel'): Promise<WorkshopContext> {
    const context = await openS4App(page, destination, this.#phase);
    const previous = this.#context;
    s4Check(previous === undefined || (context.userId === previous.userId && context.tenantId === previous.tenantId &&
      context.membershipId === previous.membershipId), 'La identidad/taller S4 cambió durante la corrida.', 'FAIL');
    this.#context = context;
    this.#phase = 'scenario';
    return context;
  }
}
/** Let the product select the same verified context, including accounts with multiple memberships. */
export async function openS4App(page: Page, destination = '/panel', phase: S4ContextPhase = 'scenario'): Promise<WorkshopContext> {
  await verifyS4Frontend(page.request);
  await page.goto(destination);
  s4Check(new URL(page.url()).origin === s4Origins().frontend, 'S4 BLOCKED: navegación a un frontend distinto del aprobado.');
  await waitForS4Clerk(page);
  const context = await resolveS4Context(page, phase);
  const shell = page.locator('main#contenido-principal');
  const selection = page.getByRole('heading', { name: 'Selecciona un taller', exact: true });
  await shell.or(selection).first().waitFor();
  if (await selection.isVisible()) {
    const choice = page.getByRole('button', { name: context.workshop.displayName, exact: true });
    s4Check(await choice.count() === 1, 'Selección de taller incorrecta o ambigua en la UI.', 'FAIL');
    const selectedResponse = page.waitForResponse(response => new URL(response.url()).origin === s4Origins().api &&
      new URL(response.url()).pathname === '/api/v1/me/context' && response.request().headers()['x-tenant-id'] === context.tenantId);
    const [selected] = await Promise.all([selectedResponse, choice.click()]);
    const selectedBody: unknown = await selected.json().catch(() => null);
    const verified = parseMeContext(selectedBody);
    s4Check(selected.status() === 200 && verified?.tenantId === context.tenantId && verified.membershipId === context.membershipId &&
      verified.userId === context.userId, 'La UI no confirmó el taller verificado.', 'FAIL');
    await shell.waitFor();
  }
  // Observe the actual product context request, never set app storage/claims as authority.
  return context;
}
