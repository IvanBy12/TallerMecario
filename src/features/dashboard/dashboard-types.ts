/** Permiso efectivo que habilita el Dashboard operativo (catálogo aprobado). */
export const DASHBOARD_OPERATIONAL_PERMISSION = 'dashboard.operational.read';
/**
 * Reservado para métricas comerciales futuras. Este ticket NO muestra ninguna métrica financiera:
 * la constante existe para que la ampliación no invente un código de permiso distinto.
 */
export const DASHBOARD_BUSINESS_PERMISSION = 'dashboard.business.read';

export type DashboardKpiId =
  | 'receptions_today'
  | 'in_diagnosis'
  | 'in_repair'
  | 'awaiting_authorization'
  | 'ready_for_delivery';

export interface DashboardKpi {
  readonly id: DashboardKpiId;
  readonly value: number;
}

export type DashboardEventKind =
  | 'reception_created'
  | 'diagnosis_started'
  | 'quote_sent'
  | 'awaiting_authorization'
  | 'repair_started'
  | 'ready_for_delivery';

export interface DashboardActivityItem {
  readonly id: string;
  readonly event: DashboardEventKind;
  readonly plate: string;
  readonly vehicle: string;
  readonly customer: string;
  /** Instante ISO-8601 del evento. */
  readonly occurredAt: string;
}

export type DashboardPendingId =
  | 'pending_diagnosis'
  | 'quotes_to_prepare'
  | 'pending_authorizations'
  | 'ready_for_delivery';

export interface DashboardPendingItem {
  readonly id: DashboardPendingId;
  readonly count: number;
}

/** Contrato de lectura del Dashboard. Una implementación API futura debe devolver esta forma. */
export interface DashboardSnapshot {
  readonly kpis: readonly DashboardKpi[];
  readonly activity: readonly DashboardActivityItem[];
  readonly pendingWork: readonly DashboardPendingItem[];
}

export function isSnapshotEmpty(snapshot: DashboardSnapshot): boolean {
  return (
    snapshot.activity.length === 0 &&
    snapshot.kpis.every((kpi) => kpi.value === 0) &&
    snapshot.pendingWork.every((item) => item.count === 0)
  );
}
