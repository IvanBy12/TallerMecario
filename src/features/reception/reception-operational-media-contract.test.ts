import { describe, expect, it } from 'vitest';
import { MEDIA_ID, SESSION_ID, UPLOAD_SESSION } from '@/test/media-fixtures';
import { parseMediaTimestamp, parseReceptionMediaAssociation, parseReceptionMediaDownload,
  parseReceptionMediaDto, parseReceptionMediaList } from './reception-operational-media-contract';

const time = '2026-10-09T12:00:00.123456Z';
const dto = { mediaAssetId: MEDIA_ID, mediaType: 'photo', mimeType: 'image/png',
  sizeBytes: 3, capturedAt: time, uploadedAt: time, purpose: 'intake_evidence', sortOrder: 0 };
const download = { mediaAssetId: MEDIA_ID, downloadUrl: UPLOAD_SESSION.uploadUrl, expiresAt: time };

describe('reception operational media contracts', () => {
  it.each(['photo', 'video', 'video360'])('accepts canonical intake %s and projects only published fields', mediaType => {
    const value = { ...dto, mediaType };
    expect(parseReceptionMediaDto({ ...value, bucket: 'private', objectKey: 'private/key',
      uploadUrl: UPLOAD_SESSION.uploadUrl, tenantId: SESSION_ID, checksumSha256: 'private' })).toEqual(value);
    expect(parseReceptionMediaAssociation({ media: value, internal: true })).toEqual({ media: value });
  });
  it('accepts explicit nulls published by Phase B', () => {
    const value = { ...dto, capturedAt: null, uploadedAt: null, sizeBytes: null };
    expect(parseReceptionMediaDto(value)).toEqual(value);
  });
  it.each(Object.keys(dto))('requires field %s even when nullable', key => {
    const value = Object.fromEntries(Object.entries(dto).filter(([field]) => field !== key));
    expect(parseReceptionMediaDto(value)).toBeNull();
  });
  it.each([
    { mediaAssetId: 'bad' }, { mediaAssetId: MEDIA_ID.toUpperCase() },
    { mediaAssetId: '00000000-0000-0000-0000-000000000000' },
    { mediaAssetId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
    { mediaType: 'signature' }, { mediaType: 'unknown' }, { mediaType: null },
    { purpose: 'service_provision' }, { purpose: 'damage_evidence' }, { purpose: 'unknown' },
    { purpose: null }, { sortOrder: -1 }, { sortOrder: 1.5 }, { sortOrder: '0' },
    { sortOrder: 2147483648 }, { sortOrder: Number.MAX_SAFE_INTEGER + 1 },
    { sortOrder: null }, { sizeBytes: 0 }, { sizeBytes: -1 }, { sizeBytes: 1.5 },
    { sizeBytes: '3' }, { sizeBytes: Infinity }, { sizeBytes: Number.MAX_SAFE_INTEGER + 1 },
    { mimeType: '' }, { mimeType: 'image' }, { mimeType: 'image/png\r\nprivate' },
    { mimeType: ' image/png' }, { capturedAt: 'invalid' }, { uploadedAt: 'invalid' },
    { capturedAt: '2026-02-30T12:00:00.123456Z' },
    { uploadedAt: '2026-10-09T25:00:00.123456Z' },
    { uploadedAt: '2026-10-09T12:60:00.123456Z' },
    { capturedAt: '2026-10-09T12:00:00Z' },
    { capturedAt: '2026-10-09T12:00:00.123456-05:00' },
  ])('rejects malformed or unsafe media DTO %#', change => {
    const value = { ...dto, ...change };
    expect(parseReceptionMediaDto(value)).toBeNull();
    expect(parseReceptionMediaAssociation({ media: value })).toBeNull();
    expect(parseReceptionMediaList({ media: [dto, value] })).toBeNull();
  });
  it.each([null, [], {}, { media: null }, { media: {} }])('rejects malformed envelopes %#', value => {
    expect(parseReceptionMediaAssociation(value)).toBeNull();
    expect(parseReceptionMediaList(value)).toBeNull();
  });
  it('preserves multiple items in server order, including ties, without mutating them', () => {
    const media = [
      { ...dto, mediaAssetId: MEDIA_ID, sortOrder: 0 },
      { ...dto, mediaAssetId: SESSION_ID, sortOrder: 0, mediaType: 'video360', mimeType: 'video/mp4' },
      { ...dto, mediaAssetId: 'c3333333-3333-4333-8333-333333333333', sortOrder: 7 },
    ];
    const snapshot = structuredClone(media);
    expect(parseReceptionMediaList({ media })).toEqual({ media: snapshot });
    expect(media).toEqual(snapshot);
    expect(parseReceptionMediaList({ media: [] })).toEqual({ media: [] });
  });
  it('preserves legitimate RFC3339 capture offsets and microseconds', () => {
    expect(parseMediaTimestamp('2024-02-29T12:00:00.123456-05:00')).toBe('2024-02-29T12:00:00.123456-05:00');
    expect(parseMediaTimestamp('2026-10-09T12:00:00Z')).toBe('2026-10-09T12:00:00Z');
  });
  it.each(['2026-02-29T12:00:00Z', '2026-04-31T12:00:00Z', '2026-00-09T12:00:00Z',
    '2026-13-09T12:00:00Z', '2026-10-00T12:00:00Z', '2026-10-09T12:00:00',
    '2026-10-09', '2026-10-09T12:00:00+24:00', '2026-10-09T12:00:00+05:60',
    '2026-10-09T12:00:60Z'])('rejects invalid calendar/time %s', value => {
    expect(parseMediaTimestamp(value)).toBeNull();
  });
});

describe('transient signed download contract', () => {
  it('retains only media identity, HTTPS URL and expiry', () => {
    expect(parseReceptionMediaDownload({ ...download, bucket: 'private', objectKey: 'private/key',
      uploadUrl: 'private', tenantId: SESSION_ID })).toEqual(download);
  });
  it.each(['http://storage.test/object', 'ftp://storage.test/object', '//storage.test/object', 'invalid',
    'https://user:password@storage.test/object', 'https://user@storage.test/object',
    'https://storage.test/object#fragment', 'https://storage.test/object#',
    ' https://storage.test/object', 'https://storage.test/\nobject', 'https:object',
    'https:///object', 'https://storage.test/a b', 'https://storage.test/\\object'])('rejects unsafe URL %s', downloadUrl => {
    expect(parseReceptionMediaDownload({ ...download, downloadUrl })).toBeNull();
  });
  it.each([{ mediaAssetId: 'bad' }, { expiresAt: 'invalid' }, { expiresAt: null },
    { expiresAt: '2026-02-30T12:00:00Z' }, { downloadUrl: null }])('rejects malformed download %#', change => {
    expect(parseReceptionMediaDownload({ ...download, ...change })).toBeNull();
  });
  it.each(Object.keys(download))('requires download field %s', key => {
    const value = Object.fromEntries(Object.entries(download).filter(([field]) => field !== key));
    expect(parseReceptionMediaDownload(value)).toBeNull();
  });
});
