import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { s4Check } from './s4-media-evidence';

/** Signed URL stays in the browser closure. CDP retains hashes/statuses only, including CORS-filtered 403. */
export async function verifyExpiredDownload(page: Page, args: {
  apiOrigin: string; storageOrigin: string; tenantId: string; assetId: string;
}): Promise<{ initialStatus: number; expiredStorageStatus: number; waitedPastExpiry: true }> {
  const cdp = await page.context().newCDPSession(page);
  const requests = new Map<string, string>();
  const statuses: { hash: string; status: number }[] = [];
  cdp.on('Network.requestWillBeSent', event => {
    if (event.request.method === 'GET' && new URL(event.request.url).origin === args.storageOrigin) {
      requests.set(event.requestId, createHash('sha256').update(event.request.url).digest('hex'));
    }
  });
  cdp.on('Network.responseReceivedExtraInfo', event => {
    const hash = requests.get(event.requestId);
    if (hash !== undefined) statuses.push({ hash, status: event.statusCode });
  });
  await cdp.send('Network.enable');
  try {
    const result = await page.evaluate(async ({ apiOrigin, storageOrigin, tenantId, assetId }) => {
      try {
        const clerk = Reflect.get(window, 'Clerk') as { session?: { getToken(): Promise<string | null> } } | undefined;
        const token = await clerk?.session?.getToken();
        if (!token) throw new Error('No session.');
        const response = await fetch(`${apiOrigin}/api/v1/media/${assetId}/download-url`, {
          headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId }, credentials: 'omit', cache: 'no-store',
        });
        const body: unknown = await response.json();
        if (response.status !== 200 || typeof body !== 'object' || body === null) throw new Error('Download denied.');
        const url: unknown = Reflect.get(body, 'downloadUrl');
        const expiresAt: unknown = Reflect.get(body, 'expiresAt');
        if (typeof url !== 'string' || new URL(url).origin !== storageOrigin || typeof expiresAt !== 'string') throw new Error('Invalid capability.');
        const ttl = Date.parse(expiresAt) - Date.now();
        if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 300_000) throw new Error('Invalid TTL.');
        const initial = await fetch(url, { credentials: 'omit', cache: 'no-store' });
        await initial.arrayBuffer();
        await new Promise(resolve => { setTimeout(resolve, Math.max(0, Date.parse(expiresAt) - Date.now()) + 2_000); });
        // R2 may withhold ACAO on a denied request. CDP must still see a real 403; TypeError alone proves nothing.
        await fetch(url, { credentials: 'omit', cache: 'no-store' }).then(response => response.arrayBuffer()).catch(() => undefined);
        return { initialStatus: initial.status, waitedPastExpiry: Date.now() > Date.parse(expiresAt) };
      } catch { throw new Error('No se pudo verificar la expiración real de la descarga.'); }
    }, args);
    const initial = statuses[0];
    const expired = statuses.at(-1);
    s4Check(result.initialStatus === 200 && result.waitedPastExpiry && initial?.status === 200 && expired?.status === 403 &&
      statuses.length >= 2 && expired.hash === initial.hash, 'Falta GET real 403 de la misma capacidad después de expiresAt.');
    return { initialStatus: 200, expiredStorageStatus: 403, waitedPastExpiry: true };
  } finally { await cdp.detach(); }
}
