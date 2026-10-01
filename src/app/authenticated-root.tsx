import { BrowserRouter } from 'react-router-dom';

import { AuthGate } from '@/features/auth/auth-gate';
import { useAuthContext } from '@/features/auth/auth-provider';

import { AppRoutes } from './app-routes';
import { shellStatusOf } from './shell-status';

/**
 * Frontera entre la aplicación autenticada y las pantallas de sesión.
 *
 * Mientras `shellStatusOf` devuelva un estado, se monta el router con el shell; en cualquier otro
 * caso se delega en el `AuthGate` existente, que sigue siendo el dueño de esos estados.
 */
export function AuthenticatedRoot() {
  const { state, actions } = useAuthContext();
  const shellStatus = shellStatusOf(state);

  if (shellStatus === null) {
    return <AuthGate state={state} actions={actions} />;
  }

  const grantedPermissions = new Set(state.kind === 'ready' ? state.context?.permissions.map((permission) => permission.code) ?? [] : []);
  return (
    <BrowserRouter>
      <AppRoutes shellStatus={shellStatus} onSignOut={actions.onSignOut} grantedPermissions={grantedPermissions} onChangeWorkshop={actions.onChangeWorkshop} workshopName={state.kind === 'ready' ? state.context?.workshop.displayName : undefined} />
    </BrowserRouter>
  );
}
