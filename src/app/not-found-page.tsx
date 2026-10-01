import { Link, useLocation } from 'react-router-dom';

import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';

import { DASHBOARD_PATH } from './navigation';

/** Ruta desconocida dentro del shell: conserva la navegación para poder salir del error. */
export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <>
      <PageHeader
        title="Página no encontrada"
        description="La dirección solicitada no corresponde a ninguna sección de TallerMecario."
      />
      <EmptyState
        title="Ruta no reconocida"
        description={`Ninguna sección responde a la ruta ${pathname}.`}
        action={
          <Link className="ui-button" to={DASHBOARD_PATH}>
            Volver al panel
          </Link>
        }
      />
    </>
  );
}
