import { describe, expect, it } from 'vitest';
import { evaluateStoragePressure, parseStorageQuota } from './storage-quota';

describe('origin quota validation', () => {
  it('accepts finite usage/quota and produces a normalized ratio', () => {
    expect(parseStorageQuota({ usage: 25, quota: 100 })).toEqual({ status: 'known', usageBytes: 25, quotaBytes: 100, ratio: 0.25 });
  });
  it('accepts zero usage without confusing it with unknown', () => {
    expect(parseStorageQuota({ usage: 0, quota: 100 })).toEqual({ status: 'known', usageBytes: 0, quotaBytes: 100, ratio: 0 });
  });
  it.each([
    { usage: 1, quota: 0 }, { usage: -1, quota: 100 }, { usage: 1, quota: -1 },
    { usage: NaN, quota: 100 }, { usage: 1, quota: Infinity }, { usage: Infinity, quota: 100 },
    { usage: 1, quota: NaN }, { quota: 100 }, { usage: 1 }, {},
    { usage: '1', quota: 100 }, { usage: 1, quota: '100' }, { usage: null, quota: 100 },
    null, undefined, [], true, 100,
  ])('degrades malformed estimate %# to unknown', value => {
    expect(parseStorageQuota(value)).toEqual({ status: 'unknown' });
  });
  it('clamps only ratio for overshoot without mutating raw browser data', () => {
    const raw = Object.freeze({ usage: 125, quota: 100 });
    expect(parseStorageQuota(raw)).toEqual({ status: 'known', usageBytes: 125, quotaBytes: 100, ratio: 1 });
    expect(raw).toEqual({ usage: 125, quota: 100 });
  });
  it('keeps extreme finite overshoot ratio within bounds', () => {
    expect(parseStorageQuota({ usage: Number.MAX_VALUE, quota: Number.MIN_VALUE })).toEqual({
      status: 'known', usageBytes: Number.MAX_VALUE, quotaBytes: Number.MIN_VALUE, ratio: 1,
    });
  });
  it('ignores usageDetails and all unknown fields without even reading their getters', () => {
    const raw = { usage: 10, quota: 100, get usageDetails() { throw new Error('private'); } };
    expect(parseStorageQuota(raw)).toEqual({ status: 'known', usageBytes: 10, quotaBytes: 100, ratio: 0.1 });
  });
  it('degrades throwing browser field getters safely', () => {
    expect(parseStorageQuota({ get usage() { throw new Error('private'); }, quota: 100 })).toEqual({ status: 'unknown' });
  });
});

describe('caller-defined storage pressure', () => {
  const known = parseStorageQuota({ usage: 80, quota: 100 });
  it('has no product thresholds even when storage is full', () => {
    for (const estimate of [known, parseStorageQuota({ usage: 100, quota: 100 }), parseStorageQuota(undefined)]) {
      expect(evaluateStoragePressure(estimate)).toBe('unconfigured');
      expect(evaluateStoragePressure(estimate, {})).toBe('unconfigured');
    }
  });
  it('uses an inclusive caller warning threshold', () => {
    expect(evaluateStoragePressure(known, { warningRatio: 0.8 })).toBe('warning');
    expect(evaluateStoragePressure(known, { warningRatio: 0.9 })).toBe('normal');
  });
  it('prioritizes critical over warning, including equal thresholds', () => {
    expect(evaluateStoragePressure(known, { warningRatio: 0.5, criticalRatio: 0.8 })).toBe('critical');
    expect(evaluateStoragePressure(known, { warningRatio: 0.8, criticalRatio: 0.8 })).toBe('critical');
    expect(evaluateStoragePressure(known, { criticalRatio: 0.8 })).toBe('critical');
  });
  it('supports boundary thresholds at zero and one', () => {
    expect(evaluateStoragePressure(parseStorageQuota({ usage: 0, quota: 100 }), { warningRatio: 0 })).toBe('warning');
    expect(evaluateStoragePressure(parseStorageQuota({ usage: 100, quota: 100 }), { criticalRatio: 1 })).toBe('critical');
  });
  it('does not infer pressure from an unknown estimate', () => {
    expect(evaluateStoragePressure({ status: 'unknown' }, { warningRatio: 0.8 })).toBe('unknown');
  });
  it.each([
    { warningRatio: -0.1 }, { warningRatio: 1.1 }, { warningRatio: NaN }, { warningRatio: Infinity },
    { criticalRatio: -0.1 }, { criticalRatio: 1.1 }, { criticalRatio: NaN }, { criticalRatio: Infinity },
    { warningRatio: 0.9, criticalRatio: 0.8 },
  ])('rejects invalid policy %# without warning or throwing', policy => {
    expect(evaluateStoragePressure(known, policy)).toBe('invalid_policy');
  });
  it('degrades throwing policy getters without exposing details', () => {
    expect(evaluateStoragePressure(known, { get warningRatio(): number { throw new Error('private'); } })).toBe('invalid_policy');
  });
});
