import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { mockDashboardDataSource, type DashboardDataSource } from '@/features/dashboard/dashboard-data-source';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import type { DashboardRoutes } from '@/features/dashboard/dashboard-routes';
import { ReceptionProvider, type ReceptionRuntime } from '@/features/reception/reception-context';
import { ReceptionsListPage } from '@/features/reception/receptions-list-page';
import { ReceptionDetailPage } from '@/features/reception/reception-detail-page';
import { NewReceptionPage } from '@/features/reception/new-reception-page';

import { ModulePlaceholderPage } from './module-placeholder-page';
import { DASHBOARD_PATH, NAVIGATION_ITEMS, NEW_RECEPTION_PATH, RECEPTIONS_PATH, isItemVisible, type GrantedPermissions } from './navigation';
import { NotFoundPage } from './not-found-page';
import { AppShell } from './shell/app-shell';
import type { ShellContextStatus } from './shell-status';

/** Únicos destinos con pantalla real hoy; Clientes y Vehículos siguen siendo placeholders. */
const DASHBOARD_ROUTES: DashboardRoutes = { newReception: NEW_RECEPTION_PATH, receptions: RECEPTIONS_PATH, customers: null, vehicles: null };

export interface AppRoutesProps {
  readonly dashboardDataSource?: DashboardDataSource;
  readonly receptionRuntime?: ReceptionRuntime;
  readonly shellStatus: ShellContextStatus;
  readonly workshopName?: string;
  readonly onChangeWorkshop?: () => void;
  readonly grantedPermissions?: GrantedPermissions;
  readonly onSignOut: () => void;
}

/**
 * Tabla de rutas de la aplicación. El shell es la ruta de layout: todas las secciones y el 404 se
 * renderizan dentro de él. Las rutas se derivan de la estructura declarativa de navegación.
 */
export function AppRoutes({ dashboardDataSource = mockDashboardDataSource, shellStatus, onSignOut, grantedPermissions = null, onChangeWorkshop, workshopName, receptionRuntime }: AppRoutesProps) {
  return (
    <Routes>
      <Route element={<AppShell status={shellStatus} onSignOut={onSignOut} grantedPermissions={grantedPermissions} onChangeWorkshop={onChangeWorkshop} workshopName={workshopName} />}>
        <Route index element={<Navigate to={DASHBOARD_PATH} replace />} />
        <Route path={DASHBOARD_PATH} element={<DashboardPage workshopName={workshopName} context={receptionRuntime} dataSource={dashboardDataSource} routes={DASHBOARD_ROUTES} />} />
        <Route element={receptionRuntime === undefined ? <section><h1>Recepciones</h1><p role="status">Selecciona un taller para consultar recepciones.</p></section> : <ReceptionProvider key={`${receptionRuntime.identity}:${receptionRuntime.tenantId}:${JSON.stringify(receptionRuntime.permissions)}`} runtime={receptionRuntime}><Outlet /></ReceptionProvider>}>
          <Route path={RECEPTIONS_PATH} element={<ReceptionsListPage />} />
          <Route path={NEW_RECEPTION_PATH} element={<NewReceptionPage />} />
          <Route path="/recepciones/:receptionId" element={<ReceptionDetailPage />} />
        </Route>
        {NAVIGATION_ITEMS.filter((item) => item.id !== 'recepciones' && item.id !== 'panel').map((item) => (
          <Route
            key={item.id}
            path={item.path}
            element={isItemVisible(item, grantedPermissions) ? <ModulePlaceholderPage module={item} /> : <p role="alert">No tienes permiso para acceder a esta sección.</p>}
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

