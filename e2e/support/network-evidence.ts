import type { Page, Response } from '@playwright/test';

/**
 * Evidencia técnica de red SANITIZADA (E2E-06). Solo registra: orden de llegada, método, ruta con UUIDs enmascarados y
 * estado HTTP, más hechos booleanos derivados del cuerpo. Nunca guarda URL completas (la subida a R2 va firmada),
 * query strings, cabeceras, cookies, tokens ni cuerpos. No usa trace de Playwright (registraría Authorization).
 */

export interface EvidenceEntry {
  readonly seq: number;
  readonly kind: 'api' | 'object-storage';
  readonly method: string;
  readonly route: string;
  readonly status: number;
  readonly facts: Readonly<Record<string, boolean | string | number>>;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
export const OBJECT_STORAGE_ROUTE = '(PUT firmado a almacenamiento de objetos; URL omitida)';

export class NetworkEvidence {
  readonly entries: EvidenceEntry[] = [];
  private seq = 0;

  constructor(private readonly apiOrigin: string) {}

  async capture(response: Response): Promise<void> {
    const request = response.request();
    const method = request.method();
    if (method === 'OPTIONS') return;
    let url: URL;
    try {
      url = new URL(response.url());
    } catch {
      return;
    }
    const seq = (this.seq += 1);
    if (url.origin === this.apiOrigin && url.pathname.startsWith('/api/v1/')) {
      const route = url.pathname.replace(UUID, ':id');
      this.entries.push({ seq, kind: 'api', method, route, status: response.status(), facts: await this.factsOf(method, route, response) });
    } else if (method === 'PUT' && url.protocol === 'https:') {
      this.entries.push({ seq, kind: 'object-storage', method, route: OBJECT_STORAGE_ROUTE, status: response.status(), facts: {} });
    }
  }

  private async factsOf(method: string, route: string, response: Response): Promise<Record<string, boolean | string | number>> {
    if (method !== 'POST' || response.status() >= 300) return {};
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return {};
    }
    if (typeof body !== 'object' || body === null) return {};
    const has = (key: string) => Reflect.has(body, key);
    if (route === '/api/v1/media/upload-sessions') {
      return { returnedUploadSession: has('uploadSessionId') && has('mediaAssetId'), returnedSignedUploadUrl: has('uploadUrl') };
    }
    if (/^\/api\/v1\/media\/upload-sessions\/:id\/complete$/.test(route)) {
      const status: unknown = Reflect.get(body, 'status');
      const size: unknown = Reflect.get(body, 'sizeBytes');
      return { mediaStatus: typeof status === 'string' ? status : 'desconocido', sizeBytesPositive: typeof size === 'number' && size > 0 };
    }
    if (/^\/api\/v1\/receptions\/:id\/signature$/.test(route)) {
      return { returnedSignatureId: has('signatureId') };
    }
    return {};
  }

  find(method: string, route: RegExp | string): EvidenceEntry | undefined {
    return this.entries.find((entry) => entry.method === method && (typeof route === 'string' ? entry.route === route : route.test(entry.route)));
  }
}

export function recordNetwork(page: Page, apiOrigin: string): NetworkEvidence {
  const evidence = new NetworkEvidence(apiOrigin);
  page.on('response', (response) => {
    void evidence.capture(response).catch(() => undefined);
  });
  return evidence;
}

export interface SignatureFlowSummary {
  readonly uploadSessionCreated: EvidenceEntry;
  readonly objectStoragePut: EvidenceEntry;
  readonly mediaActivated: EvidenceEntry;
  readonly signatureRegistered: EvidenceEntry;
}

const ok = (entry: EvidenceEntry) => entry.status >= 200 && entry.status < 300;

/** Devuelve los cuatro eventos reales en orden, o lanza con el eslabón que falta. */
export function signatureFlowOf(evidence: NetworkEvidence): SignatureFlowSummary {
  const find = (method: string, route: RegExp | string, label: string): EvidenceEntry => {
    const entry = evidence.entries.find((item) => item.method === method && (typeof route === 'string' ? item.route === route : route.test(item.route)) && ok(item));
    if (entry === undefined) throw new Error(`Falta evidencia real de red: ${label}`);
    return entry;
  };
  const uploadSessionCreated = find('POST', '/api/v1/media/upload-sessions', 'creación de upload session');
  const objectStoragePut = find('PUT', OBJECT_STORAGE_ROUTE, 'PUT a R2');
  const mediaActivated = find('POST', /^\/api\/v1\/media\/upload-sessions\/:id\/complete$/, 'complete (media activa)');
  const signatureRegistered = find('POST', /^\/api\/v1\/receptions\/:id\/signature$/, 'attach de firma');
  if (!(uploadSessionCreated.seq < objectStoragePut.seq && objectStoragePut.seq < mediaActivated.seq && mediaActivated.seq < signatureRegistered.seq)) {
    throw new Error('Los eventos de firma no ocurrieron en el orden session → PUT R2 → complete → attach.');
  }
  return { uploadSessionCreated, objectStoragePut, mediaActivated, signatureRegistered };
}
