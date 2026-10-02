import { KPI_LABELS } from './dashboard-copy';
import { DashboardIcon, type DashboardIconName } from './dashboard-icon';
import type { DashboardKpi, DashboardKpiId } from './dashboard-types';

const KPI_ICONS: Record<DashboardKpiId, DashboardIconName> = {
  receptions_today: 'reception',
  in_diagnosis: 'diagnosis',
  in_repair: 'repair',
  awaiting_authorization: 'authorization',
  ready_for_delivery: 'delivery',
};

/** Tarjeta compacta de indicador: el dato se lee como «etiqueta, valor» sin depender del color. */
export function DashboardKpiCard({ kpi }: { readonly kpi: DashboardKpi }) {
  return (
    <li className="dash-kpi">
      <span className="dash-kpi__icon">
        <DashboardIcon name={KPI_ICONS[kpi.id]} />
      </span>
      <span className="dash-kpi__label">{KPI_LABELS[kpi.id]}</span>
      <strong className="dash-kpi__value">{kpi.value}</strong>
    </li>
  );
}

export function DashboardKpiGrid({ kpis }: { readonly kpis: readonly DashboardKpi[] }) {
  return (
    <section aria-labelledby="dash-kpis-title">
      <h2 className="dash-visually-hidden" id="dash-kpis-title">
        Indicadores de hoy
      </h2>
      <ul className="dash-kpis">
        {kpis.map((kpi) => (
          <DashboardKpiCard key={kpi.id} kpi={kpi} />
        ))}
      </ul>
    </section>
  );
}
