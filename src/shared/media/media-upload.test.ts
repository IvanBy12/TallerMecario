// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { UPLOAD_SESSION } from '@/test/media-fixtures';
import { storageFailureCopy } from './media-errors';
import { putMedia } from './media-upload';
import type { StorageFetch, StorageResponse } from './media-types';

function response(status = 200): StorageResponse {
  return { status, ok: status >= 200 && status < 300, redirected: false, type: 'basic' };
}
const blob = new Blob(['abc'], { type: 'browser/mime-type' });

describe('direct signed PUT', () => {
  it('uses the URL directly, exact approved headers, credentials omit, redirect error and original AbortSignal', async () => {
    const send = vi.fn<StorageFetch>(() => Promise.resolve(response()));
    const signal = new AbortController().signal;
    expect(await putMedia(UPLOAD_SESSION, blob, signal, send)).toEqual({ ok: true, data: null });
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] ?? [];
    expect(url).toBe(UPLOAD_SESSION.uploadUrl);
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual(UPLOAD_SESSION.uploadHeaders);
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBe(signal);
    expect(init?.body).toBeInstanceOf(Blob);
    const request = new Request(url ?? '', init);
    expect(request.headers.get('authorization')).toBeNull();
    expect(request.headers.get('x-tenant-id')).toBeNull();
    expect(request.headers.get('cookie')).toBeNull();
    expect(request.headers.get('content-type')).toBe('application/octet-stream');
    expect(await request.text()).toBe('abc');
  });
  it.each([blob, new File(['abc'], 'file.bin', { type: 'browser/mime-type' })])('File/Blob MIME cannot introduce unsigned Content-Type %#', async payload => {
    const send = vi.fn<StorageFetch>(() => Promise.resolve(response()));
    const session = { ...UPLOAD_SESSION, uploadHeaders: { 'If-None-Match': '*' } };
    await putMedia(session, payload, new AbortController().signal, send);
    const [url, init] = send.mock.calls[0] ?? [];
    const request = new Request(url ?? '', init);
    expect([...request.headers]).toEqual([['if-none-match', '*']]);
    expect(await request.text()).toBe('abc');
    expect(payload.type).toBe('browser/mime-type');
  });
  it('rejects forged unsafe targets before fetch even if a caller skips parsing', async () => {
    const send = vi.fn<StorageFetch>(() => Promise.resolve(response()));
    for (const override of [{ uploadUrl: 'http://insecure.test' }, { uploadHeaders: { Authorization: 'private' } }]) {
      expect(await putMedia({ ...UPLOAD_SESSION, ...override }, blob, new AbortController().signal, send)).toEqual({ ok: false, failure: { source: 'storage', kind: 'invalid_upload_target', status: null } });
    }
    expect(send).not.toHaveBeenCalled();
  });
  it.each([200, 403])('a device clock ahead of expiresAt allows the PUT and defers to storage status %s', async status => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2100-01-01T00:00:00Z'));
    expect(Date.parse(UPLOAD_SESSION.expiresAt)).toBeLessThan(Date.now());
    const send = vi.fn<StorageFetch>(() => Promise.resolve(response(status)));
    expect(await putMedia(UPLOAD_SESSION, blob, new AbortController().signal, send)).toEqual(status === 200
      ? { ok: true, data: null }
      : { ok: false, failure: { source: 'storage', kind: 'signed_url_rejected', status: 403 } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBe(UPLOAD_SESSION.uploadUrl);
    expect(send.mock.calls[0]?.[1].method).toBe('PUT');
  });
  it('already-aborted signal prevents any request', async () => {
    const send = vi.fn<StorageFetch>(() => Promise.resolve(response()));
    const controller = new AbortController(); controller.abort();
    expect(await putMedia(UPLOAD_SESSION, blob, controller.signal, send)).toEqual({ ok: false, failure: { source: 'storage', kind: 'aborted', status: null } });
    expect(send).not.toHaveBeenCalled();
  });
  it('active abort reaches fetch, stops the request and is distinct from network failure', async () => {
    const controller = new AbortController();
    let stopped = false;
    const send = vi.fn<StorageFetch>((_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => { stopped = true; reject(new DOMException('private URL', 'AbortError')); }, { once: true });
    }));
    const result = putMedia(UPLOAD_SESSION, blob, controller.signal, send);
    controller.abort();
    expect(await result).toEqual({ ok: false, failure: { source: 'storage', kind: 'aborted', status: null } });
    expect(stopped).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('abort resolves promptly even if a transport does not settle; late success is discarded', async () => {
    const controller = new AbortController();
    let resolve: ((value: StorageResponse) => void) | undefined;
    const send: StorageFetch = () => new Promise(r => { resolve = r; });
    const pending = putMedia(UPLOAD_SESSION, blob, controller.signal, send);
    controller.abort();
    const result = await pending;
    resolve?.(response());
    expect(result).toEqual({ ok: false, failure: { source: 'storage', kind: 'aborted', status: null } });
  });
  it('abort after completion cannot corrupt success and removes its listener', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const result = await putMedia(UPLOAD_SESSION, blob, controller.signal, () => Promise.resolve(response()));
    controller.abort();
    expect(result).toEqual({ ok: true, data: null });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
  it.each([
    [403, 'signed_url_rejected'], [412, 'upload_conflict'], [413, 'payload_too_large'], [415, 'unsupported_media_type'],
    [422, 'unprocessable_upload'], [500, 'unexpected_status'], [400, 'unexpected_status'],
  ])('classifies storage %s as %s without reading any error body', async (status, kind) => {
    const json = vi.fn(() => Promise.reject(new Error('body must never be read')));
    const text = vi.fn(() => Promise.reject(new Error('body must never be read')));
    const result = await putMedia(UPLOAD_SESSION, blob, new AbortController().signal, () => Promise.resolve({ ...response(status), json, text }));
    expect(result).toEqual({ ok: false, failure: { source: 'storage', kind, status } });
    expect(json).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled();
    if (!result.ok) {
      const copy = storageFailureCopy(result.failure);
      expect(copy).not.toContain('permiso');
      expect(copy).not.toContain('R2');
      expect(copy).not.toContain(UPLOAD_SESSION.uploadUrl);
      expect(copy).not.toContain('private/internal-object');
    }
  });
  it('does not expose exception details or log signed targets', async () => {
    const error = vi.spyOn(console, 'error'); const log = vi.spyOn(console, 'log');
    const result = await putMedia(UPLOAD_SESSION, blob, new AbortController().signal, () => Promise.reject(new Error(UPLOAD_SESSION.uploadUrl + ' private/internal-object')));
    expect(result).toEqual({ ok: false, failure: { source: 'storage', kind: 'network', status: null } });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(error).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
  });
  it.each([
    { ...response(302) }, { ...response(), redirected: true }, { ...response(), type: 'opaqueredirect' },
  ])('rejects unexpected redirects %#', async redirected => {
    const result = await putMedia(UPLOAD_SESSION, blob, new AbortController().signal, () => Promise.resolve(redirected));
    expect(result).toEqual({ ok: false, failure: { source: 'storage', kind: 'unexpected_redirect', status: redirected.status } });
  });
});
