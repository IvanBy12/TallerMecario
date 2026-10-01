// Canonical backend contract: docs/api/me-and-workshop-context.md (2026-10-01).
export type ResourceScope = 'tenant' | 'assigned' | 'quality_control';
export interface WorkshopContext {
  readonly tenantId: string;
  readonly membershipId: string;
  readonly userId: string;
  readonly workshop: { readonly displayName: string; readonly timezone: string; readonly currency: string };
  readonly roles: readonly ('owner' | 'admin' | 'service_advisor' | 'technician')[];
  readonly permissions: readonly { readonly code: string; readonly scopes: readonly ResourceScope[] }[];
}
export interface MeResponse {
  readonly user: { readonly id: string } | null;
  readonly memberships: readonly { readonly membershipId: string; readonly tenantId: string }[];
  readonly tenantSelection: { readonly mode: 'unavailable' | 'automatic' | 'required'; readonly tenantId: string | null };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isCanonicalId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
    && value !== '00000000-0000-0000-0000-000000000000' && value !== 'ffffffff-ffff-ffff-ffff-ffffffffffff';
}
export function parseMe(body: unknown): MeResponse | null {
  if (!record(body) || !Array.isArray(body['memberships']) || !record(body['tenantSelection'])) return null;
  const memberships: { membershipId: string; tenantId: string }[] = [];
  for (const member of body['memberships']) {
    if (!record(member) || !isCanonicalId(member['membershipId']) || !isCanonicalId(member['tenantId'])) return null;
    if (memberships.some((item) => item.tenantId === member['tenantId'])) return null;
    memberships.push({ membershipId: member['membershipId'], tenantId: member['tenantId'] });
  }
  const selection = body['tenantSelection'];
  if (memberships.length === 0) {
    return body['user'] === null && selection['mode'] === 'unavailable' && selection['tenantId'] === null
      ? { user: null, memberships, tenantSelection: { mode: 'unavailable', tenantId: null } } : null;
  }
  const user = body['user'];
  if (!record(user) || !isCanonicalId(user['id'])) return null;
  const first = memberships[0];
  if (memberships.length === 1 && first !== undefined && selection['mode'] === 'automatic' && selection['tenantId'] === first.tenantId) {
    return { user: { id: user['id'] }, memberships, tenantSelection: { mode: 'automatic', tenantId: first.tenantId } };
  }
  return memberships.length >= 2 && selection['mode'] === 'required' && selection['tenantId'] === null
    ? { user: { id: user['id'] }, memberships, tenantSelection: { mode: 'required', tenantId: null } } : null;
}
const ROLE_CODES = ['owner', 'admin', 'service_advisor', 'technician'] as const;
export function parseMeContext(body: unknown): WorkshopContext | null {
  if (!record(body) || !record(body['context'])) return null;
  const ctx = body['context'];
  const workshop = ctx['workshop'];
  if (!isCanonicalId(ctx['tenantId']) || !isCanonicalId(ctx['membershipId']) || !isCanonicalId(ctx['userId']) || !record(workshop)) return null;
  if (typeof workshop['displayName'] !== 'string' || workshop['displayName'].length > 160 || typeof workshop['timezone'] !== 'string'
    || typeof workshop['currency'] !== 'string' || !/^[A-Z]{3}$/.test(workshop['currency'])) return null;
  const roles: WorkshopContext['roles'][number][] = [];
  if (!Array.isArray(ctx['roles'])) return null;
  for (const role of ctx['roles']) {
    const known = ROLE_CODES.find((code) => code === role);
    if (known === undefined || roles.includes(known)) return null;
    roles.push(known);
  }
  if (!Array.isArray(ctx['permissions'])) return null;
  const permissions: { code: string; scopes: ResourceScope[] }[] = [];
  for (const permission of ctx['permissions']) {
    if (!record(permission) || typeof permission['code'] !== 'string' || permission['code'].length === 0 || !Array.isArray(permission['scopes'])) return null;
    const scopes: ResourceScope[] = [];
    const rawScopes: readonly unknown[] = permission['scopes'];
    for (const scope of rawScopes) {
      if (scope !== 'tenant' && scope !== 'assigned' && scope !== 'quality_control') return null;
      if (scopes.includes(scope)) return null;
      scopes.push(scope);
    }
    if (scopes.length === 0 || (scopes.includes('tenant') && scopes.length !== 1)
      || (scopes.length === 2 && scopes[0] !== 'assigned') || permissions.some((item) => item.code === permission['code'])) return null;
    permissions.push({ code: permission['code'], scopes });
  }
  return { tenantId: ctx['tenantId'], membershipId: ctx['membershipId'], userId: ctx['userId'],
    workshop: { displayName: workshop['displayName'], timezone: workshop['timezone'], currency: workshop['currency'] }, roles, permissions };
}
