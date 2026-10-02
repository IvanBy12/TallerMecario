import { Link } from 'react-router-dom';

import { DashboardIcon, type DashboardIconName } from './dashboard-icon';
import type { DashboardRoutes } from './dashboard-routes';

export interface DashboardQuickActionsProps {
  readonly routes: DashboardRoutes;
  readonly can: (permission: string) => boolean;
}

interface QuickAction {
  readonly id: string;
  readonly label: string;
  readonly icon: DashboardIconName;
  readonly permission: string;
  /** `null` = el módulo todavía no tiene pantalla real: se muestra sin enlace. */
  readonly to: string | null;
}

/** Accesos rápidos: sólo enlazan a rutas que el router de la aplicación entrega como reales. */
export function DashboardQuickActions({ routes, can }: DashboardQuickActionsProps) {
  const actions: readonly QuickAction[] = [
    { id: 'new-reception', label: 'Nueva recepción', icon: 'plus', permission: 'receptions.create', to: routes.newReception },
    { id: 'receptions', label: 'Ver recepciones', icon: 'list', permission: 'receptions.read', to: routes.receptions },
    { id: 'customers', label: 'Clientes', icon: 'customer', permission: 'customers.read', to: routes.customers },
    { id: 'vehicles', label: 'Vehículos', icon: 'vehicle', permission: 'vehicles.read', to: routes.vehicles },
  ];
  const allowed = actions.filter((action) => can(action.permission));
  if (allowed.length === 0) return null;
  return (
    <section className="dash-panel" aria-labelledby="dash-actions-title">
      <h2 className="dash-panel__title" id="dash-actions-title">
        Accesos rápidos
      </h2>
      <ul className="dash-actions">
        {allowed.map((action) => (
          <li key={action.id}>
            {action.to === null ? (
              <span className="dash-action dash-action--soon">
                <DashboardIcon name={action.icon} />
                <span>{action.label}</span>
                <span className="dash-action__note">Próximamente</span>
              </span>
            ) : (
              <Link className="dash-action" to={action.to}>
                <DashboardIcon name={action.icon} />
                <span>{action.label}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
