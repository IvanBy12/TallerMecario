import type { ApiFailure } from '@/shared/api/api-failure';
const codeCopy: Readonly<Record<string, string>> = {
    PRIVACY_CONSENT_ALREADY_GRANTED: 'Ya existe una autorización vigente. Consultaremos la autorización registrada.',
    PRIVACY_CONSENT_NOT_ELIGIBLE: 'La autorización ya no cubre este ingreso. Obtén una nueva autorización.',
    PRIVACY_CONSENT_NOT_FOUND: 'No se encontró la autorización. Obtén una nueva autorización.',
    PRIVACY_NOTICE_NOT_CONFIGURED: 'El taller debe configurar su aviso de privacidad antes de recibir vehículos.',
    PRIVACY_DOCUMENT_VERSION_NOT_AVAILABLE: 'El documento presentado ya no está disponible. Vuelve a consultar el aviso.',
    RECEPTION_ALREADY_OPEN: 'Este vehículo ya tiene una recepción abierta.',
    RESOURCE_VERSION_CONFLICT: 'La recepción cambió. Conservamos tus datos; revisa la versión actual antes de guardar de nuevo.',
    RECEPTION_NOT_EDITABLE: 'Esta recepción ya no está abierta. La edición está bloqueada.',
    VEHICLE_OWNERSHIP_CONFLICT: 'El propietario vigente cambió. Confirma el propietario antes de continuar.',
    RECEPTION_MILEAGE_CONFLICT: 'El kilometraje es menor al registrado para el vehículo. Revisa el valor ingresado.',
    RECEPTION_NOT_FOUND: 'No se encontró la recepción o no está disponible para tu acceso.',
    VEHICLE_NOT_FOUND: 'No se encontró el vehículo.', CUSTOMER_NOT_FOUND: 'No se encontró el cliente.',
    REQUEST_VALIDATION_FAILED: 'Revisa los datos ingresados.', PAYLOAD_TOO_LARGE: 'Los datos exceden el tamaño permitido.',
};
export function receptionCopy(failure: ApiFailure): string {
    if (failure.kind === 'unauthenticated' || failure.kind === 'no_session')
        return 'Tu sesión necesita verificarse. Vuelve a iniciar sesión.';
    if (failure.status === 403)
        return 'No tienes permiso para realizar esta operación en el taller.';
    if (failure.kind === 'rate_limited')
        return `Se alcanzó el límite de solicitudes. Espera ${String(failure.retryAfterSeconds ?? 5)} segundos antes de reintentar.`;
    if (failure.kind === 'server_error')
        return 'No pudimos completar la operación. Reintenta cuando el servicio esté disponible.';
    if (failure.kind === 'network' || failure.kind === 'token_offline')
        return 'No hay conexión con el servicio. Conservamos los datos en esta pantalla.';
    if (failure.kind === 'timeout')
        return 'La operación tardó demasiado. Verifica el resultado antes de volver a enviarla.';
    return (failure.code === null ? undefined : codeCopy[failure.code]) ?? 'No pudimos completar la operación. Intenta nuevamente o contacta al soporte.';
}
