import { id, record } from '@/shared/crm/contract';
import type { ConfirmedMedia, UploadSession, UploadTarget } from './media-types';

const nonempty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const time = (v: unknown): v is string => nonempty(v) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
// Browser-controlled/credential headers cannot be supplied by an upload session.
const FORBIDDEN_HEADERS = new Set([
  'authorization', 'x-tenant-id', 'cookie', 'cookie2', 'proxy-authorization',
  'accept-charset', 'accept-encoding', 'access-control-request-headers',
  'access-control-request-method', 'connection', 'content-length', 'date',
  'dnt', 'expect', 'host', 'keep-alive', 'origin', 'referer', 'set-cookie',
  'permissions-policy', 'user-agent',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'via',
  'x-http-method', 'x-http-method-override', 'x-method-override',
]);
const hasControl = (value: string) => Array.from(value).some(char => {
  const code = char.charCodeAt(0);
  return code <= 31 || code === 127;
});

/** No header allowlist or media limits are guessed: values come from the session.
 * Reject headers Fetch would ignore, merge or normalize into a different contract.
 */
export function parseUploadTarget(uploadUrl: unknown, uploadHeaders: unknown): UploadTarget | null {
  if (!nonempty(uploadUrl) || uploadUrl.trim() !== uploadUrl || hasControl(uploadUrl) ||
      uploadUrl.includes('#') || !record(uploadHeaders)) return null;
  try {
    const url = new URL(uploadUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
  } catch { return null; }

  const headers: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(uploadHeaders)) {
    const lower = name.toLowerCase();
    if (!HEADER_NAME.test(name) || FORBIDDEN_HEADERS.has(lower) || lower.startsWith('sec-') ||
        lower.startsWith('proxy-') || seen.has(lower) || typeof value !== 'string' ||
        value.trim() !== value || hasControl(value)) return null;
    // Headers also checks the browser's ByteString value constraints.
    try { new Headers({ [name]: value }); } catch { return null; }
    seen.add(lower);
    Object.defineProperty(headers, name, { value, enumerable: true });
  }
  return { uploadUrl, uploadHeaders: Object.freeze(headers) };
}

/** Extracted from Sprint 3. objectKey is validated but deliberately discarded. */
export function parseUploadSession(value: unknown): UploadSession | null {
  if (!record(value)) return null;
  const uploadSessionId = id(value['uploadSessionId']);
  const mediaAssetId = id(value['mediaAssetId']);
  if (uploadSessionId === null || mediaAssetId === null || value['status'] !== 'pending' ||
      value['uploadMethod'] !== 'PUT' || !nonempty(value['objectKey']) || !time(value['expiresAt'])) return null;
  const target = parseUploadTarget(value['uploadUrl'], value['uploadHeaders']);
  return target === null ? null : Object.freeze({
    uploadSessionId, mediaAssetId, status: 'pending', uploadMethod: 'PUT',
    ...target, expiresAt: value['expiresAt'],
  });
}

/** Existing Sprint 3 completion fields; no MIME, media type or retention guesses. */
export function parseActiveMedia(value: unknown): ConfirmedMedia | null {
  if (!record(value)) return null;
  const mediaAssetId = id(value['mediaAssetId']);
  if (mediaAssetId === null || value['status'] !== 'active' ||
      typeof value['sizeBytes'] !== 'number' || !Number.isSafeInteger(value['sizeBytes']) || value['sizeBytes'] <= 0 ||
      !(value['checksumSha256'] === null || (typeof value['checksumSha256'] === 'string' && /^[a-f0-9]{64}$/.test(value['checksumSha256'])))) return null;
  return { mediaAssetId, status: 'active', sizeBytes: value['sizeBytes'], checksumSha256: value['checksumSha256'] };
}
