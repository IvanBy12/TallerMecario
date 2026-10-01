import { classifyFailure } from '@/shared/api/api-failure';
import type { ApiClient, ApiResult } from '@/shared/api/http-client';
import { parseMe, parseMeContext } from './me-contract';
import type { ContextLoadAttempt, MembershipRef, WorkshopContextSnapshot, WorkshopContextSource } from './workshop-context';

export function createMeContextSource(client: ApiClient): WorkshopContextSource {
  return { async load({ scope, tokenPolicy }: ContextLoadAttempt): Promise<ApiResult<WorkshopContextSnapshot>> {
    const request = { signal: scope.signal, tokenPolicy };
    const me = await client.getJson({ ...request, path: '/api/v1/me' }, parseMe);
    if (!me.ok) return me;
    if (me.data.tenantSelection.mode === 'unavailable') return { ok: true, data: { kind: 'none' } };
    const load = async (member: MembershipRef) => {
      const result = await client.getJson({ ...request, path: '/api/v1/me/context', tenantId: member.tenantId }, parseMeContext);
      if (result.ok && (result.data.tenantId !== member.tenantId || result.data.membershipId !== member.membershipId || result.data.userId !== me.data.user?.id)) {
        return { ok: false, failure: classifyFailure({ source: 'contract' }) } as const;
      }
      return result;
    };
    const tenantId = scope.tenantId ?? me.data.tenantSelection.tenantId;
    if (tenantId !== null) {
      const member = me.data.memberships.find((item) => item.tenantId === tenantId);
      if (member !== undefined) {
        const context = await load(member);
        return context.ok ? { ok: true, data: { kind: 'single', membership: member, context: context.data } } : context;
      }
      // Explicit selection never falls back to another tenant.
      return { ok: false, failure: classifyFailure({ source: 'http', status: 403, code: 'TENANT_ACCESS_DENIED', requestId: null, retryAfterSeconds: null }) };
    }
    const memberships: MembershipRef[] = [];
    // Sequential discovery respects rate limiting; retain only names/IDs, never candidate contexts.
    for (const member of me.data.memberships) {
      const result = await load(member);
      if (!result.ok) {
        if (result.failure.kind === 'tenant_access_denied' || result.failure.kind === 'permission_denied') continue;
        return result;
      }
      memberships.push({ ...member, displayName: result.data.workshop.displayName });
    }
    return { ok: true, data: memberships.length === 0 ? { kind: 'none' } : { kind: 'multiple', memberships } };
  } };
}
