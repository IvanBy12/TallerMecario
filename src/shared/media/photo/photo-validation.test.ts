import { describe, expect, it } from 'vitest';
import { validatePhoto } from './photo-validation';

const photo = (type = 'image/example', size = 3) => new File([new Uint8Array(size)], 'demo', { type });
describe('local photo validation', () => {
  it('preserves the original File without a default product allowlist/size cap', () => {
    const file = photo('image/vendor-format', 100_000);
    expect(validatePhoto(file)).toEqual({ ok: true, file });
  });
  it.each([null, {}, new Blob(['bytes']), 'a.jpg', Object.create(File.prototype)])('rejects unusable input safely (%#)', value => {
    expect(validatePhoto(value)).toEqual({ ok: false, code: 'invalid_file' });
  });
  it('rejects an empty file', () => { expect(validatePhoto(photo('image/example', 0))).toEqual({ ok: false, code: 'empty_file' }); });
  it('rejects known non-image MIME regardless of filename', () => {
    expect(validatePhoto(new File(['bytes'], 'image.jpg', { type: 'text/plain' }))).toEqual({ ok: false, code: 'not_image' });
  });
  it('accepts missing MIME conservatively without inspecting extension', () => {
    const file = photo(''); expect(validatePhoto(file)).toEqual({ ok: true, file });
    expect(validatePhoto(file, { allowedMimeTypes: ['image/example'] })).toEqual({ ok: false, code: 'mime_not_allowed' });
  });
  it('applies injected MIME policy', () => {
    expect(validatePhoto(photo(), { allowedMimeTypes: ['image/other'] })).toEqual({ ok: false, code: 'mime_not_allowed' });
    expect(validatePhoto(photo(), { allowedMimeTypes: [] })).toEqual({ ok: false, code: 'mime_not_allowed' });
  });
  it('applies injected byte limit inclusively', () => {
    expect(validatePhoto(photo(), { maxBytes: 2 })).toEqual({ ok: false, code: 'too_large' });
    expect(validatePhoto(photo(), { maxBytes: 3 }).ok).toBe(true);
  });
  it.each([{ maxBytes: -1 }, { maxFiles: 1.5 }, { maxBytes: Infinity }])('rejects invalid consumer policy (%#)', policy => {
    expect(validatePhoto(photo(), policy)).toEqual({ ok: false, code: 'invalid_policy' });
  });
});
