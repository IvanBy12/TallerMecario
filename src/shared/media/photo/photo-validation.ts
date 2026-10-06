import type { PhotoIssueCode, PhotoValidationPolicy } from './photo-types';

export type PhotoValidationResult = { readonly ok: true; readonly file: File } |
  { readonly ok: false; readonly code: PhotoIssueCode };

/** Metadata checks are local UX only, never byte inspection/server validation.
 * Empty MIME is accepted without an allowlist; the browser decoder may still
 * fail. With an explicit allowlist, empty MIME must be explicitly allowed.
 */
export function validatePhoto(value: unknown, policy: PhotoValidationPolicy = {}): PhotoValidationResult {
  if ((policy.maxBytes !== undefined && (!Number.isSafeInteger(policy.maxBytes) || policy.maxBytes < 0)) ||
      (policy.maxFiles !== undefined && (!Number.isSafeInteger(policy.maxFiles) || policy.maxFiles < 0))) {
    return { ok: false, code: 'invalid_policy' };
  }
  try {
    if (!(value instanceof File) || !Number.isSafeInteger(value.size) || value.size < 0) {
      return { ok: false, code: 'invalid_file' };
    }
    if (value.size === 0) return { ok: false, code: 'empty_file' };
    if (value.type !== '' && !/^image\/[^\s/]+$/i.test(value.type)) return { ok: false, code: 'not_image' };
    if (policy.allowedMimeTypes !== undefined && !policy.allowedMimeTypes.includes(value.type)) {
      return { ok: false, code: 'mime_not_allowed' };
    }
    if (policy.maxBytes !== undefined && value.size > policy.maxBytes) return { ok: false, code: 'too_large' };
    return { ok: true, file: value };
  } catch {
    // E.g. a forged File prototype: never expose browser exception messages.
    return { ok: false, code: 'invalid_file' };
  }
}

const issueCopy: Readonly<Record<PhotoIssueCode, string>> = {
  invalid_file: 'No se pudo leer este archivo. Selecciona una foto del dispositivo.',
  empty_file: 'Este archivo está vacío. Selecciona otra foto.',
  not_image: 'Este archivo no es una selección de imagen compatible.',
  mime_not_allowed: 'El formato no está permitido por la configuración de esta selección.',
  too_large: 'La foto supera el tamaño configurado para esta selección.',
  too_many: 'Se alcanzó la cantidad de fotos configurada para esta selección.',
  invalid_policy: 'La configuración de selección no es válida. Contacta al soporte.',
};
export function photoIssueCopy(code: PhotoIssueCode): string { return issueCopy[code]; }
