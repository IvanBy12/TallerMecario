import { storageFailureCopy } from './media-errors';
import type { UploadTaskState } from './upload-task-types';

/** Stable phase/recovery copy for a future status region; never announce every byte. */
export function uploadTaskCopy(state: UploadTaskState): string | null {
  switch (state.phase) {
    case 'idle': case 'disposed': return null;
    case 'preparing': return 'Preparando la carga.';
    case 'uploading': return 'Subiendo el archivo.';
    case 'completing': return 'Confirmando la carga.';
    case 'succeeded': return 'Carga confirmada.';
    case 'canceled': return state.recovery.kind === 'safe_local_restart' ? 'Carga cancelada.' :
      'Carga cancelada. Es necesario revisar su estado antes de volver a intentarlo.';
    case 'ambiguous': return 'No se pudo confirmar el resultado de la carga. Es necesario revisar su estado antes de volver a intentarlo.';
    case 'needs_restart': return state.failure.source === 'storage' && state.failure.kind === 'signed_url_rejected'
      ? 'El enlace de carga fue rechazado. Es necesario revisar la sesión antes de volver a intentarlo.'
      : 'La carga requiere revisión antes de iniciar una nueva sesión.';
    case 'failed':
      if (state.failure.source === 'storage' && state.recovery.kind === 'user_action') return storageFailureCopy(state.failure);
      if (state.failure.source === 'api') {
        switch (state.failure.kind) {
          case 'no_session': case 'unauthenticated': return 'Inicia sesión para continuar con la carga.';
          case 'tenant_access_denied': case 'active_membership_required': case 'tenant_selection_required':
            return 'Revisa el taller seleccionado para continuar con la carga.';
          case 'permission_denied': case 'action_forbidden': case 'forbidden_unknown':
            return 'No tienes permiso para realizar esta carga.';
          case 'rate_limited': return 'Se alcanzó el límite de solicitudes. Espera antes de continuar.';
        }
      }
      return 'No se pudo continuar con la carga. Revisa su estado antes de volver a intentarlo.';
  }
}
