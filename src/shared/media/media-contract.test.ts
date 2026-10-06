import { describe, expect, it } from 'vitest';
import { CONFIRMED_MEDIA, UPLOAD_DTO, UPLOAD_SESSION } from '@/test/media-fixtures';
import { parseActiveMedia, parseUploadSession, parseUploadTarget } from './media-contract';

describe('media contract parsing', () => {
  it('accepts the existing HTTPS session DTO and discards objectKey and unknown fields', () => {
    const session = parseUploadSession({ ...UPLOAD_DTO, internal: 'private' });
    expect(session).toEqual(UPLOAD_SESSION);
    expect(session).not.toHaveProperty('objectKey');
    expect(session).not.toHaveProperty('internal');
    expect(Object.isFrozen(session)).toBe(true);
    expect(Object.isFrozen(session?.uploadHeaders)).toBe(true);
  });
  it.each([
    'http://storage.example.test/object', 'https://user:password@storage.example.test/object',
    'https://user@storage.example.test/object', 'ftp://storage.example.test/object',
    '//storage.example.test/object', 'invalid', 'https://storage.example.test/object#fragment',
    'https://storage.example.test/object#', ' https://storage.example.test/object',
    'https://storage.example.test/\nobject',
  ])('rejects unsafe upload URL %s', uploadUrl => {
    expect(parseUploadSession({ ...UPLOAD_DTO, uploadUrl })).toBeNull();
  });
  it.each([
    'Authorization', 'AUTHORIZATION', 'x-tenant-id', 'X-Tenant-ID', 'Cookie', 'COOKIE',
    'Host', 'Content-Length', 'Origin', 'Referer', 'Sec-Fetch-Site', 'Proxy-Authorization',
    'Set-Cookie', 'X-HTTP-Method-Override', 'User-Agent', 'Permissions-Policy',
  ])('rejects dangerous upload header %s', name => {
    expect(parseUploadSession({ ...UPLOAD_DTO, uploadHeaders: { [name]: 'forbidden' } })).toBeNull();
  });
  it.each([
    { 'Content-Type': 'a', 'content-type': 'b' }, { 'Bad Header': 'a' },
    { 'Content-Type': ' a ' }, { 'X-Test': 'a\r\nb' }, { 'X-Test': 42 },
    { 'X-Test': '漢' }, [], null,
  ])('rejects invalid or browser-normalized upload headers %#', uploadHeaders => {
    expect(parseUploadSession({ ...UPLOAD_DTO, uploadHeaders })).toBeNull();
  });
  it.each([
    { uploadMethod: 'POST' }, { status: 'completed' }, { expiresAt: 'invalid' },
    { uploadSessionId: 'invalid' }, { mediaAssetId: 'invalid' }, { objectKey: '' },
  ])('retains the existing session shape checks %#', override => {
    expect(parseUploadSession({ ...UPLOAD_DTO, ...override })).toBeNull();
  });
  it('accepts a signed contract without Content-Type and does not invent headers', () => {
    expect(parseUploadTarget(UPLOAD_SESSION.uploadUrl, {})).toEqual({ uploadUrl: UPLOAD_SESSION.uploadUrl, uploadHeaders: {} });
  });
  it('does not mutate the response headers', () => {
    const uploadHeaders = { 'X-Approved': 'opaque' };
    const session = parseUploadSession({ ...UPLOAD_DTO, uploadHeaders });
    uploadHeaders['X-Approved'] = 'changed';
    expect(session?.uploadHeaders).toEqual({ 'X-Approved': 'opaque' });
  });
  it('retains only confirmed completion fields', () => {
    expect(parseActiveMedia({ ...CONFIRMED_MEDIA, objectKey: 'private', uploadUrl: UPLOAD_SESSION.uploadUrl })).toEqual(CONFIRMED_MEDIA);
  });
  it.each([
    { status: 'pending' }, { mediaAssetId: 'invalid' }, { sizeBytes: 0 },
    { sizeBytes: Number.MAX_SAFE_INTEGER + 1 }, { checksumSha256: 'invalid' },
  ])('rejects unconfirmed or invalid completion %#', override => {
    expect(parseActiveMedia({ ...CONFIRMED_MEDIA, ...override })).toBeNull();
  });
});
