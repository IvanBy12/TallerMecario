import type { VideoIssueCode, VideoValidationPolicy } from './video-types';

export type VideoValidationResult = { readonly ok: true; readonly file: File } |
  { readonly ok: false; readonly code: VideoIssueCode };

/** Local UX checks, not security/content validation. Never infer MIME by suffix.
 * Without an allowlist, empty MIME proceeds to the browser decoder; with an
 * allowlist it must match explicitly (including '' if the consumer allows it).
 */
export function validateVideo(value: unknown, policy: VideoValidationPolicy = {}): VideoValidationResult {
  if ((policy.maxBytes !== undefined && (!Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 0)) ||
      (policy.maxDurationSeconds !== undefined && (!Number.isFinite(policy.maxDurationSeconds) || policy.maxDurationSeconds <= 0)) ||
      (policy.allowedMimeTypes !== undefined && (!Array.isArray(policy.allowedMimeTypes) ||
        !policy.allowedMimeTypes.every((type: unknown) => typeof type === 'string')))) {
    return { ok: false, code: 'invalid_policy' };
  }
  try {
    if (!(value instanceof File) || !Number.isSafeInteger(value.size) || value.size < 0) {
      return { ok: false, code: 'invalid_file' };
    }
    if (value.size === 0) return { ok: false, code: 'empty_file' };
    if (value.type !== '' && !/^video\/[^\s/]+$/i.test(value.type)) return { ok: false, code: 'not_video' };
    if (policy.allowedMimeTypes !== undefined && !policy.allowedMimeTypes.includes(value.type)) {
      return { ok: false, code: 'mime_not_allowed' };
    }
    if (policy.maxBytes !== undefined && value.size > policy.maxBytes) return { ok: false, code: 'too_large' };
    return { ok: true, file: value };
  } catch {
    return { ok: false, code: 'invalid_file' };
  }
}

export function validateVideoDuration(duration: number, policy: VideoValidationPolicy = {}): VideoIssueCode | null {
  if (!Number.isFinite(duration) || duration <= 0) return 'invalid_duration';
  if (policy.maxDurationSeconds !== undefined && duration > policy.maxDurationSeconds) return 'too_long';
  return null;
}

const issueCopy: Readonly<Record<VideoIssueCode, string>> = {
  invalid_policy: 'La configuración de selección no es válida. Contacta al soporte.',
  invalid_file: 'No se pudo leer este archivo. Selecciona un video del dispositivo.',
  empty_file: 'Este archivo está vacío. Selecciona otro video.',
  not_video: 'Este archivo no es una selección de video compatible.',
  mime_not_allowed: 'El formato no está permitido por la configuración de esta selección.',
  too_large: 'El video supera el tamaño configurado para esta selección.',
  metadata_unavailable: 'No se pudo obtener la duración del video. Selecciona otro archivo.',
  invalid_duration: 'La duración del video no es válida. Selecciona otro archivo.',
  too_long: 'El video supera la duración configurada para esta selección.',
};
export function videoIssueCopy(code: VideoIssueCode): string { return issueCopy[code]; }
