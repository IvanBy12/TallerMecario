import type { DashboardEventKind, DashboardKpiId, DashboardPendingId } from './dashboard-types';

export const KPI_LABELS: Record<DashboardKpiId, string> = {
  receptions_today: 'Recepciones hoy',
  in_diagnosis: 'En diagnóstico',
  in_repair: 'En reparación',
  awaiting_authorization: 'Esperando autorización',
  ready_for_delivery: 'Listos para entregar',
};

/** Evento mostrado y estado resultante (texto: el estado no depende del color). */
export const EVENT_COPY: Record<DashboardEventKind, { readonly event: string; readonly status: string }> = {
  reception_created: { event: 'Recepción creada', status: 'Recibido' },
  diagnosis_started: { event: 'Diagnóstico iniciado', status: 'En diagnóstico' },
  quote_sent: { event: 'Cotización enviada', status: 'Cotizado' },
  awaiting_authorization: { event: 'Esperando autorización', status: 'Por autorizar' },
  repair_started: { event: 'Reparación iniciada', status: 'En reparación' },
  ready_for_delivery: { event: 'Vehículo listo para entrega', status: 'Listo' },
};

export const PENDING_COPY: Record<DashboardPendingId, { readonly title: string; readonly hint: string }> = {
  pending_diagnosis: { title: 'Diagnósticos pendientes', hint: 'Vehículos recibidos que aún no tienen diagnóstico.' },
  quotes_to_prepare: { title: 'Cotizaciones por preparar', hint: 'Diagnósticos terminados sin cotización enviada.' },
  pending_authorizations: { title: 'Autorizaciones pendientes', hint: 'Cotizaciones enviadas esperando respuesta del cliente.' },
  ready_for_delivery: { title: 'Listos para entregar', hint: 'Vehículos terminados que el cliente aún no recoge.' },
};
