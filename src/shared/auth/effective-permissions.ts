/** Grants efectivos del contexto; los roles no conceden acceso en el cliente. */
export type EffectivePermissions = readonly {
  readonly code: string;
  readonly scopes: readonly string[];
}[];

export function can(permissions: EffectivePermissions, code: string, tenant = false) {
  return permissions.some((grant) => grant.code === code && (!tenant || grant.scopes.includes('tenant')));
}

/** Codes and scopes are sets: ordering, duplicate grants and object identity have no authority. */
export function normalizePermissions(permissions: EffectivePermissions): EffectivePermissions {
  const scopesByCode = new Map<string, Set<string>>();
  for (const grant of permissions) {
    const scopes = scopesByCode.get(grant.code) ?? new Set<string>();
    for (const scope of grant.scopes) scopes.add(scope);
    scopesByCode.set(grant.code, scopes);
  }
  return [...scopesByCode.keys()].sort().map(code => ({
    code, scopes: [...(scopesByCode.get(code) ?? [])].sort(),
  }));
}
