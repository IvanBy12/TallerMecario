import type { UploadSession } from '@/shared/media/media-types';

export const MEDIA_ID = 'a1111111-1111-4111-8111-111111111111';
export const SESSION_ID = 'b2222222-2222-4222-8222-222222222222';
export const UPLOAD_SESSION: UploadSession = {
  uploadSessionId: SESSION_ID,
  mediaAssetId: MEDIA_ID,
  status: 'pending',
  uploadUrl: 'https://storage.example.test/private-object?presigned=synthetic-secret',
  uploadMethod: 'PUT',
  uploadHeaders: { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' },
  expiresAt: '2099-10-06T12:00:00.000000Z',
};
export const UPLOAD_DTO = { ...UPLOAD_SESSION, objectKey: 'private/internal-object' };
export const CONFIRMED_MEDIA = { mediaAssetId: MEDIA_ID, status: 'active' as const, sizeBytes: 3, checksumSha256: null };
