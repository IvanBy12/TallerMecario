import { afterEach, describe, expect, it, vi } from 'vitest';
import { readBrowserStorageCapabilities, requestPersistence } from './storage-capabilities';
import capabilitiesSource from './storage-capabilities.ts?raw';
import quotaSource from './storage-quota.ts?raw';
import typesSource from './storage-types.ts?raw';

afterEach(() => { vi.unstubAllGlobals(); });

function setStorage(storage: unknown) { vi.stubGlobal('navigator', { storage }); }

const unavailable = {
  support: 'unavailable', estimateSupport: 'unsupported', quota: { status: 'unknown' },
  persistenceStatus: 'unsupported', persistenceRequestSupport: 'unsupported',
};

describe('browser storage capability snapshots', () => {
  it('handles a missing navigator', async () => {
    vi.stubGlobal('navigator', undefined);
    expect(await readBrowserStorageCapabilities()).toEqual(unavailable);
    expect(await requestPersistence()).toEqual({ status: 'unsupported' });
  });
  it('handles missing navigator.storage', async () => {
    vi.stubGlobal('navigator', {});
    expect(await readBrowserStorageCapabilities()).toEqual(unavailable);
  });
  it.each([null, undefined, [], 'invalid', 42])('handles malformed storage %#', async storage => {
    setStorage(storage);
    expect(await readBrowserStorageCapabilities()).toEqual(unavailable);
  });
  it('handles a throwing navigator.storage getter', async () => {
    vi.stubGlobal('navigator', { get storage() { throw new Error('private'); } });
    expect(await readBrowserStorageCapabilities()).toEqual(unavailable);
    expect(await requestPersistence()).toEqual({ status: 'unsupported' });
  });
  it('handles missing methods independently', async () => {
    setStorage({});
    expect(await readBrowserStorageCapabilities()).toEqual({ ...unavailable, support: 'available' });
  });
  it('does not infer persistence support from estimate', async () => {
    const estimate = vi.fn().mockResolvedValue({ usage: 20, quota: 100 });
    setStorage({ estimate });
    expect(await readBrowserStorageCapabilities()).toEqual({
      support: 'available', estimateSupport: 'available',
      quota: { status: 'known', usageBytes: 20, quotaBytes: 100, ratio: 0.2 },
      persistenceStatus: 'unsupported', persistenceRequestSupport: 'unsupported',
    });
    expect(estimate).toHaveBeenCalledExactlyOnceWith();
  });
  it('does not infer estimate or status support from persist', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setStorage({ persist });
    expect(await readBrowserStorageCapabilities()).toEqual({
      ...unavailable, support: 'available', persistenceRequestSupport: 'available',
    });
    expect(persist).not.toHaveBeenCalled();
  });
  it('does not infer request support from persisted', async () => {
    setStorage({ persisted: () => true });
    expect(await readBrowserStorageCapabilities()).toEqual({
      ...unavailable, support: 'available', persistenceStatus: 'granted',
    });
  });
  it.each(['throw', 'reject'])('degrades estimate %s without losing independent persistence', async failure => {
    setStorage({
      estimate: () => { if (failure === 'throw') throw new Error('private'); return Promise.reject(new Error('private')); },
      persisted: () => true,
    });
    expect(await readBrowserStorageCapabilities()).toEqual({
      ...unavailable, support: 'available', estimateSupport: 'available', persistenceStatus: 'granted',
    });
  });
  it('degrades malformed browser results', async () => {
    setStorage({ estimate: () => ({ usage: 1 }), persisted: () => 'true', persist: () => ({ granted: true }) });
    expect((await readBrowserStorageCapabilities()).quota).toEqual({ status: 'unknown' });
    expect((await readBrowserStorageCapabilities()).persistenceStatus).toBe('unknown');
    expect(await requestPersistence()).toEqual({ status: 'unknown' });
  });
  it('ignores non-callable and throwing method getters independently', async () => {
    setStorage({ estimate: 'invalid', get persisted() { throw new Error('private'); }, persist: false });
    expect(await readBrowserStorageCapabilities()).toEqual({ ...unavailable, support: 'available' });
    expect(await requestPersistence()).toEqual({ status: 'unsupported' });
  });
  it('keeps working methods when an unrelated method getter throws', async () => {
    setStorage({ estimate: () => ({ usage: 0, quota: 100 }), get persist() { throw new Error('private'); } });
    expect((await readBrowserStorageCapabilities()).quota).toEqual({ status: 'known', usageBytes: 0, quotaBytes: 100, ratio: 0 });
  });
  it.each([true, false])('represents persisted=%s as a browser decision', async granted => {
    setStorage({ persisted: vi.fn().mockResolvedValue(granted) });
    expect((await readBrowserStorageCapabilities()).persistenceStatus).toBe(granted ? 'granted' : 'not_granted');
  });
  it.each(['throw', 'reject'])('degrades persisted %s to unknown', async failure => {
    setStorage({ persisted: () => {
      if (failure === 'throw') throw new DOMException('private');
      return Promise.reject(new DOMException('private'));
    } });
    expect((await readBrowserStorageCapabilities()).persistenceStatus).toBe('unknown');
  });
  it('preserves native receivers for all three methods', async () => {
    const storage = {
      estimate() { expect(this).toBe(storage); return Promise.resolve({ usage: 1, quota: 2 }); },
      persisted() { expect(this).toBe(storage); return Promise.resolve(false); },
      persist() { expect(this).toBe(storage); return Promise.resolve(true); },
    };
    setStorage(storage);
    expect((await readBrowserStorageCapabilities()).quota.status).toBe('known');
    expect((await readBrowserStorageCapabilities()).persistenceStatus).toBe('not_granted');
    expect(await requestPersistence()).toEqual({ status: 'granted' });
  });
  it('refreshes only on explicit calls and retains no state that can race', async () => {
    let resolveA: (value: unknown) => void = () => {};
    const estimate = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; }))
      .mockResolvedValueOnce({ usage: 2, quota: 10 });
    setStorage({ estimate });
    const a = readBrowserStorageCapabilities();
    const b = await readBrowserStorageCapabilities();
    resolveA({ usage: 1, quota: 10 });
    expect((await a).quota).toEqual({ status: 'known', usageBytes: 1, quotaBytes: 10, ratio: 0.1 });
    expect(b.quota).toEqual({ status: 'known', usageBytes: 2, quotaBytes: 10, ratio: 0.2 });
    expect(estimate).toHaveBeenCalledTimes(2);
  });
  it('exports only generic storage data and discards media, identifiers and errors', async () => {
    setStorage({
      estimate: () => ({ usage: 1, quota: 10, usageDetails: { media: 1 }, filename: 'private',
        file: new File([], 'private'), blobUrl: 'blob:private', mediaAssetId: 'private',
        receptionId: 'private', tenantId: 'private', customerId: 'private', vehicleIdentifier: 'private' }),
      persisted: () => { throw new DOMException('private'); },
    });
    const state = await readBrowserStorageCapabilities();
    expect(state).toEqual({ support: 'available', estimateSupport: 'available',
      quota: { status: 'known', usageBytes: 1, quotaBytes: 10, ratio: 0.1 },
      persistenceStatus: 'unknown', persistenceRequestSupport: 'unsupported' });
    expect(JSON.stringify(state)).not.toContain('private');
  });
});

describe('explicit persistence requests', () => {
  it('returns unsupported when persist is missing', async () => {
    setStorage({ persisted: () => true });
    expect(await requestPersistence()).toEqual({ status: 'unsupported' });
  });
  it.each([true, false])('returns the explicit persist=%s decision', async granted => {
    const persist = vi.fn().mockResolvedValue(granted);
    setStorage({ persist });
    expect(await requestPersistence()).toEqual({ status: granted ? 'granted' : 'not_granted' });
    expect(persist).toHaveBeenCalledExactlyOnceWith();
  });
  it.each(['throw', 'reject'])('degrades persist %s without exposing an error or retrying', async failure => {
    const persist = vi.fn(() => {
      if (failure === 'throw') throw new DOMException('private');
      return Promise.reject(new DOMException('private'));
    });
    setStorage({ persist });
    expect(await requestPersistence()).toEqual({ status: 'unknown' });
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it('never requests automatically when reading capabilities repeatedly', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setStorage({ estimate: () => ({ usage: 1, quota: 2 }), persisted: () => false, persist });
    await readBrowserStorageCapabilities();
    await readBrowserStorageCapabilities();
    expect(persist).not.toHaveBeenCalled();
  });
  it('keeps repeated explicit calls independent and does not synthesize quota/status', async () => {
    const persist = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('private')).mockResolvedValueOnce(true);
    const estimate = vi.fn();
    const persisted = vi.fn();
    setStorage({ persist, estimate, persisted });
    expect(await requestPersistence()).toEqual({ status: 'not_granted' });
    expect(await requestPersistence()).toEqual({ status: 'unknown' });
    expect(await requestPersistence()).toEqual({ status: 'granted' });
    expect(persist).toHaveBeenCalledTimes(3);
    expect(estimate).not.toHaveBeenCalled();
    expect(persisted).not.toHaveBeenCalled();
  });
});

describe('storage foundation side-effect boundaries', () => {
  it('can be freshly imported without navigator and detects the environment on each call', async () => {
    vi.stubGlobal('navigator', undefined);
    vi.resetModules();
    const module = await vi.importActual<{ readBrowserStorageCapabilities: typeof readBrowserStorageCapabilities }>('./storage-capabilities');
    expect(await module.readBrowserStorageCapabilities()).toEqual(unavailable);
    setStorage({ estimate: () => ({ usage: 0, quota: 1 }) });
    expect((await module.readBrowserStorageCapabilities()).quota.status).toBe('known');
  });
  it('does not network, mutate storage, log diagnostics or schedule polling', async () => {
    const forbidden = vi.fn(() => { throw new Error('forbidden side effect'); });
    vi.stubGlobal('fetch', forbidden);
    vi.stubGlobal('XMLHttpRequest', forbidden);
    vi.stubGlobal('WebSocket', forbidden);
    vi.stubGlobal('indexedDB', { open: forbidden, deleteDatabase: forbidden });
    vi.stubGlobal('localStorage', { getItem: forbidden, setItem: forbidden, removeItem: forbidden, clear: forbidden });
    vi.stubGlobal('sessionStorage', { getItem: forbidden, setItem: forbidden, removeItem: forbidden, clear: forbidden });
    vi.stubGlobal('caches', { open: forbidden, delete: forbidden, match: forbidden, keys: forbidden });
    vi.stubGlobal('showDirectoryPicker', forbidden);
    vi.stubGlobal('setInterval', forbidden);
    vi.stubGlobal('setTimeout', forbidden);
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const storage = Object.freeze({ estimate: () => ({ usage: 1, quota: 10 }), persisted: () => false,
      persist: () => true, getDirectory: forbidden });
    vi.stubGlobal('navigator', { storage, serviceWorker: { register: forbidden }, sendBeacon: forbidden });
    const state = await readBrowserStorageCapabilities();
    expect(state.quota.status).toBe('known');
    expect(await requestPersistence()).toEqual({ status: 'granted' });
    expect(forbidden).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
  it('contains no persistence mechanisms, network APIs or polling in production modules', () => {
    const source = [capabilitiesSource, quotaSource, typesSource].join('\n');
    expect(source).not.toMatch(/indexedDB|localStorage|sessionStorage|caches|serviceWorker|showDirectoryPicker|getDirectory|FileSystemHandle|OPFS|fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|setInterval|setTimeout/);
  });
});
