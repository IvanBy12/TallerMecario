import type { DashboardActivityItem, DashboardSnapshot } from './dashboard-types';

/**
 * Puerto de datos del Dashboard. Todavía no existe un endpoint backend: la implementación actual
 * es el mock de este archivo. Cuando exista la API, basta otra implementación de este puerto
 * (sin tocar componentes). `load` debe rechazar si la señal se aborta o la lectura falla.
 */
export interface DashboardDataSource {
  /** Es true cuando los datos son de demostración (no hay backend): la UI lo declara. */
  readonly isDemo?: boolean;
  load(signal: AbortSignal): Promise<DashboardSnapshot>;
}

export interface MockDashboardOptions {
  /** Latencia simulada, para poder ver el estado de carga. */
  readonly delayMs?: number;
  readonly now?: () => Date;
}

const MINUTE = 60_000;

/**
 * Datos de demostración, sintéticos y deterministas. No representan ningún taller real y están
 * aislados aquí: ningún componente visual contiene datos de ejemplo.
 */
export function createMockDashboardDataSource(options: MockDashboardOptions = {}): DashboardDataSource {
  const { delayMs = 350, now = () => new Date() } = options;
  return {
    isDemo: true,
    load(signal) {
      return new Promise<DashboardSnapshot>((resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException('Lectura cancelada', 'AbortError'));
          return;
        }
        const onAbort = () => {
          clearTimeout(timer);
          reject(new DOMException('Lectura cancelada', 'AbortError'));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          resolve(buildMockSnapshot(now()));
        }, delayMs);
        signal.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
}

function buildMockSnapshot(now: Date): DashboardSnapshot {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE).toISOString();
  const activity: readonly DashboardActivityItem[] = [
    { id: 'a1', event: 'reception_created', plate: 'DEMO-001', vehicle: 'Mazda 3 2019', customer: 'Cliente demo 01', occurredAt: ago(6) },
    { id: 'a2', event: 'ready_for_delivery', plate: 'DEMO-002', vehicle: 'Renault Duster 2021', customer: 'Cliente demo 02', occurredAt: ago(34) },
    { id: 'a3', event: 'awaiting_authorization', plate: 'DEMO-003', vehicle: 'Chevrolet Spark 2017', customer: 'Cliente demo 03', occurredAt: ago(75) },
    { id: 'a4', event: 'repair_started', plate: 'DEMO-004', vehicle: 'Kia Picanto 2020', customer: 'Cliente demo 04', occurredAt: ago(140) },
    { id: 'a5', event: 'quote_sent', plate: 'DEMO-005', vehicle: 'Toyota Hilux 2018', customer: 'Cliente demo 05', occurredAt: ago(260) },
    { id: 'a6', event: 'diagnosis_started', plate: 'DEMO-006', vehicle: 'Nissan Versa 2022', customer: 'Cliente demo 06', occurredAt: ago(1500) },
  ];
  return {
    kpis: [
      { id: 'receptions_today', value: 6 },
      { id: 'in_diagnosis', value: 3 },
      { id: 'in_repair', value: 4 },
      { id: 'awaiting_authorization', value: 2 },
      { id: 'ready_for_delivery', value: 2 },
    ],
    activity,
    pendingWork: [
      { id: 'pending_diagnosis', count: 3 },
      { id: 'quotes_to_prepare', count: 2 },
      { id: 'pending_authorizations', count: 2 },
      { id: 'ready_for_delivery', count: 2 },
    ],
  };
}

/** Instancia por defecto mientras no exista backend de Dashboard. */
export const mockDashboardDataSource: DashboardDataSource = createMockDashboardDataSource();
