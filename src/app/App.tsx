import { ConfigIssuesPanel } from '@/features/auth/auth-gate';
import { AuthProvider } from '@/features/auth/auth-provider';
import type { PublicEnvResult } from '@/shared/config/public-env';

import { AuthenticatedRoot } from './authenticated-root';

export interface AppProps {
  readonly envResult: PublicEnvResult;
}

/**
 * Composición raíz. Con configuración pública inválida se muestra el panel de configuración y no
 * se monta nada más; con configuración válida, `AuthProvider` abre la sesión y `AuthenticatedRoot`
 * decide entre la aplicación autenticada (shell + rutas) y las pantallas del `AuthGate`.
 */
export function App({ envResult }: AppProps) {
  if (!envResult.ok) {
    return (
      <main className="app">
        <h1>TallerMecario</h1>
        <ConfigIssuesPanel issues={envResult.issues} />
      </main>
    );
  }

  return (
    <AuthProvider env={envResult.env}>
      <AuthenticatedRoot />
    </AuthProvider>
  );
}
