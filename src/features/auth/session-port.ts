import type { TokenResult } from '@/shared/api/http-client';

import type { IdentityKey } from './workshop-context';

export type SessionSnapshot =
  | { readonly status: 'loading' }
  | { readonly status: 'signed_out' }
  | { readonly status: 'signed_in'; readonly identity: IdentityKey };

/** Puerta al proveedor de identidad. El resto del código no importa Clerk (D-A04). */
export interface AuthSessionPort {
  readonly snapshot: SessionSnapshot;
  /** Nunca lanza: traduce cualquier fallo a `TokenResult`. */
  getToken(options?: { readonly skipCache?: boolean }): Promise<TokenResult>;
  /** Puede rechazar → el proveedor lo trata como T6b. */
  signOut(): Promise<void>;
}
