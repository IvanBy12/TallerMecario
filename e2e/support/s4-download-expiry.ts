import { createHash, randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { s4Check } from './s4-media-evidence';
import { checkS4DownloadTimes, s4ExpiryWaitMs } from './s4-download-timing';

/** Capability remains in a browser closure; only timing, hashes and HTTP statuses leave it. */
export async function verifyExpiredDownload(page: Page, args: {
  apiOrigin: string; storageOrigin: string; tenantId: string; assetId: string;
}): Promise<{ initialStatus: number; expiredStorageStatus: number; waitedPastExpiry: true }> {
  const cdp = await page.context().newCDPSession(page);
  const closureKey = `s4Expiry_${randomUUID()}`;
  const requests = new Map<string, string>();
  const statuses: { hash: string; status: number; storageDateMs: number }[] = [];
  cdp.on('Network.requestWillBeSent', event => {
    if (event.request.method === 'GET' && new URL(event.request.url).origin === args.storageOrigin) {
      requests.set(event.requestId, createHash('sha256').update(event.request.url).digest('hex'));
    }
  });
  cdp.on('Network.responseReceivedExtraInfo', event => {
    const hash = requests.get(event.requestId);
    if (hash !== undefined) {
      const date = Object.entries(event.headers).find(([key]) => key.toLowerCase() === 'date')?.[1];
      statuses.push({ hash, status: event.statusCode, storageDateMs: Date.parse(date ?? '') });
    }
  });
  await cdp.send('Network.enable');
  try {
    const timing = await page.evaluate(async ({ apiOrigin, storageOrigin, tenantId, assetId, closureKey }) => {
      try {
        const clerk = Reflect.get(window, 'Clerk') as { session?: { getToken(): Promise<string | null> } } | undefined;
        const token = await clerk?.session?.getToken();
        if (!token) throw new Error('No session.');
        const started = performance.now();
        const response = await fetch(`${apiOrigin}/api/v1/media/${assetId}/download-url`, {
          headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId }, credentials: 'omit', cache: 'no-store',
        });
        const body: unknown = await response.json();
        const requestDurationMs = performance.now() - started;
        if (response.status !== 200 || typeof body !== 'object' || body === null) throw new Error('Download denied.');
        const url: unknown = Reflect.get(body, 'downloadUrl');
        const expiresAt: unknown = Reflect.get(body, 'expiresAt');
        if (typeof url !== 'string' || new URL(url).origin !== storageOrigin || typeof expiresAt !== 'string') throw new Error('Invalid capability.');
        const query = new URL(url).searchParams;
        const date = query.get('X-Amz-Date') ?? '';
        const duration = query.get('X-Amz-Expires') ?? '';
        if (!/^\d{8}T\d{6}Z$/.test(date) || !/^\d+$/.test(duration)) throw new Error('Invalid signed time.');
        const signedAtMs = Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`);
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url)))].map(n => n.toString(16).padStart(2, '0')).join('');
        const initial = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        const initialReceived = performance.now();
        await initial.arrayBuffer();
        // R2 Date is obtained from CDP even when CORS does not expose Date to browser JavaScript.
        Reflect.set(window, closureKey, async (waitMs: number) => {
          while (performance.now() - initialReceived < waitMs) {
            await new Promise(resolve => { setTimeout(resolve, waitMs - (performance.now() - initialReceived)); });
          }
          const waitedPastExpiry = performance.now() - initialReceived >= waitMs;
          // CORS TypeError alone proves nothing. Runner requires CDP 403 for the same hash.
          await fetch(url, { credentials: 'omit', cache: 'no-store' }).then(response => response.arrayBuffer()).catch(() => undefined);
          return waitedPastExpiry;
        });
        return { hash, signedAtMs, ttlMs: Number(duration) * 1_000, apiExpiresAtMs: Date.parse(expiresAt), requestDurationMs, initialStatus: initial.status };
      } catch { throw new Error('No se pudo verificar la expiración real de la descarga.'); }
    }, { ...args, closureKey });
    checkS4DownloadTimes(timing.apiExpiresAtMs, timing.signedAtMs, timing.ttlMs, timing.requestDurationMs);
    const initial = statuses.find(event => event.hash === timing.hash);
    s4Check(timing.initialStatus === 200 && initial?.status === 200, 'Falta GET real exitoso durante vigencia.');
    const waitMs = s4ExpiryWaitMs(timing.signedAtMs + timing.ttlMs, initial.storageDateMs);
    const waitedPastExpiry = await page.evaluate(async ({ closureKey, waitMs }) => {
      const verify = Reflect.get(window, closureKey) as (waitMs: number) => Promise<boolean>;
      return verify(waitMs);
    }, { closureKey, waitMs });
    const correlated = statuses.filter(event => event.hash === timing.hash);
    s4Check(waitedPastExpiry && correlated.length === 2 && correlated[1]?.status === 403 &&
      correlated[1].storageDateMs >= timing.signedAtMs + timing.ttlMs,
      'Falta GET real 403 de la misma capacidad después del vencimiento efectivo de R2.');
    return { initialStatus: 200, expiredStorageStatus: 403, waitedPastExpiry: true };
  } finally {
    await page.evaluate(key => { Reflect.deleteProperty(window, key); }, closureKey).catch(() => undefined);
    await cdp.detach();
  }
}
