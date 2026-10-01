import { describe, expect, it } from 'vitest';

import type {
  ApiResult,
  FetchResponse,
  GetRequest,
  TokenResult,
} from '@/shared/api/http-client';
import { createApiClient } from '@/shared/api/http-client';

const API_ORIGIN = 'https://api.example.test';
const ACCEPTED_PATH = '/api/v1/prueba/abc-123_x';
const VALID_TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

type TokenRequestOptions = { readonly skipCache?: boolean } | undefined;

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

interface ResponseInitLike {
  readonly status?: number;
  readonly type?: string;
  readonly redirected?: boolean;
  readonly headers?: Readonly<Record<string, string>>;
}

interface Harness {
  readonly client: ReturnType<typeof createApiClient>;
  readonly fetchCalls: FetchCall[];
  readonly tokenCalls: TokenRequestOptions[];
  readonly tokenResolvers: ((value: TokenResult) => void)[];
}

interface HarnessOptions {
  readonly responses?: readonly FetchResponse[];
  readonly tokenResults?: readonly TokenResult[];
  readonly pendingToken?: boolean;
  readonly pendingFetch?: boolean;
  readonly pendingBody?: boolean;
  readonly timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseId(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  const { id } = body;
  return typeof id === 'string' ? id : null;
}

function jsonBody(body: unknown): () => Promise<unknown> {
  return () => Promise.resolve(body);
}

function jsonResponse(body: unknown, init?: ResponseInitLike): FetchResponse {
  const status = init?.status ?? 200;
  const headers = init?.headers ?? {};
  return {
    status,
    ok: status >= 200 && status < 300,
    type: init?.type ?? 'basic',
    redirected: init?.redirected ?? false,
    headers: { get: (name: string): string | null => headers[name] ?? null },
    json: jsonBody(body),
  };
}

function createHarness(options: HarnessOptions = {}): Harness {
  const fetchCalls: FetchCall[] = [];
  const tokenCalls: TokenRequestOptions[] = [];
  const tokenResolvers: ((value: TokenResult) => void)[] = [];
  const responses = [...(options.responses ?? [jsonResponse({ id: 'data-1' })])];
  const tokenResults = [...(options.tokenResults ?? [{ kind: 'token', token: 'token-value' }])];

  const getToken = (requestOptions?: { readonly skipCache?: boolean }): Promise<TokenResult> => {
    tokenCalls.push(requestOptions);
    if (options.pendingToken === true) {
      return new Promise<TokenResult>((resolve) => {
        tokenResolvers.push(resolve);
      });
    }
    const next = tokenResults.shift();
    return Promise.resolve(next ?? { kind: 'token', token: 'token-value' });
  };

  const fetchImpl = (url: string, init: RequestInit): Promise<FetchResponse> => {
    fetchCalls.push({ url, init });
    if (options.pendingFetch === true) {
      const signal = init.signal;
      // Como `fetch`, la promesa se rechaza cuando su señal se aborta.
      return new Promise<FetchResponse>((_resolve, reject) => {
        if (signal !== undefined && signal !== null) {
          signal.addEventListener(
            'abort',
            () => {
              reject(new Error('fetch abortado'));
            },
            { once: true },
          );
        }
      });
    }
    const next = responses.shift();
    return Promise.resolve(next ?? jsonResponse({ id: 'data-1' }));
  };

  return {
    client: createApiClient({
      apiOrigin: API_ORIGIN,
      getToken,
      fetchImpl,
      timeoutMs: options.timeoutMs ?? 500,
    }),
    fetchCalls,
    tokenCalls,
    tokenResolvers,
  };
}

/** Respuesta cuyo cuerpo se resuelve a mano (para abortar entre respuesta y parse). */
function pendingBodyResponse(): FetchResponse {
  return {
    status: 200,
    ok: true,
    type: 'basic',
    redirected: false,
    headers: { get: () => null },
    json: () => Promise.resolve(null),
  };
}

function request(signal: AbortSignal): GetRequest {
  return { path: ACCEPTED_PATH, signal, tokenPolicy: 'cached' };
}

function firstCall(calls: readonly FetchCall[]): FetchCall {
  const [first] = calls;
  if (first === undefined) {
    throw new Error('se esperaba al menos una llamada a fetch');
  }
  return first;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error('la condición esperada no se alcanzó');
}

const REJECTED_PATHS = [
  '/api/v1/../../../otra-ruta',
  '/api/v1/..',
  '/api/v1/%2e%2e/x',
  '/api/v1/%2E%2E%2fx',
  '/api/v1/x/../y',
  '/api/v1/./x',
  '/api/v1/x\\..\\y',
  '//otro.host/api/v1/x',
  'https://otro.host/api/v1/x',
  '/api/v1/x?y=1',
  '/api/v1/x#z',
  '/api/v1/x/',
  '/api/v1//x',
  '/API/V1/x',
  '/api/v1/',
  '/api/v1',
  '/otra-ruta',
  '/api/v1/x y',
  '/api/v1/x\ny',
  '/api/v1/x\u0000y',
  '',
  `/api/v1/${'a'.repeat(510)}`,
];

describe('validación de la ruta', () => {
  it.each(REJECTED_PATHS)('rechaza %j sin red', async (path) => {
    const harness = createHarness();
    const controller = new AbortController();

    const result = await harness.client.getJson(
      { path, signal: controller.signal, tokenPolicy: 'cached' },
      parseId,
    );

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'client_bug', status: null, code: null, requestId: null },
    });
    expect(harness.tokenCalls).toHaveLength(0);
    expect(harness.fetchCalls).toHaveLength(0);
  });

  it('acepta una ruta válida y resuelve la URL final', async () => {
    const harness = createHarness();

    const result = await harness.client.getJson(request(new AbortController().signal), parseId);

    expect(result).toEqual({ ok: true, data: 'data-1' });
    const call = firstCall(harness.fetchCalls);
    const url = new URL(call.url);
    expect(url.origin).toBe(API_ORIGIN);
    expect(url.pathname).toBe(ACCEPTED_PATH);
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });
});

describe('opciones de fetch', () => {
  it('envía solo Authorization y Accept con las opciones acotadas', async () => {
    const harness = createHarness();

    await harness.client.getJson(request(new AbortController().signal), parseId);

    const { init } = firstCall(harness.fetchCalls);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(init.redirect).toBe('manual');
    expect(Object.keys(init.headers ?? {}).sort()).toEqual(['Accept', 'Authorization']);
  });
});

describe('tenantId', () => {
  it('envía X-Tenant-Id con un UUID canónico en minúsculas', async () => {
    const harness = createHarness();

    await harness.client.getJson(
      {
        path: ACCEPTED_PATH,
        tenantId: VALID_TENANT_ID,
        signal: new AbortController().signal,
        tokenPolicy: 'cached',
      },
      parseId,
    );

    const { init } = firstCall(harness.fetchCalls);
    expect(Object.keys(init.headers ?? {}).sort()).toEqual([
      'Accept',
      'Authorization',
      'X-Tenant-Id',
    ]);
  });

  it.each([
    VALID_TENANT_ID.toUpperCase(),
    ` ${VALID_TENANT_ID}`,
    `{${VALID_TENANT_ID}}`,
    '',
    'no-uuid',
    'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5',
  ])('rechaza el tenantId %j sin red', async (tenantId) => {
    const harness = createHarness();

    const result = await harness.client.getJson(
      {
        path: ACCEPTED_PATH,
        tenantId,
        signal: new AbortController().signal,
        tokenPolicy: 'cached',
      },
      parseId,
    );

    expect(result.ok).toBe(false);
    expect(harness.tokenCalls).toHaveLength(0);
    expect(harness.fetchCalls).toHaveLength(0);
  });
});

describe('redirecciones', () => {
  it.each([
    { type: 'opaqueredirect', status: 0 },
    { status: 302 },
    { redirected: true, status: 200 },
  ])('no sigue la redirección %j y no repite fetch', async (initLike) => {
    const harness = createHarness({ responses: [jsonResponse({ id: 'x' }, initLike)] });

    const result = await harness.client.getJson(request(new AbortController().signal), parseId);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'unexpected_redirect', status: null, code: null, requestId: null },
    });
    expect(harness.fetchCalls).toHaveLength(1);
  });
});

const TOKEN_FAILURES: readonly (readonly [TokenResult, string])[] = [
  [{ kind: 'no_session' }, 'no_session'],
  [{ kind: 'offline' }, 'token_offline'],
  [{ kind: 'error' }, 'token_error'],
];

describe('token', () => {
  it.each(TOKEN_FAILURES)('traduce %j sin llamar a fetch', async (tokenResult, expectedKind) => {
    const harness = createHarness({ tokenResults: [tokenResult] });

    const result = await harness.client.getJson(request(new AbortController().signal), parseId);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe(expectedKind);
    }
    expect(harness.fetchCalls).toHaveLength(0);
  });

  it('trata una excepción de getToken como token_error sin fetch', async () => {
    const fetchCalls: FetchCall[] = [];
    const client = createApiClient({
      apiOrigin: API_ORIGIN,
      getToken: () => Promise.reject(new Error('boom')),
      fetchImpl: (url: string, init: RequestInit) => {
        fetchCalls.push({ url, init });
        return Promise.resolve(jsonResponse({ id: 'x' }));
      },
    });

    const result = await client.getJson(request(new AbortController().signal), parseId);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'token_error', status: null, code: null, requestId: null },
    });
    expect(fetchCalls).toHaveLength(0);
  });

  it('usa skipCache solo con tokenPolicy fresh', async () => {
    const harness = createHarness();

    await harness.client.getJson(request(new AbortController().signal), parseId);
    await harness.client.getJson(
      { path: ACCEPTED_PATH, signal: new AbortController().signal, tokenPolicy: 'fresh' },
      parseId,
    );

    expect(harness.tokenCalls).toEqual([undefined, { skipCache: true }]);
  });

  it('no filtra el token en el resultado', async () => {
    const harness = createHarness({
      tokenResults: [{ kind: 'token', token: 'token-secreto-xyz' }],
    });

    const result = await harness.client.getJson(request(new AbortController().signal), parseId);

    expect(JSON.stringify(result)).not.toContain('token-secreto-xyz');
    expect(JSON.stringify(harness.fetchCalls)).toContain('Bearer token-secreto-xyz');
  });
});

describe('cancelación', () => {
  it('(a) señal ya abortada: sin getToken y sin fetch', async () => {
    const harness = createHarness();
    const controller = new AbortController();
    controller.abort();

    const result = await harness.client.getJson(request(controller.signal), parseId);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'aborted', status: null, code: null, requestId: null },
    });
    expect(harness.tokenCalls).toHaveLength(0);
    expect(harness.fetchCalls).toHaveLength(0);
  });

  it('(b) abortar con getToken pendiente y resolverlo después: fetch nunca se invoca', async () => {
    const harness = createHarness({ pendingToken: true });
    const controller = new AbortController();

    const pending = harness.client.getJson(request(controller.signal), parseId);
    await waitFor(() => harness.tokenResolvers.length === 1);
    controller.abort();
    const [resolveToken] = harness.tokenResolvers;
    resolveToken?.({ kind: 'token', token: 'tarde' });

    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('aborted');
    }
    expect(harness.fetchCalls).toHaveLength(0);
  });

  it('(c) abortar con getToken pendiente y rechazarlo: aborted sin rechazo no manejado', async () => {
    const harness = createHarness({ pendingToken: true });
    const controller = new AbortController();

    const pending = harness.client.getJson(request(controller.signal), parseId);
    await waitFor(() => harness.tokenResolvers.length === 1);
    controller.abort();
    const [resolveToken] = harness.tokenResolvers;
    resolveToken?.({ kind: 'error' });

    const result = await pending;

    expect(result.ok).toBe(false);
    expect(harness.fetchCalls).toHaveLength(0);
  });

  it('(d) vencimiento del timeout con getToken pendiente: timeout sin fetch', async () => {
    const harness = createHarness({ pendingToken: true, timeoutMs: 5 });

    const result = await harness.client.getJson(request(new AbortController().signal), parseId);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'timeout', status: null, code: null, requestId: null },
    });
    expect(harness.fetchCalls).toHaveLength(0);
  });

  it('(e) abortar durante fetch: la señal de fetch queda abortada y el resultado es aborted', async () => {
    const harness = createHarness({ pendingFetch: true });
    const controller = new AbortController();

    const pending = harness.client.getJson(request(controller.signal), parseId);
    await waitFor(() => harness.fetchCalls.length === 1);
    controller.abort();

    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('aborted');
    }
    const { init } = firstCall(harness.fetchCalls);
    expect(init.signal?.aborted).toBe(true);
  });

  it('(f) abortar tras la respuesta y antes del parse: no se invoca el parser', async () => {
    const bodyResolvers: ((value: unknown) => void)[] = [];
    const harness = createHarness({
      responses: [
        {
          ...pendingBodyResponse(),
          json: () =>
            new Promise<unknown>((resolve) => {
              bodyResolvers.push(resolve);
            }),
        },
      ],
    });
    const controller = new AbortController();
    let parseCalls = 0;

    const pending = harness.client.getJson(
      { path: ACCEPTED_PATH, signal: controller.signal, tokenPolicy: 'cached' },
      (body: unknown): string | null => {
        parseCalls += 1;
        return parseId(body);
      },
    );
    await waitFor(() => bodyResolvers.length === 1);
    controller.abort();
    const [resolveBody] = bodyResolvers;
    resolveBody?.({ id: 'data-1' });

    const result = await pending;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('aborted');
    }
    expect(parseCalls).toBe(0);
  });
});

describe('clasificación HTTP', () => {
  it('un 200 que no cumple el parser es contract_violation', async () => {
    const harness = createHarness({ responses: [jsonResponse({ otra: 'forma' })] });

    const result = await harness.client.getJson(request(new AbortController().signal), parseId);

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'contract_violation', status: null, code: null, requestId: null },
    });
  });

  it('un 200 sin cuerpo JSON válido es contract_violation', async () => {
    const harness = createHarness({
      responses: [
        {
          ...pendingBodyResponse(),
          json: () => Promise.reject(new Error('cuerpo vacío')),
        },
      ],
    });

    const result = await harness.client.getJson(request(new AbortController().signal), parseId);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe('contract_violation');
    }
  });

  it('clasifica 401, 403, 429 (con retry-after) y 5xx conservando el envelope', async () => {
    const cases = [
      {
        response: jsonResponse(
          { error: { code: 'AUTHENTICATION_REQUIRED', message: 'x', request_id: 'r-1' } },
          { status: 401 },
        ),
        kind: 'unauthenticated',
        retryAfterSeconds: null,
      },
      {
        response: jsonResponse(
          { error: { code: 'PERMISSION_DENIED', message: 'x', request_id: 'r-2' } },
          { status: 403 },
        ),
        kind: 'permission_denied',
        retryAfterSeconds: null,
      },
      {
        response: jsonResponse(
          { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'x', request_id: 'r-3' } },
          { status: 429, headers: { 'retry-after': '9' } },
        ),
        kind: 'rate_limited',
        retryAfterSeconds: 9,
      },
      {
        response: jsonResponse(
          { error: { code: 'INTERNAL_ERROR', message: 'x', request_id: 'r-4' } },
          { status: 500 },
        ),
        kind: 'server_error',
        retryAfterSeconds: null,
      },
    ];

    for (const testCase of cases) {
      const harness = createHarness({ responses: [testCase.response] });
      const result: ApiResult<string> = await harness.client.getJson(
        request(new AbortController().signal),
        parseId,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.failure.kind).toBe(testCase.kind);
        expect(result.failure.requestId).toMatch(/^r-[0-9]$/);
        if (result.failure.kind === 'rate_limited') {
          expect(result.failure.retryAfterSeconds).toBe(testCase.retryAfterSeconds);
        }
      }
    }
  });
});
