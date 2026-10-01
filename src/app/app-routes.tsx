import { Navigate, Route, Routes } from 'react-router-dom';

import { ModulePlaceholderPage } from './module-placeholder-page';
import { DASHBOARD_PATH, NAVIGATION_ITEMS, isItemVisible, type GrantedPermissions } from './navigation';
import { NotFoundPage } from './not-found-page';
import { AppShell } from './shell/app-shell';
import type { ShellContextStatus } from './shell-status';

export interface AppRoutesProps {
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
export function AppRoutes({ shellStatus, onSignOut, grantedPermissions = null, onChangeWorkshop, workshopName }: AppRoutesProps) {
  return (
    <Routes>
      <Route element={<AppShell status={shellStatus} onSignOut={onSignOut} grantedPermissions={grantedPermissions} onChangeWorkshop={onChangeWorkshop} workshopName={workshopName} />}>
        <Route index element={<Navigate to={DASHBOARD_PATH} replace />} />
        {NAVIGATION_ITEMS.map((item) => (
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
