import {
  classifyFailure,
  parseErrorEnvelope,
  parseRetryAfterSeconds,
  type ApiFailure,
} from './api-failure';

export type TokenPolicy = 'cached' | 'fresh'; // 'fresh' ⇒ getToken({ skipCache: true })

/** Resultado de pedir el token. Nunca se usa una excepción para el flujo normal. */
export type TokenResult =
  | { readonly kind: 'token'; readonly token: string }
  | { readonly kind: 'no_session' } // Clerk: sin sesión (getToken → null)
  | { readonly kind: 'offline' } // ClerkOfflineError
  | { readonly kind: 'error' }; // cualquier otra excepción (causa desconocida)

/** Respuesta mínima que el cliente necesita. `Response` es asignable a esta forma. */
export interface FetchResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly type: string;
  readonly redirected: boolean;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<FetchResponse>;

export interface ApiClientDeps {
  readonly apiOrigin: string; // PublicEnv.apiOrigin (ya normalizado: esquema + host + puerto, ruta "/")
  /** Del puerto. Sin caché propia. Si lanza, el cliente lo trata como { kind: 'error' }. */
  readonly getToken: (options?: { readonly skipCache?: boolean }) => Promise<TokenResult>;
  readonly fetchImpl?: FetchLike; // inyectable para pruebas locales
  readonly timeoutMs?: number; // por defecto 10_000; cubre getToken() + fetch + lectura del cuerpo
}

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject { readonly [key: string]: JsonValue }
export type QueryParams = Readonly<Record<string, string | number | boolean | undefined>>;

export interface GetRequest {
  readonly query?: QueryParams;
  readonly path: string; // lista blanca estricta (abajo); sin query ni fragmento
  readonly tenantId?: string; // UUID canónico en minúsculas; se envía como X-Tenant-Id (uso real: G5)
  readonly signal: AbortSignal; // obligatorio: cancelación por contexto
  readonly tokenPolicy: TokenPolicy; // explícito en cada request; lo decide el proveedor
}

export interface JsonRequest extends Omit<GetRequest, 'query'> {
  readonly body: JsonObject;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

export interface ApiClient {
  getJson: <T>(request: GetRequest, parse: (body: unknown) => T | null) => Promise<ApiResult<T>>;
  postJson: <T>(request: JsonRequest, parse: (body: unknown) => T | null) => Promise<ApiResult<T>>;
  patchJson: <T>(request: JsonRequest, parse: (body: unknown) => T | null) => Promise<ApiResult<T>>;
}

/** Solo segmentos de letras, dígitos, `_` y `-`: excluye `.`/`..`, `%`, `\`, `?`, `#`, espacios y `//`. */
const PATH_PATTERN = /^\/api\/v1\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;
const TENANT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_PATH_LENGTH = 512;
const DEFAULT_TIMEOUT_MS = 10_000;

const ABORTED = Symbol('aborted');

interface ResolvedTarget {
  readonly url: string;
  readonly tenantId: string | null;
}

interface AbortControl {
  readonly controller: AbortController;
  readonly timedOut: boolean;
  dispose(): void;
}

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch: FetchLike = deps.fetchImpl ?? fetch;

  async function send<T>(method: 'GET' | 'POST' | 'PATCH', request: GetRequest, parse: (body: unknown) => T | null, jsonRequest?: JsonRequest): Promise<ApiResult<T>> {
      // 1-3: validación de la petición (antes de pedir token y antes de red).
      const target = resolveTarget(deps.apiOrigin, request);
      const bodyJson = jsonRequest === undefined ? undefined : serializeJsonObject(jsonRequest.body);
      if (target === null || bodyJson === null || (method !== 'GET' && request.query !== undefined)) {
        return failure<T>({ source: 'client', reason: 'client_bug' });
      }

      // 2: señal ya abortada ⇒ sin getToken y sin fetch.
      if (request.signal.aborted) {
        return failure<T>({ source: 'transport', reason: 'aborted' });
      }

      const control = createAbortControl(request.signal, timeoutMs);
      try {
        // 4: token con carrera contra la cancelación/tiempo límite.
        const tokenOutcome = await Promise.race([
          readToken(deps.getToken, request.tokenPolicy),
          waitForAbort(control.controller.signal),
        ]);

        // 5: comprobación tras el await, antes de fetch.
        if (tokenOutcome === ABORTED || control.controller.signal.aborted) {
          return failure<T>(abortInput(control));
        }
        if (tokenOutcome.kind !== 'token') {
          return failure<T>({ source: 'token', reason: tokenOutcome.kind });
        }

        // 6: Transporte acotado. POST/PATCH se envían una sola vez.
        let response: FetchResponse;
        try {
          response = await doFetch(target.url, {
            method,
            headers: buildHeaders(tokenOutcome.token, target.tenantId, method !== 'GET'),
            ...(bodyJson === undefined ? {} : { body: bodyJson }),
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'manual',
            signal: control.controller.signal,
          });
        } catch {
          return failure<T>(
            isAborted(control.controller.signal)
              ? abortInput(control)
              : { source: 'transport', reason: 'network' },
          );
        }

        // 8: redirecciones nunca se siguen (tampoco se reenvía el token).
        if (isRedirect(response)) {
          return failure<T>({ source: 'redirect' });
        }

        // 9: cuerpo bajo la misma señal; el envelope se lee sin exponer `message`.
        const body = await readJsonBody(response);

        // 10: el resultado se descarta si la operación ya fue cancelada.
        if (isAborted(control.controller.signal)) {
          return failure<T>(abortInput(control));
        }

        if (!response.ok) {
          const envelope = parseErrorEnvelope(body);
          return failure<T>({
            source: 'http',
            status: response.status,
            code: envelope.code,
            requestId: envelope.requestId,
            retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')),
          });
        }

        const data = parse(body);
        return data === null ? failure<T>({ source: 'contract' }) : { ok: true, data };
      } finally {
        control.dispose();
      }
  }
  return {
    getJson: (request, parse) => send('GET', request, parse),
    postJson: (request, parse) => send('POST', request, parse, request),
    patchJson: (request, parse) => send('PATCH', request, parse, request),
  };
}

function failure<T>(input: Parameters<typeof classifyFailure>[0]): ApiResult<T> {
  return { ok: false, failure: classifyFailure(input) };
}

function abortInput(control: AbortControl): {
  source: 'transport';
  reason: 'timeout' | 'aborted';
} {
  return {
    source: 'transport',
    reason: control.timedOut ? 'timeout' : 'aborted',
  };
}

function buildHeaders(token: string, tenantId: string | null, json: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (json) headers['Content-Type'] = 'application/json';
  if (tenantId !== null) {
    headers['X-Tenant-Id'] = tenantId;
  }
  return headers;
}

function isRedirect(response: FetchResponse): boolean {
  return (
    response.type === 'opaqueredirect' ||
    response.redirected ||
    (response.status >= 300 && response.status < 400)
  );
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted;
}

async function readJsonBody(response: FetchResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function readToken(
  getToken: ApiClientDeps['getToken'],
  policy: TokenPolicy,
): Promise<TokenResult> {
  try {
    return await getToken(policy === 'fresh' ? { skipCache: true } : undefined);
  } catch {
    return { kind: 'error' };
  }
}

function waitForAbort(signal: AbortSignal): Promise<typeof ABORTED> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(ABORTED);
      return;
    }
    signal.addEventListener('abort', () => { resolve(ABORTED); }, { once: true });
  });
}

function createAbortControl(external: AbortSignal, timeoutMs: number): AbortControl {
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = (): void => {
    controller.abort();
  };
  if (external.aborted) {
    controller.abort();
  } else {
    external.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    controller,
    get timedOut(): boolean {
      return timedOut;
    },
    dispose(): void {
      clearTimeout(timer);
      external.removeEventListener('abort', onExternalAbort);
    },
  };
}

/** Validación de la petición y de la URL final (defensa en profundidad sobre la lista blanca). */
function resolveTarget(apiOrigin: string, request: GetRequest): ResolvedTarget | null {
  const { path, tenantId } = request;
  if (path.length === 0 || path.length > MAX_PATH_LENGTH || !PATH_PATTERN.test(path)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(path, apiOrigin);
  } catch {
    return null;
  }
  if (url.origin !== apiOrigin) {
    return null;
  }
  if (url.pathname !== path || !url.pathname.startsWith('/api/v1/')) {
    return null;
  }
  if (url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
    return null;
  }
  if (tenantId !== undefined && (!TENANT_ID_PATTERN.test(tenantId) || tenantId === '00000000-0000-0000-0000-000000000000' || tenantId === 'ffffffff-ffff-ffff-ffff-ffffffffffff')) {
    return null;
  }
  if (request.query !== undefined) {
    if (!isPlainObject(request.query)) return null;
    const entries = Object.entries(request.query);
    if (entries.length > 32) return null;
    for (const [key, value] of entries) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) return null;
      if (value === undefined) continue;
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
      if (typeof value === 'number' && !Number.isFinite(value)) return null;
      const text = String(value);
      if (text.length > 2000 || Array.from(text).some((char) => { const code = char.charCodeAt(0); return code <= 31 || (code >= 127 && code <= 159); })) return null;
      url.searchParams.set(key, text);
    }
  }
  return { url: url.toString(), tenantId: tenantId ?? null };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Reject values JSON.stringify would silently omit, coerce or evaluate. */
function serializeJsonObject(body: unknown): string | null {
  const ancestors = new Set<object>();
  const validate = (value: unknown, depth: number): boolean => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (depth > 64 || typeof value !== 'object' || ancestors.has(value)) return false;
    if (!Array.isArray(value) && !isPlainObject(value)) return false;
    ancestors.add(value);
    const keys = Reflect.ownKeys(value);
    const valid = keys.every((key) => {
      if (Array.isArray(value) && key === 'length') return true;
      if (typeof key !== 'string') return false;
      if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && descriptor.enumerable === true &&
        'value' in descriptor && validate(descriptor.value, depth + 1);
    }) && (!Array.isArray(value) || keys.length === value.length + 1);
    ancestors.delete(value);
    return valid;
  };
  try {
    return isPlainObject(body) && validate(body, 0) ? JSON.stringify(body) : null;
  } catch {
    return null;
  }
}




