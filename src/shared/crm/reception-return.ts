// Only this known internal destination participates in the intake/CRM flow.
export function receptionReturn(search: string): string | null {
  return new URLSearchParams(search).get('returnTo') === '/recepciones/nueva' ? '/recepciones/nueva' : null;
}
export const NEW_VEHICLE_FROM_RECEPTION = '/vehiculos/nuevo?returnTo=%2Frecepciones%2Fnueva';
export const NEW_CUSTOMER_FROM_RECEPTION = '/clientes/nuevo?returnTo=%2Frecepciones%2Fnueva';
