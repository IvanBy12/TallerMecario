import type { Page, Response } from '@playwright/test';

/**
 * Evidencia técnica de red SANITIZADA y CORRELACIONADA (E2E-06).
 *
 * Salida persistible (`entries`): orden de llegada, método, ruta con UUID enmascarados, estado HTTP y hechos booleanos.
 * Nunca URL completas (la subida a R2 va firmada), query strings, cabeceras, cookies, tokens ni cuerpos.
 *
 * Correlación (solo en memoria, jamás serializada — `toJSON` solo expone `entries`): una cadena de firma solo cuenta si
 *   create-upload (uploadSessionId, mediaAssetId, uploadUrl)
 *     → PUT con método PUT, MISMO origen y MISMA ruta que la uploadUrl devuelta, y estado 2xx
 *     → complete del MISMO uploadSessionId que devuelve el MISMO mediaAssetId activo
 *     → attach en la recepción esperada con ESE mediaAssetId y el envelope contractual `{ signature: {…} }`.
 * De la uploadUrl solo se retienen origen y ruta (nunca query, firma, credencial ni la URL completa).
 * No usa trace de Playwright (registraría Authorization).
 */

export interface EvidenceEntry {
  readonly seq: number;
  readonly kind: 'api' | 'object-storage';
  readonly method: string;
  readonly route: string;
  readonly status: number;
  readonly facts: Readonly<Record<string, boolean | string | number>>;
}

/** Intercambio observado, ya sin tipos de Playwright (permite probar el colector de forma pura). */
export interface ObservedExchange {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  /** Cuerpo JSON de la petición (solo POST al API) o null. */
  readonly requestBody: unknown;
  /** Cuerpo JSON de la respuesta (solo POST 2xx al API) o null. */
  readonly responseBody: unknown;
}

const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_ANYWHERE = new RegExp(UUID_SOURCE, 'gi');
/** UUID RFC 9562 (versión 1–8, variante 10xx). Rechaza por construcción NIL (versión 0) y MAX (versión f). */
const UUID_STRICT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_NIL = '00000000-0000-0000-0000-000000000000';
const UUID_MAX = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
/** Timestamp UTC estricto: termina en `Z`, fracción opcional de 1–6 dígitos (el parser productivo tolera 0–6). */
const UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?Z$/;
const COMPLETE_PATH = new RegExp(`^/api/v1/media/upload-sessions/(${UUID_SOURCE})/complete$`, 'i');
const SIGNATURE_PATH = new RegExp(`^/api/v1/receptions/(${UUID_SOURCE})/signature$`, 'i');
const UPLOAD_SESSIONS_ROUTE = '/api/v1/media/upload-sessions';
const ACCEPTANCE_DOCUMENT_ROUTE = '/api/v1/reception-acceptance-document';
/** Única versión contractual publicada del documento de aceptación (docs/S3-05-reception-signature.md). */
export const RECEPTION_ACCEPTANCE_VERSION = 'reception_acceptance_es-CO_v1';
export const OBJECT_STORAGE_ROUTE = '(PUT firmado a almacenamiento de objetos; URL omitida)';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** UUID estricto de evidencia (minúsculas) o null: no UUID, NIL y MAX se rechazan. */
export function evidenceUuidOf(value: unknown): string | null {
  if (typeof value !== 'string' || !UUID_STRICT.test(value)) return null;
  const id = value.toLowerCase();
  return id === UUID_NIL || id === UUID_MAX ? null : id;
}
const uuidOf = evidenceUuidOf;
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isLeapYear = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const daysInMonth = (year: number, month: number): number => (month === 2 ? (isLeapYear(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31);

/**
 * Timestamp ISO UTC estricto: componentes de un instante calendario real (rechaza 2026-02-30 y mes 13, que `Date.parse`
 * normalizaría), terminado exactamente en `Z` (sin offset ni hora sin zona). No depende de `Date.parse`.
 */
export function isStrictUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = UTC_TIMESTAMP.exec(value);
  if (match === null) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) && hour <= 23 && minute <= 59 && second <= 59;
}
const isoTime = (value: unknown): value is string => nonEmpty(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const ok = (entry: { readonly status: number }): boolean => entry.status >= 200 && entry.status < 300;

export interface UploadSessionEnvelope {
  readonly uploadSessionId: string;
  readonly mediaAssetId: string;
  readonly origin: string;
  readonly pathname: string;
}

/** Respuesta contractual de `POST /media/upload-sessions`. De la URL firmada solo conserva origen y ruta. */
export function parseUploadSessionEnvelope(body: unknown): UploadSessionEnvelope | null {
  if (!isRecord(body)) return null;
  const uploadSessionId = uuidOf(body['uploadSessionId']);
  const mediaAssetId = uuidOf(body['mediaAssetId']);
  const uploadUrl = body['uploadUrl'];
  if (
    uploadSessionId === null ||
    mediaAssetId === null ||
    body['status'] !== 'pending' ||
    body['uploadMethod'] !== 'PUT' ||
    !nonEmpty(uploadUrl) ||
    !nonEmpty(body['objectKey']) ||
    !isoTime(body['expiresAt']) ||
    !isRecord(body['uploadHeaders'])
  ) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(uploadUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return null;
  return { uploadSessionId, mediaAssetId, origin: url.origin, pathname: url.pathname };
}

export interface ActiveMediaEnvelope {
  readonly mediaAssetId: string;
  readonly sizeBytes: number;
}

/** Respuesta contractual de `POST /media/upload-sessions/:id/complete`. */
export function parseActiveMediaEnvelope(body: unknown): ActiveMediaEnvelope | null {
  if (!isRecord(body)) return null;
  const mediaAssetId = uuidOf(body['mediaAssetId']);
  const sizeBytes = body['sizeBytes'];
  if (mediaAssetId === null || body['status'] !== 'active' || typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    return null;
  }
  return { mediaAssetId, sizeBytes };
}

export interface SignatureEnvelope {
  readonly signatureId: string;
  readonly receptionId: string;
  readonly signatureMediaId: string;
  readonly documentVersion: string;
  readonly signedAt: string;
}

/**
 * Respuesta contractual de `POST /receptions/:id/signature`:
 * `{ signature: { signatureId, receptionId, signatureMediaId, documentVersion, signedAt } }`.
 * Una raíz distinta (p. ej. `{ signatureId }`), una `signature` incompleta, ids NIL/MAX, una versión que no sea la contractual
 * (`RECEPTION_ACCEPTANCE_VERSION`) o un `signedAt` que no sea un instante UTC real terminado en `Z` NO es evidencia.
 */
export function parseSignatureEnvelope(body: unknown): SignatureEnvelope | null {
  if (!isRecord(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'signature') return null;
  const signature = body['signature'];
  if (!isRecord(signature)) return null;
  const signatureId = uuidOf(signature['signatureId']);
  const receptionId = uuidOf(signature['receptionId']);
  const signatureMediaId = uuidOf(signature['signatureMediaId']);
  const documentVersion = signature['documentVersion'];
  const signedAt = signature['signedAt'];
  if (
    signatureId === null ||
    receptionId === null ||
    signatureMediaId === null ||
    documentVersion !== RECEPTION_ACCEPTANCE_VERSION ||
    !isStrictUtcTimestamp(signedAt)
  ) {
    return null;
  }
  return { signatureId, receptionId, signatureMediaId, documentVersion, signedAt };
}

type Correlation =
  | { readonly type: 'create'; readonly session: UploadSessionEnvelope }
  | { readonly type: 'put'; readonly origin: string; readonly pathname: string }
  | { readonly type: 'complete'; readonly uploadSessionId: string; readonly mediaAssetId: string }
  | { readonly type: 'acceptance'; readonly documentVersion: string }
  | {
      readonly type: 'attach';
      readonly pathReceptionId: string;
      readonly requestMediaId: string | null;
      /** `documentVersion` enviado en el attach (solo la versión, nunca el texto de aceptación). */
      readonly requestDocumentVersion: string | null;
      readonly signature: SignatureEnvelope | null;
    };

interface Observation {
  readonly entry: EvidenceEntry;
  readonly correlation: Correlation | null;
}

export interface SignatureFlowSummary {
  readonly uploadSessionCreated: EvidenceEntry;
  readonly objectStoragePut: EvidenceEntry;
  readonly mediaActivated: EvidenceEntry;
  readonly signatureRegistered: EvidenceEntry;
}

export interface ExpectedSignatureFlow {
  /** Recepción sobre la que el flujo debe haber adjuntado la firma. */
  readonly receptionId: string;
}

const FLOW_LINKS = [
  'creación de upload session (envelope contractual)',
  'PUT a R2 correlacionado (mismo origen y ruta que la uploadUrl devuelta, estado 2xx)',
  'complete del mismo uploadSessionId/mediaAssetId (media activa)',
  'attach de firma con el mismo mediaAssetId, la recepción esperada y la documentVersion contractual enviada (envelope { signature })',
] as const;

/** Si se observó el documento de aceptación real antes del attach, su versión debe ser la enviada en el attach. */
function acceptedVersionAgrees(items: readonly Observation[], attachSeq: number, version: string): boolean {
  const published = items.filter(({ entry, correlation }) => correlation?.type === 'acceptance' && entry.seq < attachSeq);
  const latest = published[published.length - 1]?.correlation;
  return latest?.type !== 'acceptance' || latest.documentVersion === version;
}

export class NetworkEvidence {
  /** Evidencia sanitizada (única parte persistible), ordenada por llegada. */
  readonly entries: EvidenceEntry[] = [];
  private readonly observations: Observation[] = [];
  private readonly pending = new Set<Promise<void>>();
  private seq = 0;

  constructor(private readonly apiOrigin: string) {}

  /** Solo `entries`: la correlación en memoria (ids, origen/ruta de subida) nunca se serializa. */
  toJSON(): { readonly entries: readonly EvidenceEntry[] } {
    return { entries: this.entries };
  }

  nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  /** Registra un intercambio observado. Puro: no hace E/S. */
  observe(exchange: ObservedExchange, seq: number = this.nextSeq()): void {
    const method = exchange.method.toUpperCase();
    if (method === 'OPTIONS') return;
    let url: URL;
    try {
      url = new URL(exchange.url);
    } catch {
      return;
    }
    if (url.origin === this.apiOrigin && url.pathname.startsWith('/api/v1/')) {
      const route = url.pathname.replace(UUID_ANYWHERE, ':id');
      const { facts, correlation } = this.analyze(method, url.pathname, route, exchange);
      this.add({ entry: { seq, kind: 'api', method, route, status: exchange.status, facts }, correlation });
    } else if (method === 'PUT' && url.protocol === 'https:') {
      this.add({
        entry: { seq, kind: 'object-storage', method, route: OBJECT_STORAGE_ROUTE, status: exchange.status, facts: {} },
        correlation: { type: 'put', origin: url.origin, pathname: url.pathname },
      });
    }
  }

  private add(observation: Observation): void {
    this.observations.push(observation);
    this.observations.sort((a, b) => a.entry.seq - b.entry.seq);
    this.entries.push(observation.entry);
    this.entries.sort((a, b) => a.seq - b.seq);
  }

  private analyze(
    method: string,
    pathname: string,
    route: string,
    exchange: ObservedExchange,
  ): { facts: Record<string, boolean | string | number>; correlation: Correlation | null } {
    const none = { facts: {}, correlation: null };
    if (!ok(exchange)) return none;
    const body = exchange.responseBody;
    if (method === 'GET' && route === ACCEPTANCE_DOCUMENT_ROUTE) {
      const document = isRecord(body) ? body['acceptanceDocument'] : null;
      const version = isRecord(document) ? document['documentVersion'] : null;
      return { facts: {}, correlation: nonEmpty(version) ? { type: 'acceptance', documentVersion: version } : null };
    }
    if (method !== 'POST') return none;
    if (route === UPLOAD_SESSIONS_ROUTE) {
      const session = parseUploadSessionEnvelope(body);
      return {
        facts: { returnedUploadSession: session !== null, returnedSignedUploadUrl: session !== null },
        correlation: session === null ? null : { type: 'create', session },
      };
    }
    const complete = COMPLETE_PATH.exec(pathname);
    if (complete !== null) {
      const media = parseActiveMediaEnvelope(body);
      const status: unknown = isRecord(body) ? body['status'] : undefined;
      const uploadSessionId = uuidOf(complete[1]);
      return {
        facts: { mediaStatus: typeof status === 'string' ? status : 'desconocido', sizeBytesPositive: media !== null },
        correlation: media === null || uploadSessionId === null ? null : { type: 'complete', uploadSessionId, mediaAssetId: media.mediaAssetId },
      };
    }
    const attach = SIGNATURE_PATH.exec(pathname);
    if (attach !== null) {
      const signature = parseSignatureEnvelope(body);
      const pathReceptionId = uuidOf(attach[1]);
      const request = isRecord(exchange.requestBody) ? exchange.requestBody : {};
      const requestMediaId = uuidOf(request['signatureMediaId']);
      const requestDocumentVersion = nonEmpty(request['documentVersion']) ? request['documentVersion'] : null;
      return {
        facts: { returnedSignatureId: signature !== null },
        correlation: pathReceptionId === null ? null : { type: 'attach', pathReceptionId, requestMediaId, requestDocumentVersion, signature },
      };
    }
    return none;
  }

  /** Adaptador de Playwright: lee los cuerpos JSON solo de los POST al API (y del GET del documento de aceptación) y delega en `observe`. */
  async capture(response: Response): Promise<void> {
    const request = response.request();
    const method = request.method();
    if (method === 'OPTIONS') return;
    const seq = this.nextSeq();
    let requestBody: unknown = null;
    let responseBody: unknown = null;
    const isApi = response.url().startsWith(`${this.apiOrigin}/api/v1/`);
    const isAcceptanceRead = method === 'GET' && isApi && new URL(response.url()).pathname === ACCEPTANCE_DOCUMENT_ROUTE;
    if ((method === 'POST' && isApi) || isAcceptanceRead) {
      try {
        requestBody = method === 'POST' ? JSON.parse(request.postData() ?? 'null') : null;
      } catch {
        requestBody = null;
      }
      if (response.status() < 300) {
        try {
          responseBody = await response.json();
        } catch {
          responseBody = null;
        }
      }
    }
    this.observe({ method, url: response.url(), status: response.status(), requestBody, responseBody }, seq);
  }

  track(capture: Promise<void>): void {
    const safe = capture.catch(() => undefined);
    this.pending.add(safe);
    void safe.finally(() => this.pending.delete(safe));
  }

  /** Espera a que terminen las lecturas de cuerpo en curso antes de evaluar la cadena. */
  async settled(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  find(method: string, route: RegExp | string): EvidenceEntry | undefined {
    return this.entries.find((entry) => entry.method === method && (typeof route === 'string' ? entry.route === route : route.test(entry.route)));
  }

  /** Devuelve los cuatro eventos CORRELACIONADOS en orden, o lanza con el eslabón que falta. */
  signatureFlow(expected: ExpectedSignatureFlow): SignatureFlowSummary {
    const receptionId = expected.receptionId.toLowerCase();
    const items = this.observations;
    let furthest = 0;
    for (const created of items) {
      const create = created.correlation;
      if (create?.type !== 'create' || !ok(created.entry)) continue;
      furthest = Math.max(furthest, 1);
      const put = items.find(
        ({ entry, correlation }) =>
          correlation?.type === 'put' &&
          entry.method === 'PUT' &&
          ok(entry) &&
          entry.seq > created.entry.seq &&
          correlation.origin === create.session.origin &&
          correlation.pathname === create.session.pathname,
      );
      if (put === undefined) continue;
      furthest = Math.max(furthest, 2);
      const complete = items.find(
        ({ entry, correlation }) =>
          correlation?.type === 'complete' &&
          ok(entry) &&
          entry.seq > put.entry.seq &&
          correlation.uploadSessionId === create.session.uploadSessionId &&
          correlation.mediaAssetId === create.session.mediaAssetId,
      );
      if (complete === undefined) continue;
      furthest = Math.max(furthest, 3);
      const attach = items.find(
        ({ entry, correlation }) =>
          correlation?.type === 'attach' &&
          ok(entry) &&
          entry.seq > complete.entry.seq &&
          correlation.pathReceptionId === receptionId &&
          correlation.requestMediaId === create.session.mediaAssetId &&
          correlation.requestDocumentVersion === RECEPTION_ACCEPTANCE_VERSION &&
          correlation.signature !== null &&
          correlation.signature.receptionId === receptionId &&
          correlation.signature.signatureMediaId === create.session.mediaAssetId &&
          correlation.signature.documentVersion === correlation.requestDocumentVersion &&
          acceptedVersionAgrees(items, entry.seq, correlation.requestDocumentVersion),
      );
      if (attach === undefined) continue;
      return {
        uploadSessionCreated: created.entry,
        objectStoragePut: put.entry,
        mediaActivated: complete.entry,
        signatureRegistered: attach.entry,
      };
    }
    throw new Error(`Falta evidencia real de red correlacionada: ${FLOW_LINKS[furthest] ?? FLOW_LINKS[0]}`);
  }
}

export function recordNetwork(page: Page, apiOrigin: string): NetworkEvidence {
  const evidence = new NetworkEvidence(apiOrigin);
  page.on('response', (response) => {
    evidence.track(evidence.capture(response));
  });
  return evidence;
}

/** Cadena correlacionada create → PUT → complete → attach para la recepción esperada. */
export function signatureFlowOf(evidence: NetworkEvidence, expected: ExpectedSignatureFlow): SignatureFlowSummary {
  return evidence.signatureFlow(expected);
}
