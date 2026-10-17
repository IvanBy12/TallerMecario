import { s4Check } from './s4-check';
import { createHash } from 'node:crypto';
import type { Page, Response } from '@playwright/test';
import { checkS4DownloadTimes, signedS4DownloadTimes } from './s4-download-timing';
import { field } from './api-probe';
import { NetworkEvidence, parseUploadSessionEnvelope, parseActiveMediaEnvelope, evidenceUuidOf, type UploadSessionEnvelope } from './network-evidence';

export interface S4Exchange {
  readonly method: string; readonly url: string; readonly status: number;
  readonly requestDurationMs?: number;
  readonly requestSeq?: number;
  readonly requestBody: unknown; readonly responseBody: unknown;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly responseHeaders: Readonly<Record<string, string>>;
}
type Event = { readonly seq: number; readonly exchange: S4Exchange; readonly capabilityHash?: string; readonly capabilityOrigin?: string;
  readonly session?: UploadSessionEnvelope | null; readonly downloadTimes?: { signedAtMs: number; ttlMs: number } };
const projectedMedia = (value: unknown) => ({ mediaAssetId: evidenceUuidOf(field(value, 'mediaAssetId')),
  mediaType: ['photo', 'video360'].includes(String(field(value, 'mediaType'))) ? field(value, 'mediaType') : undefined,
  purpose: field(value, 'purpose') === 'intake_evidence' ? 'intake_evidence' : undefined });
const projectedRequest = (value: unknown) => ({ mediaAssetId: evidenceUuidOf(field(value, 'mediaAssetId')),
  mediaType: ['photo', 'video360'].includes(String(field(value, 'mediaType'))) ? field(value, 'mediaType') : undefined,
  expectedSizeBytes: typeof field(value, 'expectedSizeBytes') === 'number' ? field(value, 'expectedSizeBytes') : undefined,
  retentionClass: field(value, 'retentionClass') === 'operational' ? 'operational' : undefined,
  operationalContext: { type: field(value, 'operationalContext', 'type') === 'reception' ? 'reception' : undefined,
    receptionId: evidenceUuidOf(field(value, 'operationalContext', 'receptionId')) } });

const digest = (url: string) => createHash('sha256').update(url).digest('hex');
const ok = (status: number) => status >= 200 && status < 300;
const safeStorage = (headers: Readonly<Record<string, string>>) =>
  !['authorization', 'x-tenant-id', 'cookie'].some(key => headers[key] !== undefined);
export { S4CheckFailure, s4Check } from './s4-check';
/** Private in-memory exchanges never reach reporters. Only the existing sanitized entry format is serializable. */
export class S4MediaEvidence {
  readonly #events: Event[] = [];
  readonly #pending = new Set<Promise<void>>();
  readonly #base: NetworkEvidence;
  #seq = 0;
  #captureFailed = false;
  #downloadRequests = 0;
  readonly #requests: { seq: number; method: string; url: string; body: unknown; capabilityHash?: string }[] = [];
  #requestSeq = 0;
  #operation: { receptionId: string; requestSeq: number; responseSeq: number } | undefined;
  constructor(readonly apiOrigin: string, readonly storageOrigin: string, readonly frontendOrigin: string) {
    this.#base = new NetworkEvidence(apiOrigin);
  }
  observe(exchange: S4Exchange, seq: number = ++this.#seq): void {
    // Keep only headers needed for contract/CORS assertions. Credentials become presence markers, never values.
    const requestHeaders = Object.fromEntries(Object.entries(exchange.requestHeaders).filter(([key]) =>
      ['authorization', 'x-tenant-id', 'cookie', 'content-type', 'if-none-match', 'range', 'access-control-request-method', 'access-control-request-headers'].includes(key)
    ).map(([key, value]) => [key, ['authorization', 'x-tenant-id', 'cookie'].includes(key) ? '(present)' : value]));
    const responseHeaders = Object.fromEntries(Object.entries(exchange.responseHeaders).filter(([key]) =>
      ['cache-control', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers'].includes(key)));
    const url = new URL(exchange.url);
    const uploadUrl = field(exchange.responseBody, 'uploadUrl');
    const downloadUrl = field(exchange.responseBody, 'downloadUrl');
    const capability = url.origin === this.storageOrigin ? exchange.url : typeof uploadUrl === 'string' ? uploadUrl :
      typeof downloadUrl === 'string' ? downloadUrl : undefined;
    let capabilityOrigin: string | undefined;
    if (capability !== undefined) { try { capabilityOrigin = new URL(capability).origin; } catch { /* Invalid target fails correlation. */ } }
    const parsed = parseUploadSessionEnvelope(exchange.responseBody);
    const session = parsed && { ...parsed, pathname: `/__s4_object__/${digest(parsed.pathname)}` };
    const signed = field(exchange.responseBody, 'uploadHeaders');
    const signedHashes = typeof signed === 'object' && signed !== null ? Object.fromEntries(Object.entries(signed)
      .map(([key, value]) => [key, typeof value === 'string' ? digest(value) : null])) : undefined;
    let downloadTimes: { signedAtMs: number; ttlMs: number } | undefined;
    if (typeof downloadUrl === 'string') { try { downloadTimes = signedS4DownloadTimes(downloadUrl); } catch { /* Invalid timing fails readChain. */ } }
    const list = field(exchange.responseBody, 'media');
    const responseBody = { ...projectedMedia(exchange.responseBody), status: ['pending', 'active'].includes(String(field(exchange.responseBody, 'status'))) ? field(exchange.responseBody, 'status') : undefined,
      sizeBytes: typeof field(exchange.responseBody, 'sizeBytes') === 'number' ? field(exchange.responseBody, 'sizeBytes') : undefined,
      expiresAt: typeof field(exchange.responseBody, 'expiresAt') === 'string' && Number.isFinite(Date.parse(String(field(exchange.responseBody, 'expiresAt')))) ? field(exchange.responseBody, 'expiresAt') : undefined,
      uploadHeaders: signedHashes, media: Array.isArray(list) ? list.map(projectedMedia) : projectedMedia(list) };
    const sanitized = { ...exchange, url: this.#storedUrl(url), requestBody: projectedRequest(exchange.requestBody), responseBody, requestHeaders, responseHeaders };
    this.#events.push({ seq, exchange: sanitized, session, downloadTimes, capabilityOrigin, capabilityHash: capability === undefined ? undefined : digest(capability) });
    this.#events.sort((a, b) => a.seq - b.seq);
    // Existing sanitizer, bodies deliberately excluded: no hostile body strings can become facts.
    if (url.origin === this.apiOrigin && /^\/api\/v1\/(?:receptions(?:\/[0-9a-f-]{36}\/media)?|media\/upload-sessions(?:\/[^/]+\/complete)?|media\/[0-9a-f-]{36}\/download-url)$/.test(url.pathname)) {
      this.#base.observe({ ...exchange, requestBody: null, responseBody: null }, seq);
    } else if (url.origin === this.storageOrigin) {
      this.#base.entries.push({ seq, kind: 'object-storage', method: exchange.method,
        route: '(R2; URL omitida)', status: exchange.status, facts: { credentialsAbsent: safeStorage(exchange.requestHeaders) } });
    }
  }
  #storedUrl(url: URL): string {
    return url.origin + (url.origin === this.storageOrigin ? `/__s4_object__/${digest(url.pathname)}` : url.pathname);
  }
  toJSON() { return [...this.#base.entries].sort((a, b) => a.seq - b.seq); }
  track(capture: Promise<void>): void {
    const safe = capture.catch(() => { this.#captureFailed = true; });
    this.#pending.add(safe);
    void safe.finally(() => this.#pending.delete(safe));
  }
  async settled(): Promise<void> {
    while (this.#pending.size) await Promise.all([...this.#pending]);
    s4Check(!this.#captureFailed, 'No se pudo capturar evidencia S4 completa.');
  }
  async capture(response: Response, startedAt: number, requestSeq?: number): Promise<void> {
    const url = new URL(response.url());
    if (![this.apiOrigin, this.storageOrigin].includes(url.origin)) return;
    const seq = ++this.#seq;
    const request = response.request();
    const mediaRoute = /^\/api\/v1\/(?:media\/|receptions\/[^/]+\/media$)/.test(url.pathname);
    const isApi = url.origin === this.apiOrigin;
    let requestBody: unknown = null;
    let responseBody: unknown = null;
    if (isApi && mediaRoute && request.method() === 'POST') {
      try { requestBody = JSON.parse(request.postData() ?? 'null'); } catch { /* fail via missing chain */ }
    }
    if (isApi && mediaRoute && ok(response.status())) responseBody = await response.json().catch(() => null);
    this.observe({ method: request.method(), url: response.url(), status: response.status(), requestBody, responseBody,
      requestDurationMs: performance.now() - startedAt, requestSeq,
      requestHeaders: await request.allHeaders(), responseHeaders: await response.allHeaders() }, seq);
  }
  noteRequest(method: string, url: string, body: unknown = null): number {
    const seq = ++this.#requestSeq;
    const target = new URL(url);
    if ((method === 'PUT' && target.origin === this.storageOrigin) || (method === 'POST' && target.origin === this.apiOrigin &&
      /^\/api\/v1\/(?:media\/upload-sessions(?:\/[^/]+\/complete)?|receptions\/[^/]+\/media)$/.test(target.pathname))) {
      this.#requests.push({ seq, method, url: this.#storedUrl(target), body: projectedRequest(body),
        capabilityHash: target.origin === this.storageOrigin ? digest(url) : undefined });
    }
    if (method === 'GET' && target.origin === this.apiOrigin && /\/download-url$/.test(target.pathname)) this.#downloadRequests++;
    return seq;
  }
  downloads(): number {
    return Math.max(this.#downloadRequests, this.#events.filter(({ exchange: e }) => new URL(e.url).origin === this.apiOrigin &&
      /\/download-url$/.test(new URL(e.url).pathname)).length);
  }
  /** Installed collector first; checkpoint immediately before the first upload click. */
  beginUploadOperation(receptionId: string): void {
    s4Check(this.#operation === undefined, 'La operación de upload S4 ya fue iniciada.');
    this.#operation = { receptionId, requestSeq: this.#requestSeq, responseSeq: this.#seq };
  }
  #operationEvents(): Event[] {
    const operation = this.#operation;
    if (!operation) return this.#events;
    return this.#events.filter(({ seq, exchange }) => exchange.requestSeq === undefined
      ? seq > operation.responseSeq : exchange.requestSeq > operation.requestSeq);
  }
  #operationRequests() {
    const operation = this.#operation;
    return operation ? this.#requests.filter(r => r.seq > operation.requestSeq) : this.#requests;
  }
  assertUploadOperation(files: readonly { mediaType: 'photo' | 'video360'; sizeBytes: number }[]): void {
    const operation = this.#operation;
    s4Check(operation !== undefined && files.length === 2 && files.some(file => file.mediaType === 'photo') &&
      files.some(file => file.mediaType === 'video360'), 'Falta operación S4 PNG/MP4 delimitada.');
    const events = this.#operationEvents();
    const requests = this.#operationRequests();
    const create = (method: string, url: string) => method === 'POST' && new URL(url).origin === this.apiOrigin &&
      new URL(url).pathname === '/api/v1/media/upload-sessions';
    s4Check(Math.max(requests.filter(r => create(r.method, r.url)).length,
      events.filter(({ exchange: e }) => create(e.method, e.url)).length) === 2,
      'La operación S4 debe emitir exactamente 2 POST de upload sessions.');
    const put = (method: string, url: string) => method === 'PUT' && new URL(url).origin === this.storageOrigin;
    s4Check(Math.max(requests.filter(r => put(r.method, r.url)).length,
      events.filter(({ exchange: e }) => put(e.method, e.url)).length) === 2, 'La operación S4 debe emitir exactamente 2 PUT a R2.');
    // All relevant mutations after the checkpoint count, regardless of IDs or reception context.
    for (const completion of [true, false]) {
      const mutation = (method: string, url: string) => method === 'POST' && new URL(url).origin === this.apiOrigin &&
        (completion ? /^\/api\/v1\/media\/upload-sessions\/[^/]+\/complete$/ : /^\/api\/v1\/receptions\/[^/]+\/media$/).test(new URL(url).pathname);
      s4Check(Math.max(requests.filter(r => mutation(r.method, r.url)).length,
        events.filter(({ exchange: e }) => mutation(e.method, e.url)).length) === 2,
      completion ? 'La operación S4 debe emitir exactamente 2 completion.' : 'La operación S4 debe emitir exactamente 2 asociaciones.');
    }
    for (const file of files) this.uploadChain(operation.receptionId, file.mediaType, file.sizeBytes);
  }
  uploadChain(receptionId: string, mediaType: 'photo' | 'video360', sizeBytes: number): string {
    const events = this.#operationEvents();
    const requests = this.#operationRequests();
    const created = events.find(({ exchange: e }) => e.method === 'POST' && new URL(e.url).origin === this.apiOrigin &&
      new URL(e.url).pathname === '/api/v1/media/upload-sessions' && e.status === 201 &&
      field(e.requestBody, 'mediaType') === mediaType && field(e.requestBody, 'retentionClass') === 'operational' &&
      field(e.requestBody, 'expectedSizeBytes') === sizeBytes &&
      field(e.requestBody, 'operationalContext', 'type') === 'reception' &&
      field(e.requestBody, 'operationalContext', 'receptionId') === receptionId);
    s4Check(created !== undefined, 'Falta create contextual real S4.');
    const session = created.session;
    const capabilityHash = created.capabilityHash;
    s4Check(session != null && session.origin === this.storageOrigin && capabilityHash !== undefined, 'Upload target S4 inválido.');
    const put = events.find(({ seq, exchange: e, capabilityHash: hash }) => seq > created.seq && e.method === 'PUT' && hash === capabilityHash && ok(e.status));
    s4Check(put !== undefined && safeStorage(put.exchange.requestHeaders), 'Falta PUT R2 correcto sin credenciales de API.');
    const puts = (method: string, url: string, hash?: string) => method === 'PUT' && new URL(url).origin === this.storageOrigin && hash === capabilityHash;
    s4Check(Math.max(requests.filter(r => puts(r.method, r.url, r.capabilityHash)).length,
      events.filter(({ exchange: e, capabilityHash: hash }) => puts(e.method, e.url, hash)).length) === 1, 'PUT duplicado para la misma capacidad S4.');
    const signed = field(created.exchange.responseBody, 'uploadHeaders');
    s4Check(typeof signed === 'object' && signed !== null && Object.entries(signed).every(([key, value]) =>
      typeof value === 'string' && digest(put.exchange.requestHeaders[key.toLowerCase()] ?? '') === value), 'PUT no conservó los headers firmados.');
    const preflight = events.find(({ exchange: e }) => e.method === 'OPTIONS' && new URL(e.url).origin === session.origin &&
      new URL(e.url).pathname === session.pathname && ok(e.status) &&
      e.requestHeaders['access-control-request-method'] === 'PUT' && e.responseHeaders['access-control-allow-origin'] === this.frontendOrigin &&
      e.responseHeaders['access-control-allow-methods']?.split(',').some(method => method.trim() === 'PUT') &&
      Object.keys(signed).every(header => e.requestHeaders['access-control-request-headers']?.toLowerCase().includes(header.toLowerCase()) &&
        e.responseHeaders['access-control-allow-headers']?.toLowerCase().split(',').map(h => h.trim()).includes(header.toLowerCase())));
    s4Check(preflight !== undefined, 'Falta OPTIONS/CORS real con los headers firmados.');
    const completed = events.find(({ seq, exchange: e }) => seq > put.seq && e.method === 'POST' &&
      new URL(e.url).origin === this.apiOrigin && new URL(e.url).pathname === `/api/v1/media/upload-sessions/${session.uploadSessionId}/complete` &&
      e.status === 200 && parseActiveMediaEnvelope(e.responseBody)?.mediaAssetId === session.mediaAssetId &&
      field(e.responseBody, 'sizeBytes') === sizeBytes);
    s4Check(completed !== undefined, 'Falta complete active del mismo asset y tamaño.');
    const attached = events.find(({ seq, exchange: e }) => seq > completed.seq && e.method === 'POST' &&
      new URL(e.url).origin === this.apiOrigin && new URL(e.url).pathname === `/api/v1/receptions/${receptionId}/media` && e.status === 201 &&
      field(e.requestBody, 'mediaAssetId') === session.mediaAssetId && field(e.responseBody, 'media', 'mediaAssetId') === session.mediaAssetId &&
      field(e.responseBody, 'media', 'mediaType') === mediaType && field(e.responseBody, 'media', 'purpose') === 'intake_evidence');
    s4Check(attached !== undefined, 'Falta asociación canónica del mismo asset a la recepción.');
    const mutation = (method: string, url: string, body: unknown, completion: boolean) => method === 'POST' &&
      new URL(url).origin === this.apiOrigin && new URL(url).pathname === (completion
        ? `/api/v1/media/upload-sessions/${session.uploadSessionId}/complete` : `/api/v1/receptions/${receptionId}/media`) &&
      (completion || field(body, 'mediaAssetId') === session.mediaAssetId);
    for (const completion of [true, false]) {
      s4Check(Math.max(requests.filter(r => mutation(r.method, r.url, r.body, completion)).length,
        events.filter(({ exchange: e }) => mutation(e.method, e.url, e.requestBody, completion)).length) === 1,
      completion ? 'Completion duplicado de la sesión S4.' : 'Asociación duplicada del asset S4.');
    }
    s4Check([created, completed, attached].every(({ exchange: e }) => e.responseHeaders['cache-control']?.includes('no-store') === true), 'Falta no-store en mutaciones media.');
    return session.mediaAssetId;
  }
  listReads(receptionId: string): number {
    return this.#events.filter(({ exchange: e }) => e.method === 'GET' && e.status === 200 &&
      new URL(e.url).origin === this.apiOrigin && new URL(e.url).pathname === `/api/v1/receptions/${receptionId}/media`).length;
  }
  readChain(receptionId: string, assetId: string, requireRange: boolean): void {
    const listed = this.#events.toReversed().find(({ exchange: e }) => e.method === 'GET' && e.status === 200 && new URL(e.url).origin === this.apiOrigin &&
      new URL(e.url).pathname === `/api/v1/receptions/${receptionId}/media`);
    s4Check(listed !== undefined && Array.isArray(field(listed.exchange.responseBody, 'media')) &&
      (field(listed.exchange.responseBody, 'media') as unknown[]).some(media => field(media, 'mediaAssetId') === assetId) && listed.exchange.responseHeaders['cache-control']?.includes('no-store') === true, 'Falta lista persistida no-store con el asset asociado.');
    const download = this.#events.find(({ seq, exchange: e }) => seq > listed.seq && e.method === 'GET' && e.status === 200 &&
      new URL(e.url).origin === this.apiOrigin && new URL(e.url).pathname === `/api/v1/media/${assetId}/download-url` && field(e.responseBody, 'mediaAssetId') === assetId);
    s4Check(download !== undefined && download.exchange.responseHeaders['cache-control']?.includes('no-store') === true, 'Falta descarga bajo demanda autorizada y no-store.');
    const capabilityHash = download.capabilityHash;
    s4Check(capabilityHash !== undefined && download.capabilityOrigin === this.storageOrigin && download.downloadTimes !== undefined, 'Download target S4 inválido.');
    const expiry = field(download.exchange.responseBody, 'expiresAt');
    s4Check(typeof expiry === 'string' && download.exchange.requestDurationMs !== undefined, 'Falta reloj API/tiempo observado de descarga.');
    const timing = download.downloadTimes;
    checkS4DownloadTimes(Date.parse(expiry), timing.signedAtMs, timing.ttlMs, download.exchange.requestDurationMs);
    const bytes = this.#events.find(({ seq, exchange: e, capabilityHash: hash }) => seq > download.seq && e.method === 'GET' && hash === capabilityHash && ok(e.status) &&
      (!requireRange || (e.status === 206 && e.requestHeaders['range'] !== undefined)));
    s4Check(bytes !== undefined && safeStorage(bytes.exchange.requestHeaders) &&
      bytes.exchange.responseHeaders['access-control-allow-origin'] === this.frontendOrigin, 'Falta GET/CORS R2 sin credenciales o Range 206 de video.');
  }
}
export async function recordS4Media(page: Page, origins: { api: string; storage: string; frontend: string }): Promise<S4MediaEvidence> {
  const evidence = new S4MediaEvidence(origins.api, origins.storage, origins.frontend);
  const started = new WeakMap<ReturnType<Response['request']>, { time: number; seq: number }>();
  page.on('request', request => {
    const time = performance.now();
    let body: unknown = null;
    if (request.method() === 'POST' && new URL(request.url()).origin === origins.api &&
      /^\/api\/v1\/(?:media\/upload-sessions(?:\/[^/]+\/complete)?|receptions\/[^/]+\/media)$/.test(new URL(request.url()).pathname)) {
      try { body = JSON.parse(request.postData() ?? 'null'); } catch { /* Missing body fails correlation. */ }
    }
    const seq = evidence.noteRequest(request.method(), request.url(), body);
    started.set(request, { time, seq });
  });
  page.on('response', response => {
    const observed = started.get(response.request());
    evidence.track(evidence.capture(response, observed?.time ?? performance.now(), observed?.seq));
  });
  // Playwright Page response events omit browser-generated OPTIONS; observe them through Chromium CDP only.
  const cdp = await page.context().newCDPSession(page);
  const options = new Map<string, { url: string; headers: Record<string, string> }>();
  cdp.on('Network.requestWillBeSent', event => {
    if (event.request.method === 'OPTIONS' && new URL(event.request.url).origin === origins.storage) {
      const target = new URL(event.request.url);
      options.set(event.requestId, { url: target.origin + target.pathname, headers: Object.fromEntries(Object.entries(event.request.headers)
        .map(([key, value]): [string, string] => [key.toLowerCase(), typeof value === 'string' ? value : '(invalid)']).filter(([key]) => key === 'access-control-request-method' || key === 'access-control-request-headers')) });
    }
  });
  cdp.on('Network.responseReceived', event => {
    const request = options.get(event.requestId);
    if (request === undefined) return;
    options.delete(event.requestId);
    evidence.observe({ method: 'OPTIONS', url: request.url, status: event.response.status, requestBody: null, responseBody: null,
      requestHeaders: request.headers, responseHeaders: Object.fromEntries(Object.entries(event.response.headers).map(([key, value]) => [key.toLowerCase(), value])) });
  });
  await cdp.send('Network.enable');
  return evidence;
}
