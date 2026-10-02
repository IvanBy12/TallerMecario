/** Grants efectivos del contexto; los roles no conceden acceso en el cliente. */
export type EffectivePermissions = readonly {
  readonly code: string;
  readonly scopes: readonly string[];
}[];

export function can(permissions: EffectivePermissions, code: string, tenant = false) {
  return permissions.some((grant) => grant.code === code && (!tenant || grant.scopes.includes('tenant')));
}
