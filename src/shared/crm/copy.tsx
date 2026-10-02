import type { ApiFailure } from '@/shared/api/api-failure';
const copy: Readonly<Record<string, string>> = {
  REQUEST_VALIDATION_FAILED: 'Revisa los datos ingresados.',
  PAYLOAD_TOO_LARGE: 'Los datos exceden el tamaño permitido.',
  CUSTOMER_NOT_FOUND: 'No se encontró el cliente o no está disponible para tu acceso.',
  VEHICLE_NOT_FOUND: 'No se encontró el vehículo o no está disponible para tu acceso.',
  VEHICLE_PLATE_ALREADY_EXISTS: 'Esta placa ya está registrada en el taller. Revisa la placa ingresada.',
  VEHICLE_OWNERSHIP_CONFLICT: 'No pudimos confirmar el propietario inicial. Revisa el cliente y consulta el vehículo antes de volver a enviarlo.',
  RESOURCE_VERSION_CONFLICT: 'El registro cambió. Conservamos tus campos editados; revisa la versión actual antes de guardar de nuevo.',
};
export function crmCopy(failure: ApiFailure) {
  if (failure.kind === 'unauthenticated' || failure.kind === 'no_session') return 'Tu sesión necesita verificarse. Vuelve a iniciar sesión.';
  if (failure.status === 403) return 'No tienes permiso para realizar esta operación en el taller.';
  if (failure.kind === 'rate_limited') return `Se alcanzó el límite de solicitudes. Espera ${String(failure.retryAfterSeconds ?? 5)} segundos antes de reintentar.`;
  if (failure.kind === 'network' || failure.kind === 'token_offline') return 'No hay conexión con el servicio. Conservamos los datos en esta pantalla. Verifica el resultado antes de volver a enviar.';
  if (failure.kind === 'timeout') return 'La operación tardó demasiado. Verifica el resultado antes de volver a enviarla.';
  if (failure.kind === 'server_error') return 'No pudimos completar la operación. Reintenta cuando el servicio esté disponible.';
  return (failure.code === null ? undefined : copy[failure.code]) ?? 'No pudimos completar la operación. Intenta nuevamente o contacta al soporte.';
}
export function CrmFailure({ failure }: { readonly failure: ApiFailure | null }) {
  return failure === null ? null : <div className="crm-error" role="alert"><p>{crmCopy(failure)}</p>{failure.requestId !== null && <p className="crm-support">Referencia de soporte: <code>{failure.requestId}</code></p>}</div>;
}
export function Forbidden() { return <p className="crm-error" role="alert">No tienes permiso para acceder a esta sección en el taller.</p>; }
export function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' }).format(date);
}
