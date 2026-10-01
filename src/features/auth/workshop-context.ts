import type { ApiFailure, ApiFailureKind } from '@/shared/api/api-failure';
import type { ApiResult, TokenPolicy } from '@/shared/api/http-client';
import type { PublicEnvIssue } from '@/shared/config/public-env';

import type { WorkshopContext } from './me-contract';

export type IdentityKey = string; // userId:sessionId de Clerk, solo en memoria

export type ContextNotice = 'workshop_access_revoked' | 'workshop_changed';

export type RecoverableReason =
  | 'offline' // ClerkOfflineError
  | 'network' // fetch rechazó
  | 'timeout'
  | 'rate_limited'
  | 'server_error'
  | 'identity_client_error'; // cualquier otra excepción de getToken(): causa desconocida, NO se afirma red

export interface DegradedInfo {
  readonly reason: RecoverableReason;
  readonly requestId: string | null;
  /** Epoch ms antes del cual *Reintentar* está deshabilitado; `null` = sin espera. Solo `rate_limited` lo fija. */
  readonly retryNotBefore: number | null;
}

export interface MembershipRef {
  readonly displayName?: string;
  readonly tenantId: string;
  readonly membershipId: string;
}

export type AuthState =
  | { readonly kind: 'config_error'; readonly issues: readonly PublicEnvIssue[] | 'missing_auth_config' }
  | { readonly kind: 'loading_identity' }
  | { readonly kind: 'signed_out' }
  | { readonly kind: 'signed_in_context_pending'; readonly identity: IdentityKey } // sin contextSource (G5 ausente)
  | {
      readonly kind: 'loading_context';
      readonly tenantId?: string;
      readonly identity: IdentityKey;
      readonly notice: ContextNotice | null;
    } // G5
  | { readonly kind: 'no_access'; readonly reason?: 'permission_denied'; readonly requestId?: string | null; readonly identity: IdentityKey; readonly notice: ContextNotice | null } // G5
  | {
      readonly kind: 'workshop_selection_required';
      readonly identity: IdentityKey;
      readonly memberships: readonly MembershipRef[];
      readonly notice: ContextNotice | null;
    } // G5
  | {
      readonly kind: 'ready';
      readonly context?: WorkshopContext;
      readonly identity: IdentityKey;
      readonly tenantId: string;
      readonly membershipId: string;
      readonly notice: ContextNotice | null;
      readonly degraded: DegradedInfo | null;
    } // G5; sin permisos: TA-02
  | { readonly kind: 'session_expired' } // Clerk terminó la sesión
  | { readonly kind: 'auth_rejected'; readonly identity: IdentityKey; readonly requestId: string | null } // 401 persistente
  | {
      readonly kind: 'recoverable_error';
      readonly identity: IdentityKey;
      readonly reason: RecoverableReason;
      readonly requestId: string | null;
      readonly retryNotBefore: number | null;
    }
  | {
      readonly kind: 'fatal_error';
      readonly identity: IdentityKey;
      readonly reason: 'contract_violation' | 'client_bug';
      readonly requestId: string | null;
    };

export type ConfigErrorState = Extract<AuthState, { kind: 'config_error' }>;
export type ReadyState = Extract<AuthState, { kind: 'ready' }>;
type NoticeBearingState = Extract<AuthState, { notice: ContextNotice | null }>;

/**
 * Estado del reducer. `generation` y `attempt` son contadores, no contexto de taller.
 *
 * `generation` protege el cambio de sesión/taller: una acción de una generación anterior se
 * descarta entera.
 *
 * `attempt` es la identidad del **intento de carga** vigente y es independiente de `generation`:
 * protege las revalidaciones concurrentes dentro de la misma generación. Sin él, dos cargas de la
 * misma generación comparten identificador y una respuesta antigua puede llegar después y
 * sobrescribir un contexto más reciente (incluidos permisos ya revocados). `0` significa que
 * todavía no se ha registrado ningún intento.
 */
export interface AuthStore {
  readonly generation: number;
  readonly attempt: number;
  readonly auth: AuthState;
}

/** Entrada de dominio INTERNA del reducer (no es un DTO ni copia nombres del backend). */
export type WorkshopContextSnapshot =
  | { readonly kind: 'none' }
  | { readonly kind: 'single'; readonly membership: MembershipRef; readonly context?: WorkshopContext }
  | { readonly kind: 'multiple'; readonly memberships: readonly MembershipRef[] };

/** Una invocación de la fuente. `scope.signal` cubre la espera de getToken() Y el fetch. */
export interface ContextLoadAttempt {
  readonly scope: ContextScope;
  readonly tokenPolicy: TokenPolicy;
}

/** Puerto de G5. Hasta TA-01 no existe implementación concreta (solo dobles de prueba). */
export interface WorkshopContextSource {
  load(attempt: ContextLoadAttempt): Promise<ApiResult<WorkshopContextSnapshot>>;
}

export interface ContextScope {
  readonly generation: number; // entero que solo crece
  readonly identity: IdentityKey | null;
  readonly tenantId: string | null;
  readonly signal: AbortSignal; // controlador propio de esta generación
}

export type SessionChange =
  | { readonly status: 'loading' }
  | { readonly status: 'signed_out' }
  | { readonly status: 'signed_in'; readonly identity: IdentityKey };

export type AuthAction =
  | { readonly type: 'session_changed'; readonly session: SessionChange }
  | { readonly type: 'sign_out_requested' }
  | {
      readonly type: 'sign_out_failed';
      readonly generation: number;
      readonly identity: IdentityKey;
      readonly failure: ApiFailure;
      readonly at: number;
    }
  | {
      /**
       * Anuncia el inicio de un intento de carga. `attempt` es estrictamente mayor que el vigente e
       * invalida lógicamente cualquier intento anterior de la misma generación.
       */
      readonly type: 'context_load_started';
      readonly generation: number;
      readonly attempt: number;
    }
  | {
      readonly type: 'context_loaded';
      readonly generation: number;
      readonly attempt: number;
      readonly snapshot: WorkshopContextSnapshot;
    }
  | {
      readonly type: 'context_failed';
      readonly generation: number;
      readonly attempt: number;
      readonly failure: ApiFailure;
      readonly at: number;
    }
  | { readonly type: 'access_lost'; readonly generation?: number; readonly attempt?: number }
  | { readonly type: 'change_workshop' }
  | { readonly type: 'tenant_selected'; readonly tenantId: string }
  | { readonly type: 'retry_requested'; readonly at: number }
  | { readonly type: 'notice_dismissed' };

export type AuthReducer = (store: AuthStore, action: AuthAction) => AuthStore;

const RECOVERABLE_FAILURE_KINDS: readonly ApiFailureKind[] = [
  'token_offline',
  'token_error',
  'network',
  'timeout',
  'rate_limited',
  'server_error',
];

const RATE_LIMIT_MAX_WAIT_SECONDS = 120;
const RATE_LIMIT_FALLBACK_SECONDS = 5;

export function identityOf(auth: AuthState): IdentityKey | null {
  return 'identity' in auth ? auth.identity : null;
}

function noticeOf(auth: AuthState): ContextNotice | null {
  return 'notice' in auth ? auth.notice : null;
}

/** Epoch ms antes del cual *Reintentar* está deshabilitado (`null` = sin espera). */
export function retryNotBeforeOf(auth: AuthState): number | null {
  if (auth.kind === 'recoverable_error') {
    return auth.retryNotBefore;
  }
  if (auth.kind === 'ready') {
    return auth.degraded === null ? null : auth.degraded.retryNotBefore;
  }
  return null;
}

/** Misma regla para `ready.degraded` y `recoverable_error`; la usan el reducer y el proveedor. */
export function retryAllowed(auth: AuthState, at: number): boolean {
  const retryNotBefore = retryNotBeforeOf(auth);
  return retryNotBefore === null || at >= retryNotBefore;
}

function cut(store: AuthStore, auth: AuthState): AuthStore {
  return { ...store, generation: store.generation + 1, auth };
}

function keepGeneration(store: AuthStore, auth: AuthState): AuthStore {
  return { ...store, auth };
}

function pendingState(
  hasContextSource: boolean,
  identity: IdentityKey,
  notice: ContextNotice | null,
): AuthState {
  return hasContextSource
    ? { kind: 'loading_context', identity, notice }
    : { kind: 'signed_in_context_pending', identity };
}

function readyWith(
  auth: ReadyState,
  patch: {
    readonly tenantId?: string;
    readonly membershipId?: string;
    readonly notice?: ContextNotice | null;
    readonly degraded?: DegradedInfo | null;
    readonly context?: WorkshopContext;
  },
): AuthState {
  return {
    kind: 'ready',
    context: patch.context ?? auth.context,
    identity: auth.identity,
    tenantId: patch.tenantId ?? auth.tenantId,
    membershipId: patch.membershipId ?? auth.membershipId,
    notice: patch.notice === undefined ? auth.notice : patch.notice,
    degraded: patch.degraded === undefined ? auth.degraded : patch.degraded,
  };
}

function withNotice(auth: NoticeBearingState, notice: ContextNotice | null): AuthState {
  switch (auth.kind) {
    case 'loading_context':
      return { kind: 'loading_context', identity: auth.identity, notice };
    case 'no_access':
      return { kind: 'no_access', identity: auth.identity, notice };
    case 'workshop_selection_required':
      return {
        kind: 'workshop_selection_required',
        identity: auth.identity,
        memberships: auth.memberships,
        notice,
      };
    case 'ready':
      return readyWith(auth, { notice });
  }
}

function recoverableReason(kind: ApiFailureKind): RecoverableReason {
  switch (kind) {
    case 'token_offline':
      return 'offline';
    case 'network':
      return 'network';
    case 'timeout':
      return 'timeout';
    case 'rate_limited':
      return 'rate_limited';
    case 'server_error':
      return 'server_error';
    default:
      return 'identity_client_error';
  }
}

function fatalReason(kind: ApiFailureKind): 'contract_violation' | 'client_bug' {
  return kind === 'client_bug' || kind === 'bad_request' ? 'client_bug' : 'contract_violation';
}

/** Solo `rate_limited` fija espera: `Retry-After` con tope de 120 s, o 5 s fijos. */
function retryNotBeforeFrom(failure: ApiFailure, at: number): number | null {
  if (failure.kind !== 'rate_limited') {
    return null;
  }
  const seconds =
    failure.retryAfterSeconds === null || !(failure.retryAfterSeconds >= 0)
      ? RATE_LIMIT_FALLBACK_SECONDS
      : Math.min(failure.retryAfterSeconds, RATE_LIMIT_MAX_WAIT_SECONDS);
  return at + 1000 * seconds;
}

function applyContextLoaded(store: AuthStore, snapshot: WorkshopContextSnapshot): AuthStore {
  const { auth } = store;

  if (auth.kind === 'loading_context') {
    const { identity, notice } = auth;
    switch (snapshot.kind) {
      case 'none':
        return keepGeneration(store, { kind: 'no_access', identity, notice });
      case 'single':
        return keepGeneration(store, {
          kind: 'ready',
          context: snapshot.context,
          identity,
          tenantId: snapshot.membership.tenantId,
          membershipId: snapshot.membership.membershipId,
          notice,
          degraded: null,
        });
      case 'multiple':
        return keepGeneration(store, {
          kind: 'workshop_selection_required',
          identity,
          memberships: snapshot.memberships,
          notice,
        });
    }
  }

  if (auth.kind === 'ready') {
    const activeTenantId = auth.tenantId;
    const activeMembershipId = auth.membershipId;
    switch (snapshot.kind) {
      case 'single': {
        const { membership } = snapshot;
        if (membership.tenantId === activeTenantId && membership.membershipId === activeMembershipId) {
          return keepGeneration(store, readyWith(auth, { degraded: null, context: snapshot.context })); // T7b
        }
        if (membership.tenantId !== activeTenantId) {
          return cut(
            store,
            readyWith(auth, {
              context: snapshot.context,
              tenantId: membership.tenantId,
              membershipId: membership.membershipId,
              notice: 'workshop_changed',
              degraded: null,
            }),
          ); // T7d
        }
        return cut(
          store,
          readyWith(auth, {
            context: snapshot.context,
            membershipId: membership.membershipId,
            notice: null,
            degraded: null,
          }),
        ); // T7e
      }
      case 'multiple': {
        const containsActive = snapshot.memberships.some(
          (membership) =>
            membership.tenantId === activeTenantId &&
            membership.membershipId === activeMembershipId,
        );
        if (containsActive) {
          return keepGeneration(store, readyWith(auth, { degraded: null })); // T7c
        }
        return cut(store, {
          kind: 'workshop_selection_required',
          identity: auth.identity,
          memberships: snapshot.memberships,
          notice: 'workshop_access_revoked',
        }); // T7f
      }
      case 'none':
        return cut(store, {
          kind: 'no_access',
          identity: auth.identity,
          notice: 'workshop_access_revoked',
        }); // T7g
    }
  }

  return store;
}

function applyContextFailed(store: AuthStore, failure: ApiFailure, at: number): AuthStore {
  const { auth } = store;
  const identity = identityOf(auth);

  if (failure.kind === 'aborted') {
    return store; // T13
  }
  if (identity === null) {
    return store;
  }
  if (failure.kind === 'permission_denied') {
    return cut(store, { kind: 'no_access', identity, notice: null, reason: 'permission_denied', requestId: failure.requestId });
  }
  if (failure.kind === 'no_session') {
    return cut(store, { kind: 'session_expired' }); // T10
  }
  if (failure.kind === 'unauthenticated') {
    return cut(store, { kind: 'auth_rejected', identity, requestId: failure.requestId }); // T11
  }
  if (RECOVERABLE_FAILURE_KINDS.includes(failure.kind)) {
    const reason = recoverableReason(failure.kind);
    const retryNotBefore = retryNotBeforeFrom(failure, at);
    if (auth.kind === 'ready') {
      return keepGeneration(
        store,
        readyWith(auth, { degraded: { reason, requestId: failure.requestId, retryNotBefore } }),
      ); // T8
    }
    return keepGeneration(store, {
      kind: 'recoverable_error',
      identity,
      reason,
      requestId: failure.requestId,
      retryNotBefore,
    }); // T9
  }
  return cut(store, {
    kind: 'fatal_error',
    identity,
    reason: fatalReason(failure.kind),
    requestId: failure.requestId,
  }); // T12
}

function applyTenantSelected(store: AuthStore, tenantId: string): AuthStore {
  const { auth } = store;
  if (auth.kind !== 'workshop_selection_required') {
    return store;
  }
  const selected = auth.memberships.find((membership) => membership.tenantId === tenantId);
  if (selected === undefined) {
    return store;
  }
  return cut(store, {
    kind: 'loading_context',
    identity: auth.identity,
    tenantId: selected.tenantId,
    notice: null,
  }); // T16
}

function applyRetryRequested(store: AuthStore, at: number, hasContextSource: boolean): AuthStore {
  const { auth } = store;

  if (auth.kind === 'ready') {
    // T18: sin cambio de estado ni de generación; el proveedor revalida (o no) según `retryAllowed`.
    return store;
  }
  if (auth.kind !== 'recoverable_error' && auth.kind !== 'no_access' && auth.kind !== 'auth_rejected') {
    return store;
  }
  if (!retryAllowed(auth, at)) {
    return store;
  }
  return cut(store, pendingState(hasContextSource, auth.identity, null)); // T17
}

/** Acciones que aplica `reduce`; el inicio de un intento se resuelve antes, en `createAuthReducer`. */
type ApplicableAction = Exclude<AuthAction, { readonly type: 'context_load_started' }>;

function reduce(store: AuthStore, action: ApplicableAction, hasContextSource: boolean): AuthStore {
  const { auth } = store;

  switch (action.type) {
    case 'session_changed': {
      const { session } = action;
      if (session.status === 'loading') {
        return identityOf(auth) === null ? keepGeneration(store, { kind: 'loading_identity' }) : store; // T5
      }
      if (session.status === 'signed_out') {
        if (identityOf(auth) !== null) {
          return cut(store, { kind: 'session_expired' }); // T3
        }
        return auth.kind === 'config_error' ? store : keepGeneration(store, { kind: 'signed_out' }); // T4
      }
      if (identityOf(auth) === session.identity) {
        return store; // T2
      }
      return cut(store, pendingState(hasContextSource, session.identity, null)); // T1
    }
    case 'sign_out_requested': {
      if (identityOf(auth) === null) {
        return store;
      }
      return cut(store, { kind: 'signed_out' }); // T6
    }
    case 'sign_out_failed': {
      return keepGeneration(store, {
        kind: 'recoverable_error',
        identity: action.identity,
        reason: recoverableReason(action.failure.kind),
        requestId: action.failure.requestId,
        retryNotBefore: retryNotBeforeFrom(action.failure, action.at),
      }); // T6b
    }
    case 'context_loaded':
      return applyContextLoaded(store, action.snapshot); // T7a-T7g
    case 'context_failed':
      return applyContextFailed(store, action.failure, action.at); // T8-T13
    case 'access_lost': {
      const identity = identityOf(auth);
      if (identity === null) {
        return store;
      }
      if (noticeOf(auth) === 'workshop_access_revoked') {
        return cut(store, { kind: 'no_access', identity, notice: 'workshop_access_revoked' }); // T15
      }
      return cut(store, pendingState(hasContextSource, identity, 'workshop_access_revoked')); // T14
    }
    case 'change_workshop': {
      const identity = identityOf(auth);
      return identity === null ? store : cut(store, pendingState(hasContextSource, identity, null));
    }
    case 'tenant_selected':
      return applyTenantSelected(store, action.tenantId); // T16
    case 'retry_requested':
      return applyRetryRequested(store, action.at, hasContextSource); // T17/T18
    case 'notice_dismissed': {
      if (!('notice' in auth) || auth.notice === null) {
        return store;
      }
      return keepGeneration(store, withNotice(auth, null)); // T19
    }
  }
}

/**
 * Respuesta tardía: pertenece a un intento anterior al vigente dentro de la misma generación.
 * `access_lost` sin `attempt` es el evento de fuente que ya existía y no se compara.
 */
function isLateResponse(store: AuthStore, action: ApplicableAction): boolean {
  return 'attempt' in action && action.attempt !== undefined && action.attempt < store.attempt;
}

export function createAuthReducer(options: {
  readonly hasContextSource: boolean;
}): AuthReducer {
  const hasContextSource = options.hasContextSource;
  return (store, action) => {
    // Capa 1 — generation: descarta por completo lo que pertenece a una sesión/taller anteriores.
    if ('generation' in action && action.generation !== store.generation) {
      return store; // acción obsoleta: mismo objeto
    }
    // Capa 2 — attempt: dentro de la misma generación, solo el intento vigente puede hacer commit.
    if (action.type === 'context_load_started') {
      // Un intento nuevo (o repetido) nunca reabre uno anterior ya invalidado.
      return action.attempt <= store.attempt ? store : { ...store, attempt: action.attempt };
    }
    if (isLateResponse(store, action)) {
      return store; // se ignora en silencio: ni éxito, ni error, ni aviso
    }
    const next = reduce(store, action, hasContextSource);
    if (next === store || !('attempt' in action) || action.attempt === undefined) {
      return next;
    }
    return { ...next, attempt: action.attempt };
  };
}

/**
 * Un único reintento cuando el servidor responde 401: misma operación y **mismo** `scope`,
 * con token fresco en el segundo intento y como máximo dos invocaciones de `run`.
 */
export async function withSingleFreshRetry<T>(
  scope: ContextScope,
  run: (attempt: ContextLoadAttempt) => Promise<ApiResult<T>>,
): Promise<ApiResult<T>> {
  const first = await run({ scope, tokenPolicy: 'cached' });
  if (first.ok || first.failure.kind !== 'unauthenticated' || scope.signal.aborted) {
    return first;
  }
  return run({ scope, tokenPolicy: 'fresh' });
}
