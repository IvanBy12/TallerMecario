import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/shared/ui/empty-state';
import { StatusBanner } from '@/shared/ui/status-banner';

import { DashboardActivity } from './dashboard-activity';
import type { DashboardDataSource } from './dashboard-data-source';
import { DashboardIcon } from './dashboard-icon';
import { DashboardKpiGrid } from './dashboard-kpi-card';
import { DashboardPendingWork } from './dashboard-pending-work';
import { DashboardQuickActions } from './dashboard-quick-actions';
import type { DashboardRoutes } from './dashboard-routes';
import { DASHBOARD_OPERATIONAL_PERMISSION, isSnapshotEmpty } from './dashboard-types';
import { useDashboardSnapshot } from './use-dashboard-snapshot';

export interface DashboardPageProps {
  readonly workshopName?: string;
  /** Permisos efectivos (códigos) del contexto G5. La autorización es sólo por permiso, nunca por rol. */
  readonly grantedPermissions: ReadonlySet<string> | null;
  readonly dataSource: DashboardDataSource;
  readonly routes: DashboardRoutes;
  readonly now?: () => Date;
}

/**
 * Centro operativo del taller. El estado «forbidden» no monta el contenido ni lee datos: sin
 * `dashboard.operational.read` no se consulta la fuente.
 */
export function DashboardPage({ workshopName, grantedPermissions, dataSource, routes, now = () => new Date() }: DashboardPageProps) {
  const can = (permission: string) => grantedPermissions?.has(permission) === true;

  if (!can(DASHBOARD_OPERATIONAL_PERMISSION)) {
    return (
      <>
        <DashboardHeading workshopName={workshopName} />
        <section className="dash-forbidden" role="alert" aria-labelledby="dash-forbidden-title">
          <h2 className="dash-panel__title" id="dash-forbidden-title">
            Acceso restringido
          </h2>
          <p>No tienes permiso para acceder a esta sección.</p>
        </section>
      </>
    );
  }

  const newReceptionPath = can('receptions.create') ? routes.newReception : null;
  const cta =
    newReceptionPath !== null ? (
      <Link className="dash-cta" to={newReceptionPath}>
        <DashboardIcon name="plus" />
        Nueva recepción
      </Link>
    ) : undefined;

  return (
    <div className="dash">
      <DashboardHeading workshopName={workshopName} action={cta} />
      <DashboardContent dataSource={dataSource} routes={routes} can={can} now={now} cta={cta} />
    </div>
  );
}

function DashboardHeading({ workshopName, action }: { readonly workshopName?: string; readonly action?: ReactNode }) {
  return (
    <header className="dash-header">
      <div className="dash-header__text">
        {workshopName === undefined ? null : <p className="dash-header__workshop">{workshopName}</p>}
        <h1 className="dash-header__title">Resumen del taller</h1>
        <p className="dash-header__subtitle">Esto es lo que está pasando hoy</p>
      </div>
      {action === undefined ? null : <div className="dash-header__action">{action}</div>}
    </header>
  );
}

interface ContentProps {
  readonly dataSource: DashboardDataSource;
  readonly routes: DashboardRoutes;
  readonly can: (permission: string) => boolean;
  readonly now: () => Date;
  readonly cta: ReactNode;
}

function DashboardContent({ dataSource, routes, can, now, cta }: ContentProps) {
  const { state, retry } = useDashboardSnapshot(dataSource);
  const [renderedAt] = useState(now);

  if (state.kind === 'loading') {
    return (
      <div aria-busy="true">
        <p className="dash-visually-hidden" role="status">
          Cargando el resumen del taller…
        </p>
        <div className="dash-kpis dash-skeleton" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="dash-skeleton__block dash-skeleton__block--kpi" key={index} />
          ))}
        </div>
        <div className="dash-layout dash-skeleton" aria-hidden="true">
          <div className="dash-skeleton__block dash-skeleton__block--panel" />
          <div className="dash-skeleton__block dash-skeleton__block--panel" />
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <section className="dash-error" role="alert" aria-labelledby="dash-error-title">
        <h2 className="dash-panel__title" id="dash-error-title">
          No se pudo cargar el resumen
        </h2>
        <p>Ocurrió un problema al leer la actividad del taller. Puedes intentarlo de nuevo.</p>
        <button type="button" className="ui-button" onClick={retry}>
          Reintentar
        </button>
      </section>
    );
  }

  const { snapshot } = state;
  if (isSnapshotEmpty(snapshot)) {
    return (
      <EmptyState
        title="Todavía no hay actividad"
        description="Cuando registres la primera recepción del día, aquí verás los vehículos en proceso y el trabajo que requiere atención."
        action={cta ?? undefined}
      />
    );
  }

  return (
    <>
      {dataSource.isDemo === true ? (
        <StatusBanner tone="info" title="Datos de demostración">
          <p>El resumen todavía no está conectado al servidor: las cifras y la actividad son de ejemplo.</p>
        </StatusBanner>
      ) : null}
      <DashboardKpiGrid kpis={snapshot.kpis} />
      <div className="dash-layout">
        <DashboardActivity items={snapshot.activity} now={renderedAt} />
        <div className="dash-side">
          <DashboardPendingWork items={snapshot.pendingWork} />
          <DashboardQuickActions routes={routes} can={can} />
        </div>
      </div>
    </>
  );
}
