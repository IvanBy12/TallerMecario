import { Navigate } from 'react-router-dom';

import { AuthGate } from '@/features/auth/auth-gate';
import { useAuthContext } from '@/features/auth/auth-provider';
import { LoginLayout } from '@/features/public/login-layout';

import { AppRoutes } from './app-routes';
import { DASHBOARD_PATH } from './navigation';
import { shellStatusOf } from './shell-status';

/** Conserva los estados y permisos de G1–G5 dentro del router compartido. */
export function AuthenticatedRoot({ isLogin = false }: { readonly isLogin?: boolean }) {
  const { state, actions, apiClient } = useAuthContext();
  const shellStatus = shellStatusOf(state);

  if (shellStatus === null) {
    const gate = <AuthGate state={state} actions={actions} />;
    return isLogin ? gate : <LoginLayout>{gate}</LoginLayout>;
  }

  if (isLogin) {
    return <Navigate to={DASHBOARD_PATH} replace />;
  }

  const grantedPermissions = new Set(state.kind === 'ready' ? state.context?.permissions.map((permission) => permission.code) ?? [] : []);
  return <AppRoutes receptionRuntime={state.kind === 'ready' && state.context !== undefined ? { apiClient, identity: state.identity, tenantId: state.tenantId, permissions: state.context.permissions } : undefined} shellStatus={shellStatus} onSignOut={actions.onSignOut} grantedPermissions={grantedPermissions} onChangeWorkshop={actions.onChangeWorkshop} workshopName={state.kind === 'ready' ? state.context?.workshop.displayName : undefined} />;
}
