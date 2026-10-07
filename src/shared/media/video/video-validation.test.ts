import { describe, expect, it } from 'vitest';
import { validateVideo, validateVideoDuration } from './video-validation';
import type { VideoValidationPolicy } from './video-types';

// Synthetic fixtures; these formats/limits are not product/server defaults.
const file = (type = 'video/example', name = 'walk-around.fixture') => new File(['demo'], name, { type });

describe('local video validation', () => {
  it('preserves the exact original File', () => {
    const original = file();
    expect(validateVideo(original)).toEqual({ ok: true, file: original });
    const result = validateVideo(original);
    if (!result.ok) throw new Error('fixture rejected');
    expect(result.file).toBe(original);
  });
  it('has no MIME, size or duration product defaults', () => {
    expect(validateVideo(file('video/other-format')).ok).toBe(true);
    const large = file();
    Object.defineProperty(large, 'size', { value: 2 ** 40 });
    expect(validateVideo(large).ok).toBe(true);
    expect(validateVideoDuration(10 ** 8)).toBeNull();
  });
  it('allows empty MIME without policy regardless of extension', () => {
    expect(validateVideo(file('', 'no-extension')).ok).toBe(true);
    expect(validateVideo(file('', 'not-a-video.txt')).ok).toBe(true);
    expect(validateVideo(file('text/plain', 'video.mp4'))).toEqual({ ok: false, code: 'not_video' });
  });
  it('matches empty MIME consistently with an explicit allowlist', () => {
    expect(validateVideo(file(''), { allowedMimeTypes: ['video/example'] })).toEqual({ ok: false, code: 'mime_not_allowed' });
    expect(validateVideo(file(''), { allowedMimeTypes: [''] }).ok).toBe(true);
  });
  it('applies only the injected MIME policy', () => {
    expect(validateVideo(file(), { allowedMimeTypes: ['video/fixture'] })).toEqual({ ok: false, code: 'mime_not_allowed' });
    expect(validateVideo(file(), { allowedMimeTypes: [] })).toEqual({ ok: false, code: 'mime_not_allowed' });
    expect(validateVideo(file(), { allowedMimeTypes: ['video/example'] }).ok).toBe(true);
  });
  it('applies maxBytes inclusively', () => {
    expect(validateVideo(file(), { maxBytes: 3 })).toEqual({ ok: false, code: 'too_large' });
    expect(validateVideo(file(), { maxBytes: 4 }).ok).toBe(true);
  });
  it.each<VideoValidationPolicy>([
    { maxBytes: -1 }, { maxBytes: NaN }, { maxBytes: Infinity }, { maxBytes: 1.2 },
    { maxDurationSeconds: -1 }, { maxDurationSeconds: 0 }, { maxDurationSeconds: NaN }, { maxDurationSeconds: Infinity },
  ])('rejects invalid numeric policy %j', policy => {
    expect(validateVideo(file(), policy)).toEqual({ ok: false, code: 'invalid_policy' });
  });
  it('rejects malformed runtime MIME policy', () => {
    const policy: VideoValidationPolicy = {};
    Object.defineProperty(policy, 'allowedMimeTypes', { value: [42] });
    expect(validateVideo(file(), policy)).toEqual({ ok: false, code: 'invalid_policy' });
    const nonArray: VideoValidationPolicy = {};
    Object.defineProperty(nonArray, 'allowedMimeTypes', { value: 'video/example' });
    expect(validateVideo(file(), nonArray)).toEqual({ ok: false, code: 'invalid_policy' });
  });
  it.each([null, {}, new Blob(['video']), Object.create(File.prototype) as unknown])('rejects non-usable Files safely (%#)', value => {
    expect(validateVideo(value)).toEqual({ ok: false, code: 'invalid_file' });
  });
  it('rejects empty and known non-video files', () => {
    expect(validateVideo(new File([], 'demo'))).toEqual({ ok: false, code: 'empty_file' });
    expect(validateVideo(file('image/example'))).toEqual({ ok: false, code: 'not_video' });
  });
  it.each([NaN, Infinity, -Infinity, 0, -1])('rejects invalid duration %s', duration => {
    expect(validateVideoDuration(duration)).toBe('invalid_duration');
  });
  it('uses only a configured inclusive duration limit', () => {
    expect(validateVideoDuration(12, { maxDurationSeconds: 12 })).toBeNull();
    expect(validateVideoDuration(12.1, { maxDurationSeconds: 12 })).toBe('too_long');
  });
});
