import { createHash } from 'node:crypto';
import type { Page, Response } from '@playwright/test';
import { field } from './api-probe';
import { NetworkEvidence, parseUploadSessionEnvelope, parseActiveMediaEnvelope } from './network-evidence';

export interface S4Exchange {
  readonly method: string; readonly url: string; readonly status: number;
  readonly requestBody: unknown; readonly responseBody: unknown;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly responseHeaders: Readonly<Record<string, string>>;
}
type Event = { readonly seq: number; readonly exchange: S4Exchange };
const digest = (url: string) => createHash('sha256').update(url).digest('hex');
const ok = (status: number) => status >= 200 && status < 300;
const safeStorage = (headers: Readonly<Record<string, string>>) =>
  !['authorization', 'x-tenant-id', 'cookie'].some(key => headers[key] !== undefined);
export class S4CheckFailure extends Error {
  constructor(message: string) { super(message); this.name = 'S4CheckFailure'; }
}
export function s4Check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new S4CheckFailure(message);
}
/** Private in-memory exchanges never reach reporters. Only the existing sanitized entry format is serializable. */
export class S4MediaEvidence {
  readonly #events: Event[] = [];
  readonly #pending = new Set<Promise<void>>();
  readonly #base: NetworkEvidence;
  #seq = 0;
  #captureFailed = false;
  #downloadRequests = 0;
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
    const sanitized = { ...exchange, requestHeaders, responseHeaders };
    this.#events.push({ seq, exchange: sanitized });
    this.#events.sort((a, b) => a.seq - b.seq);
    const url = new URL(exchange.url);
    // Existing sanitizer, bodies deliberately excluded: no hostile body strings can become facts.
    if (url.origin === this.apiOrigin && /^\/api\/v1\/(?:receptions(?:\/[0-9a-f-]{36}\/media)?|media\/upload-sessions(?:\/[0-9a-f-]{36}\/complete)?|media\/[0-9a-f-]{36}\/download-url)$/.test(url.pathname)) {
      this.#base.observe({ ...exchange, requestBody: null, responseBody: null }, seq);
    } else if (url.origin === this.storageOrigin) {
      this.#base.entries.push({ seq, kind: 'object-storage', method: exchange.method,
        route: '(R2; URL omitida)', status: exchange.status, facts: { credentialsAbsent: safeStorage(exchange.requestHeaders) } });
    }
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
  async capture(response: Response): Promise<void> {
    const url = new URL(response.url());
    if (![this.apiOrigin, this.storageOrigin].includes(url.origin)) return;
    const seq = ++this.#seq;
    const request = response.request();
    const mediaRoute = /^\/api\/v1\/(?:media\/|receptions\/[0-9a-f-]{36}\/media$)/.test(url.pathname);
    const isApi = url.origin === this.apiOrigin;
    let requestBody: unknown = null;
    let responseBody: unknown = null;
    if (isApi && mediaRoute && request.method() === 'POST') {
      try { requestBody = JSON.parse(request.postData() ?? 'null'); } catch { /* fail via missing chain */ }
    }
    if (isApi && mediaRoute && ok(response.status())) responseBody = await response.json().catch(() => null);
    this.observe({ method: request.method(), url: response.url(), status: response.status(), requestBody, responseBody,
      requestHeaders: await request.allHeaders(), responseHeaders: await response.allHeaders() }, seq);
  }
  noteRequest(method: string, url: string): void {
    const target = new URL(url);
    if (method === 'GET' && target.origin === this.apiOrigin && /\/download-url$/.test(target.pathname)) this.#downloadRequests++;
  }
  downloads(): number {
    return Math.max(this.#downloadRequests, this.#events.filter(({ exchange: e }) => new URL(e.url).origin === this.apiOrigin &&
      /\/download-url$/.test(new URL(e.url).pathname)).length);
  }
  uploadChain(receptionId: string, mediaType: 'photo' | 'video360', sizeBytes: number): string {
    const events = this.#events;
    const created = events.find(({ exchange: e }) => e.method === 'POST' && new URL(e.url).origin === this.apiOrigin &&
      new URL(e.url).pathname === '/api/v1/media/upload-sessions' && e.status === 201 &&
      field(e.requestBody, 'mediaType') === mediaType && field(e.requestBody, 'retentionClass') === 'operational' &&
      field(e.requestBody, 'expectedSizeBytes') === sizeBytes &&
      field(e.requestBody, 'operationalContext', 'type') === 'reception' &&
      field(e.requestBody, 'operationalContext', 'receptionId') === receptionId);
    s4Check(created !== undefined, 'Falta create contextual real S4.');
    const session = parseUploadSessionEnvelope(created.exchange.responseBody);
    const uploadUrl = field(created.exchange.responseBody, 'uploadUrl');
    s4Check(session !== null && session.origin === this.storageOrigin && typeof uploadUrl === 'string', 'Upload target S4 inválido.');
    const put = events.find(({ seq, exchange: e }) => seq > created.seq && e.method === 'PUT' && digest(e.url) === digest(uploadUrl) && ok(e.status));
    s4Check(put !== undefined && safeStorage(put.exchange.requestHeaders), 'Falta PUT R2 correcto sin credenciales de API.');
    const signed = field(created.exchange.responseBody, 'uploadHeaders');
    s4Check(typeof signed === 'object' && signed !== null && Object.entries(signed).every(([key, value]) =>
      typeof value === 'string' && put.exchange.requestHeaders[key.toLowerCase()] === value), 'PUT no conservó los headers firmados.');
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
    const url = field(download.exchange.responseBody, 'downloadUrl');
    s4Check(typeof url === 'string' && new URL(url).origin === this.storageOrigin, 'Download target S4 inválido.');
    const expiry = field(download.exchange.responseBody, 'expiresAt');
    s4Check(typeof expiry === 'string' && Date.parse(expiry) > Date.now() && Date.parse(expiry) <= Date.now() + 300_000, 'TTL download fuera del contrato.');
    const bytes = this.#events.find(({ seq, exchange: e }) => seq > download.seq && e.method === 'GET' && digest(e.url) === digest(url) && ok(e.status) &&
      (!requireRange || (e.status === 206 && e.requestHeaders['range'] !== undefined)));
    s4Check(bytes !== undefined && safeStorage(bytes.exchange.requestHeaders) &&
      bytes.exchange.responseHeaders['access-control-allow-origin'] === this.frontendOrigin, 'Falta GET/CORS R2 sin credenciales o Range 206 de video.');
  }
}
export async function recordS4Media(page: Page, origins: { api: string; storage: string; frontend: string }): Promise<S4MediaEvidence> {
  const evidence = new S4MediaEvidence(origins.api, origins.storage, origins.frontend);
  page.on('request', request => { evidence.noteRequest(request.method(), request.url()); });
  page.on('response', response => { evidence.track(evidence.capture(response)); });
  // Playwright Page response events omit browser-generated OPTIONS; observe them through Chromium CDP only.
  const cdp = await page.context().newCDPSession(page);
  const options = new Map<string, { url: string; headers: Record<string, string> }>();
  cdp.on('Network.requestWillBeSent', event => {
    if (event.request.method === 'OPTIONS' && new URL(event.request.url).origin === origins.storage) {
      options.set(event.requestId, { url: event.request.url, headers: Object.fromEntries(Object.entries(event.request.headers).map(([key, value]) => [key.toLowerCase(), value])) });
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
