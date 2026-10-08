import type { StorageFailure, StorageFailureKind } from './media-types';

export function storageFailure(kind: StorageFailureKind, status: number | null = null): StorageFailure {
  return { source: 'storage', kind, status };
}

export function classifyStorageStatus(status: number): StorageFailure {
  switch (status) {
    // A bare 403 cannot prove expiry or frontend RBAC; report rejection of the signed target.
    case 403: return storageFailure('signed_url_rejected', status);
    case 412: return storageFailure('upload_conflict', status);
    case 413: return storageFailure('payload_too_large', status);
    case 415: return storageFailure('unsupported_media_type', status);
    case 422: return storageFailure('unprocessable_upload', status);
    default: return storageFailure('unexpected_status', status);
  }
}

/** Static copy only. No provider response body, URL, object key or exception message. */
export function storageFailureCopy(failure: StorageFailure): string | null {
  switch (failure.kind) {
    case 'aborted': return null;
    case 'network': return 'No se pudo conectar para subir el archivo.';
    case 'session_expired': return 'La sesión de carga venció. Inicia una nueva carga.';
    case 'signed_url_rejected': return 'El enlace de carga fue rechazado. Puede haber vencido; inicia una nueva carga.';
    case 'upload_conflict': return 'La carga requiere revisión antes de iniciar una nueva sesión.';
    case 'payload_too_large': return 'El archivo supera el tamaño permitido para esta carga.';
    case 'unsupported_media_type': return 'El formato del archivo no es compatible con esta carga.';
    case 'unprocessable_upload': return 'No se pudo validar el archivo subido.';
    case 'unexpected_status':
    case 'unexpected_redirect':
    case 'invalid_upload_target': return 'No se pudo subir el archivo.';
  }
}
