import { array, id, nullable, object, type Parser } from '@/shared/crm/contract';
import { parseUploadTarget } from '@/shared/media/media-contract';
import type { ReceptionMediaDownload, ReceptionMediaDto, ReceptionOperationalMediaType } from './reception-operational-media-types';

export const parseOperationalMediaType: Parser<ReceptionOperationalMediaType> = value =>
  value === 'photo' || value === 'video' || value === 'video360' ? value : null;
// Syntax only; the backend owns the approved MIME/type and byte limits.
export const parseMediaMime: Parser<string> = value => typeof value === 'string' &&
  /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value) ? value : null;
export const parseMediaSize: Parser<number> = value => typeof value === 'number' &&
  Number.isSafeInteger(value) && value > 0 ? value : null;
export const parseMediaSortOrder: Parser<number> = value => typeof value === 'number' &&
  Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null;

/** RFC3339 with calendar validation; Date.parse alone normalizes invalid dates. */
export const parseMediaTimestamp: Parser<string> = value => {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const zone = match[7];
  if (days === undefined || day < 1 || day > days || Number(match[4]) > 23 ||
      Number(match[5]) > 59 || Number(match[6]) > 59 || zone === undefined ||
      (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) ||
      !Number.isFinite(Date.parse(value))) return null;
  return value; // Preserve precision/offset; the server normalizes capturedAt equivalence.
};
const parseDtoTimestamp: Parser<string> = value => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value) ? parseMediaTimestamp(value) : null;

export const parseReceptionMediaDto: Parser<ReceptionMediaDto> = object({
  mediaAssetId: id, mediaType: parseOperationalMediaType, mimeType: parseMediaMime,
  sizeBytes: nullable(parseMediaSize), capturedAt: nullable(parseDtoTimestamp),
  uploadedAt: nullable(parseDtoTimestamp),
  purpose: (value: unknown) => value === 'intake_evidence' ? 'intake_evidence' as const : null,
  sortOrder: parseMediaSortOrder,
});
export const parseReceptionMediaAssociation = object({ media: parseReceptionMediaDto });
// Array parsing preserves the backend's sortOrder, mediaAssetId, purpose ordering.
export const parseReceptionMediaList = object({ media: array(parseReceptionMediaDto) });
export const parseReceptionMediaDownload: Parser<ReceptionMediaDownload> = object({
  mediaAssetId: id,
  downloadUrl: (value: unknown) => typeof value === 'string' && /^https:\/\/[^/]/i.test(value) &&
    !/[\s\\]/.test(value) ? parseUploadTarget(value, {})?.uploadUrl ?? null : null,
  expiresAt: parseMediaTimestamp,
});
