import { expect, it } from 'vitest';
import { classifyFailure } from '@/shared/api/api-failure';
import { receptionCopy } from './reception-copy';

it.each(['SIGNATURE_MEDIA_NOT_FOUND', 'SIGNATURE_MEDIA_NOT_ELIGIBLE', 'SIGNATURE_MEDIA_ALREADY_USED'])(
  'legacy %s explains backend compatibility without requesting a removed action', code => {
    const failure = classifyFailure({ source: 'http', status: 409, code, requestId: 'request-test', retryAfterSeconds: null });
    expect(receptionCopy(failure)).toBe('El servidor requiere una versión anterior del flujo de recepción. Actualiza el backend antes de cerrar la recepción.');
  },
);

it.each([
  ['UPLOAD_NOT_FOUND_IN_STORAGE', 'No se confirmó la subida. Verifica la evidencia antes de volver a subirla.'],
  ['MEDIA_SIZE_TOO_LARGE', 'La evidencia excede el tamaño permitido por el servicio. Selecciona un archivo más pequeño.'],
  ['MEDIA_SIZE_INVALID', 'El tamaño de la evidencia no es válido. Revisa el archivo antes de volver a subirlo.'],
  ['MEDIA_TYPE_NOT_ALLOWED', 'El servicio no permite este tipo de evidencia.'],
  ['MIME_TYPE_NOT_ALLOWED', 'El servicio no permite este formato de archivo.'],
])('general media error %s describes evidence rather than a removed capture flow', (code, message) => {
  const failure = classifyFailure({ source: 'http', status: 400, code, requestId: 'request-test', retryAfterSeconds: null });
  expect(receptionCopy(failure)).toBe(message);
});
