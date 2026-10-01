/**
 * Clasificación de fallas del transporte (tabla G2 de la especificación de autenticación, §3.2).
 * Se clasifica por status + `error.code`, nunca por el texto del mensaje.
 * Los códigos del selector de taller (G5) NO se clasifican aquí hasta que TA-01 congele el contrato:
 * antes de TA-01 un 400/403/409 con esos códigos se clasifica solo por status.
 */

export type ApiFailureKind =
  // identidad / token (no hubo request o el servidor rechazó la credencial)
  | 'no_session'
  | 'token_offline'
  | 'token_error'
  | 'unauthenticated'
  // denegaciones por operación
  | 'permission_denied'
  | 'action_forbidden'
  | 'forbidden_unknown'
  // recuperables
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'server_error'
  // no recuperables por el usuario
  | 'client_bug'
  | 'bad_request'
  | 'unexpected_status'
  | 'unexpected_redirect'
  | 'contract_violation'
  // silenciosa
  | 'aborted';

export interface ApiFailureBase {
  readonly requestId: string | null;
  readonly status: number | null;
  readonly code: string | null;
}

export interface DefaultApiFailure extends ApiFailureBase {
  readonly kind: Exclude<ApiFailureKind, 'rate_limited'>;
}

/** `retryAfterSeconds` solo existe en `rate_limited`. */
export interface RateLimitedApiFailure extends ApiFailureBase {
  readonly kind: 'rate_limited';
  readonly retryAfterSeconds: number | null;
}

export type ApiFailure = DefaultApiFailure | RateLimitedApiFailure;

/** Entrada de `classifyFailure`: de dónde viene la falla y qué trae consigo. */
export type FailureInput =
  | { readonly source: 'client'; readonly reason: 'client_bug' }
  | { readonly source: 'contract' }
  | { readonly source: 'redirect' }
  | { readonly source: 'transport'; readonly reason: 'network' | 'timeout' | 'aborted' }
  | { readonly source: 'token'; readonly reason: 'no_session' | 'offline' | 'error' }
  | {
      readonly source: 'http';
      readonly status: number;
      readonly code: string | null;
      readonly requestId: string | null;
      readonly retryAfterSeconds: number | null;
    };

export interface ParsedErrorEnvelope {
  readonly code: string | null;
  readonly requestId: string | null;
}

const EMPTY_ENVELOPE: ParsedErrorEnvelope = { code: null, requestId: null };

/** El backend emite códigos estables con este formato; cualquier otra cosa se trata como `null`. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,79}$/;
const MAX_REQUEST_ID_LENGTH = 64;

const PERMISSION_DENIED_CODE = 'PERMISSION_DENIED';
const ACTION_FORBIDDEN_CODES = [
  'DOMAIN_ACTION_FORBIDDEN',
  'ROLE_ASSIGNMENT_NOT_ALLOWED',
  'SELF_ROLE_MODIFICATION_FORBIDDEN',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Lee `{ error: { code, message, request_id } }` sin exponer jamás el `message`
 * (el copy lo decide el frontend) ni valores no reconocidos.
 */
export function parseErrorEnvelope(body: unknown): ParsedErrorEnvelope {
  if (!isRecord(body)) {
    return EMPTY_ENVELOPE;
  }
  const { error } = body;
  if (!isRecord(error)) {
    return EMPTY_ENVELOPE;
  }
  const rawCode = error['code'];
  const rawRequestId = error['request_id'];
  return {
    code: typeof rawCode === 'string' && CODE_PATTERN.test(rawCode) ? rawCode : null,
    requestId:
      typeof rawRequestId === 'string' && rawRequestId.length <= MAX_REQUEST_ID_LENGTH
        ? rawRequestId
        : null,
  };
}

/**
 * `Retry-After` legible (segundos no negativos). Las fechas HTTP y los valores no numéricos
 * no son legibles para este cliente y devuelven `null` (el llamador aplica 5 s fijos).
 */
export function parseRetryAfterSeconds(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const seconds = Number.parseInt(trimmed, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function httpFailureKind(status: number, code: string | null): Exclude<ApiFailureKind, 'rate_limited'> {
  if (status === 401) {
    return 'unauthenticated';
  }
  if (status === 403) {
    if (code === PERMISSION_DENIED_CODE) {
      return 'permission_denied';
    }
    return code !== null && ACTION_FORBIDDEN_CODES.includes(code)
      ? 'action_forbidden'
      : 'forbidden_unknown';
  }
  if (status === 400) {
    return 'bad_request';
  }
  if (status >= 500) {
    return 'server_error';
  }
  return 'unexpected_status';
}

export function classifyFailure(input: FailureInput): ApiFailure {
  switch (input.source) {
    case 'client':
      return { kind: 'client_bug', status: null, code: null, requestId: null };
    case 'contract':
      return { kind: 'contract_violation', status: null, code: null, requestId: null };
    case 'redirect':
      return { kind: 'unexpected_redirect', status: null, code: null, requestId: null };
    case 'transport':
      return { kind: input.reason, status: null, code: null, requestId: null };
    case 'token':
      if (input.reason === 'no_session') {
        return { kind: 'no_session', status: null, code: null, requestId: null };
      }
      return {
        kind: input.reason === 'offline' ? 'token_offline' : 'token_error',
        status: null,
        code: null,
        requestId: null,
      };
    case 'http': {
      if (input.status === 429) {
        return {
          kind: 'rate_limited',
          status: input.status,
          code: input.code,
          requestId: input.requestId,
          retryAfterSeconds: input.retryAfterSeconds,
        };
      }
      return {
        kind: httpFailureKind(input.status, input.code),
        status: input.status,
        code: input.code,
        requestId: input.requestId,
      };
    }
  }
}
