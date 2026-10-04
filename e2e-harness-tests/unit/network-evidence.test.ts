import { describe, expect, it } from 'vitest';

import {
  NetworkEvidence,
  OBJECT_STORAGE_ROUTE,
  parseSignatureEnvelope,
  signatureFlowOf,
  type ObservedExchange,
} from '../../e2e/support/network-evidence';
import { ALL_MARKERS, SYNTHETIC_MARKERS } from '../helpers/markers';

const API = 'https://api.example.invalid';
const R2 = 'https://objects.example.invalid';
const RECEPTION = '3d3d3d3d-3d3d-4d3d-8d3d-3d3d3d3d3d3d';
const SESSION = '11111111-1111-4111-8111-111111111111';
const MEDIA = '22222222-2222-4222-8222-222222222222';
const OTHER_MEDIA = '99999999-9999-4999-8999-999999999999';
const OTHER_SESSION = '88888888-8888-4888-8888-888888888888';
const OBJECT_PATH = `/bucket/tenant/${MEDIA}.png`;
const SIGNED_QUERY = `X-Amz-Signature=${SYNTHETIC_MARKERS.signedQuery}&X-Amz-Credential=${SYNTHETIC_MARKERS.token}`;

const createBody = (overrides: Record<string, unknown> = {}) => ({
  uploadSessionId: SESSION,
  mediaAssetId: MEDIA,
  status: 'pending',
  uploadUrl: `${R2}${OBJECT_PATH}?${SIGNED_QUERY}`,
  uploadMethod: 'PUT',
  uploadHeaders: { 'content-type': 'image/png' },
  objectKey: `tenant/${MEDIA}.png`,
  expiresAt: '2030-01-01T00:00:00.000Z',
  ...overrides,
});
const activeBody = (overrides: Record<string, unknown> = {}) => ({ mediaAssetId: MEDIA, status: 'active', sizeBytes: 4096, checksumSha256: null, ...overrides });
const signatureBody = (overrides: Record<string, unknown> = {}) => ({
  signature: {
    signatureId: '44444444-4444-4444-8444-444444444444',
    receptionId: RECEPTION,
    signatureMediaId: MEDIA,
    documentVersion: 'v1',
    signedAt: '2030-01-01T00:00:00.000Z',
    ...overrides,
  },
});

interface ChainOptions {
  readonly create?: Partial<ObservedExchange>;
  readonly put?: Partial<ObservedExchange> | null;
  readonly complete?: Partial<ObservedExchange>;
  readonly attach?: Partial<ObservedExchange>;
}

/** Observa la cadena session → PUT → complete → attach; cada eslabón admite sobrescrituras para romperlo. */
function observeChain(options: ChainOptions = {}): NetworkEvidence {
  const evidence = new NetworkEvidence(API);
  evidence.observe({ method: 'POST', url: `${API}/api/v1/media/upload-sessions`, status: 201, requestBody: {}, responseBody: createBody(), ...options.create });
  if (options.put !== null) {
    evidence.observe({ method: 'PUT', url: `${R2}${OBJECT_PATH}?${SIGNED_QUERY}`, status: 200, requestBody: null, responseBody: null, ...options.put });
  }
  evidence.observe({ method: 'POST', url: `${API}/api/v1/media/upload-sessions/${SESSION}/complete`, status: 200, requestBody: {}, responseBody: activeBody(), ...options.complete });
  evidence.observe({
    method: 'POST',
    url: `${API}/api/v1/receptions/${RECEPTION}/signature`,
    status: 201,
    requestBody: { signatureMediaId: MEDIA, signedByName: 'Firmante', documentVersion: 'v1' },
    responseBody: signatureBody(),
    ...options.attach,
  });
  return evidence;
}

const flow = (evidence: NetworkEvidence) => signatureFlowOf(evidence, { receptionId: RECEPTION });

describe('F2 · envelope de attach signature', () => {
  const attachFacts = (responseBody: unknown) => {
    const evidence = new NetworkEvidence(API);
    evidence.observe({ method: 'POST', url: `${API}/api/v1/receptions/${RECEPTION}/signature`, status: 201, requestBody: null, responseBody });
    return evidence.find('POST', '/api/v1/receptions/:id/signature')?.facts;
  };

  it('envelope válido { signature: {…} } → returnedSignatureId = true', () => {
    expect(attachFacts(signatureBody())).toEqual({ returnedSignatureId: true });
  });

  it('raíz incorrecta ({ signatureId } en la raíz) → false', () => {
    expect(attachFacts({ signatureId: '44444444-4444-4444-8444-444444444444' })).toEqual({ returnedSignatureId: false });
    expect(attachFacts({ ...signatureBody().signature })).toEqual({ returnedSignatureId: false });
  });

  it('signature vacía → false', () => {
    expect(attachFacts({ signature: {} })).toEqual({ returnedSignatureId: false });
    expect(attachFacts({ signature: null })).toEqual({ returnedSignatureId: false });
    expect(attachFacts({})).toEqual({ returnedSignatureId: false });
  });

  it.each([
    ['signatureId no UUID', { signatureId: 'abc' }],
    ['receptionId ausente', { receptionId: undefined }],
    ['signatureMediaId no UUID', { signatureMediaId: 7 }],
    ['documentVersion vacía', { documentVersion: '' }],
    ['signedAt inválida', { signedAt: 'ayer' }],
  ])('campo inválido (%s) → false', (_label, override) => {
    expect(attachFacts(signatureBody(override))).toEqual({ returnedSignatureId: false });
  });

  it('claves extra en la raíz o cuerpos no objeto → false', () => {
    expect(attachFacts({ ...signatureBody(), extra: true })).toEqual({ returnedSignatureId: false });
    expect(attachFacts([signatureBody()])).toEqual({ returnedSignatureId: false });
    expect(parseSignatureEnvelope('signature')).toBeNull();
  });

  it('una respuesta no 2xx nunca es evidencia', () => {
    const evidence = new NetworkEvidence(API);
    evidence.observe({ method: 'POST', url: `${API}/api/v1/receptions/${RECEPTION}/signature`, status: 409, requestBody: null, responseBody: signatureBody() });
    expect(evidence.entries[0]?.facts).toEqual({});
  });
});

describe('F3 · cadena correlacionada session → PUT → complete → attach', () => {
  it('cadena completa correlacionada → PASS', () => {
    const summary = flow(observeChain());
    expect([summary.uploadSessionCreated.seq, summary.objectStoragePut.seq, summary.mediaActivated.seq, summary.signatureRegistered.seq]).toEqual([1, 2, 3, 4]);
    expect(summary.objectStoragePut.route).toBe(OBJECT_STORAGE_ROUTE);
  });

  it('PUT ajeno (otro origen) → no cuenta', () => {
    const evidence = observeChain({ put: { url: `https://unrelated.example.invalid${OBJECT_PATH}?${SIGNED_QUERY}` } });
    expect(() => flow(evidence)).toThrow(/PUT a R2 correlacionado/);
  });

  it('PUT con ruta distinta → no cuenta', () => {
    const evidence = observeChain({ put: { url: `${R2}/bucket/other/${MEDIA}.png?${SIGNED_QUERY}` } });
    expect(() => flow(evidence)).toThrow(/PUT a R2 correlacionado/);
  });

  it('PUT correcto pero 500 → no cuenta', () => {
    expect(() => flow(observeChain({ put: { status: 500 } }))).toThrow(/PUT a R2 correlacionado/);
  });

  it('PUT por http (no https) o con otro método → no cuenta', () => {
    expect(() => flow(observeChain({ put: { url: `http://objects.example.invalid${OBJECT_PATH}` } }))).toThrow(/PUT a R2 correlacionado/);
    expect(() => flow(observeChain({ put: { method: 'POST' } }))).toThrow(/PUT a R2 correlacionado/);
  });

  it('sin ningún PUT → no cuenta', () => {
    expect(() => flow(observeChain({ put: null }))).toThrow(/PUT a R2 correlacionado/);
  });

  it('un PUT 500 seguido de un reintento correcto SÍ cuenta', () => {
    const evidence = new NetworkEvidence(API);
    evidence.observe({ method: 'POST', url: `${API}/api/v1/media/upload-sessions`, status: 201, requestBody: {}, responseBody: createBody() });
    evidence.observe({ method: 'PUT', url: `${R2}${OBJECT_PATH}?${SIGNED_QUERY}`, status: 500, requestBody: null, responseBody: null });
    evidence.observe({ method: 'PUT', url: `${R2}${OBJECT_PATH}?${SIGNED_QUERY}`, status: 200, requestBody: null, responseBody: null });
    evidence.observe({ method: 'POST', url: `${API}/api/v1/media/upload-sessions/${SESSION}/complete`, status: 200, requestBody: {}, responseBody: activeBody() });
    evidence.observe({ method: 'POST', url: `${API}/api/v1/receptions/${RECEPTION}/signature`, status: 201, requestBody: { signatureMediaId: MEDIA }, responseBody: signatureBody() });
    expect(flow(evidence).objectStoragePut.status).toBe(200);
  });

  it('complete con otra media (la respuesta activa un mediaAssetId distinto) → no cuenta', () => {
    const evidence = observeChain({ complete: { responseBody: activeBody({ mediaAssetId: OTHER_MEDIA }) } });
    expect(() => flow(evidence)).toThrow(/complete del mismo uploadSessionId/);
  });

  it('complete de otra sesión de subida → no cuenta', () => {
    const evidence = observeChain({ complete: { url: `${API}/api/v1/media/upload-sessions/${OTHER_SESSION}/complete` } });
    expect(() => flow(evidence)).toThrow(/complete del mismo uploadSessionId/);
  });

  it('complete que no deja la media activa o con tamaño 0 → no cuenta', () => {
    expect(() => flow(observeChain({ complete: { responseBody: activeBody({ status: 'pending' }) } }))).toThrow(/complete/);
    expect(() => flow(observeChain({ complete: { responseBody: activeBody({ sizeBytes: 0 }) } }))).toThrow(/complete/);
  });

  it('attach con otra media en la petición → no cuenta', () => {
    const evidence = observeChain({ attach: { requestBody: { signatureMediaId: OTHER_MEDIA } } });
    expect(() => flow(evidence)).toThrow(/attach de firma/);
  });

  it('attach cuya respuesta apunta a otra media → no cuenta', () => {
    const evidence = observeChain({ attach: { responseBody: signatureBody({ signatureMediaId: OTHER_MEDIA }) } });
    expect(() => flow(evidence)).toThrow(/attach de firma/);
  });

  it('attach en otra recepción (ruta o respuesta) → no cuenta', () => {
    const other = '5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e';
    expect(() => flow(observeChain({ attach: { url: `${API}/api/v1/receptions/${other}/signature` } }))).toThrow(/attach de firma/);
    expect(() => flow(observeChain({ attach: { responseBody: signatureBody({ receptionId: other }) } }))).toThrow(/attach de firma/);
  });

  it('attach con el envelope equivocado (raíz) o fallido → no cuenta', () => {
    const { signature } = signatureBody();
    expect(() => flow(observeChain({ attach: { responseBody: signature } }))).toThrow(/attach de firma/);
    expect(() => flow(observeChain({ attach: { status: 500 } }))).toThrow(/attach de firma/);
  });

  it('el orden importa: attach antes de complete → no cuenta', () => {
    const evidence = new NetworkEvidence(API);
    evidence.observe({ method: 'POST', url: `${API}/api/v1/media/upload-sessions`, status: 201, requestBody: {}, responseBody: createBody() });
    evidence.observe({ method: 'PUT', url: `${R2}${OBJECT_PATH}?${SIGNED_QUERY}`, status: 200, requestBody: null, responseBody: null });
    evidence.observe({ method: 'POST', url: `${API}/api/v1/receptions/${RECEPTION}/signature`, status: 201, requestBody: { signatureMediaId: MEDIA }, responseBody: signatureBody() });
    evidence.observe({ method: 'POST', url: `${API}/api/v1/media/upload-sessions/${SESSION}/complete`, status: 200, requestBody: {}, responseBody: activeBody() });
    expect(() => flow(evidence)).toThrow(/attach de firma/);
  });

  it('create-upload sin envelope contractual (sin https, con credenciales, sin status) → no hay cadena', () => {
    for (const body of [
      createBody({ uploadUrl: `http://objects.example.invalid${OBJECT_PATH}` }),
      createBody({ uploadUrl: `https://user:pass@objects.example.invalid${OBJECT_PATH}` }),
      createBody({ status: 'active' }),
      createBody({ uploadSessionId: 'no-uuid' }),
    ]) {
      expect(() => flow(observeChain({ create: { responseBody: body } }))).toThrow(/creación de upload session/);
    }
    expect(() => flow(observeChain({ create: { status: 500 } }))).toThrow(/creación de upload session/);
  });

  it('el attach debe ser de la recepción ESPERADA', () => {
    expect(() => signatureFlowOf(observeChain(), { receptionId: '6f6f6f6f-6f6f-4f6f-8f6f-6f6f6f6f6f6f' })).toThrow(/attach de firma/);
  });

  it('con una sesión ajena previa se correlaciona la cadena correcta', () => {
    const evidence = new NetworkEvidence(API);
    evidence.observe({
      method: 'POST',
      url: `${API}/api/v1/media/upload-sessions`,
      status: 201,
      requestBody: {},
      responseBody: createBody({ uploadSessionId: OTHER_SESSION, mediaAssetId: OTHER_MEDIA, uploadUrl: `${R2}/bucket/ajena.png?q=1` }),
    });
    evidence.observe({ method: 'POST', url: `${API}/api/v1/media/upload-sessions`, status: 201, requestBody: {}, responseBody: createBody() });
    evidence.observe({ method: 'PUT', url: `${R2}${OBJECT_PATH}?${SIGNED_QUERY}`, status: 200, requestBody: null, responseBody: null });
    evidence.observe({ method: 'POST', url: `${API}/api/v1/media/upload-sessions/${SESSION}/complete`, status: 200, requestBody: {}, responseBody: activeBody() });
    evidence.observe({ method: 'POST', url: `${API}/api/v1/receptions/${RECEPTION}/signature`, status: 201, requestBody: { signatureMediaId: MEDIA }, responseBody: signatureBody() });
    expect(flow(evidence).uploadSessionCreated.seq).toBe(2);
  });

  it('las respuestas llegan desordenadas: el orden lo da seq, no el momento de registro', () => {
    const evidence = new NetworkEvidence(API);
    evidence.observe({ method: 'POST', url: `${API}/api/v1/media/upload-sessions/${SESSION}/complete`, status: 200, requestBody: {}, responseBody: activeBody() }, 3);
    evidence.observe({ method: 'POST', url: `${API}/api/v1/media/upload-sessions`, status: 201, requestBody: {}, responseBody: createBody() }, 1);
    evidence.observe({ method: 'PUT', url: `${R2}${OBJECT_PATH}?${SIGNED_QUERY}`, status: 200, requestBody: null, responseBody: null }, 2);
    evidence.observe({ method: 'POST', url: `${API}/api/v1/receptions/${RECEPTION}/signature`, status: 201, requestBody: { signatureMediaId: MEDIA }, responseBody: signatureBody() }, 4);
    expect(evidence.entries.map((entry) => entry.seq)).toEqual([1, 2, 3, 4]);
    expect(() => flow(evidence)).not.toThrow();
  });
});

describe('la evidencia no persiste secretos', () => {
  it('JSON de la evidencia y de la cadena: sin URL, query, firma, host de R2, token ni cookie', () => {
    const evidence = observeChain();
    evidence.observe({ method: 'GET', url: `${API}/api/v1/me?token=${SYNTHETIC_MARKERS.token}`, status: 200, requestBody: null, responseBody: null });
    const serialized = JSON.stringify({ evidence, summary: flow(evidence) });
    for (const marker of ALL_MARKERS) expect(serialized.includes(marker)).toBe(false);
    expect(serialized).not.toMatch(/https?:\/\/|X-Amz|objects\.example|\?|bucket\/tenant|Bearer|Authorization|set-cookie/i);
    expect(serialized).not.toContain(SESSION);
    expect(serialized).not.toContain(MEDIA);
  });

  it('el mensaje de un fallo de cadena tampoco incluye URL ni marcadores', () => {
    let message = '';
    try {
      flow(observeChain({ put: { url: `https://unrelated.example.invalid/x?${SIGNED_QUERY}` } }));
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).not.toBe('');
    for (const marker of ALL_MARKERS) expect(message.includes(marker)).toBe(false);
    expect(message).not.toMatch(/https?:\/\//);
  });

  it('un objeto-almacenamiento PUT queda registrado sin URL', () => {
    const evidence = observeChain();
    const put = evidence.entries.find((entry) => entry.kind === 'object-storage');
    expect(put).toEqual({ seq: 2, kind: 'object-storage', method: 'PUT', route: OBJECT_STORAGE_ROUTE, status: 200, facts: {} });
  });
});
