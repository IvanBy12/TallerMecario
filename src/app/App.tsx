import { AuthProvider } from '@/features/auth/auth-provider';
import { ConfigIssuesPanel } from '@/features/auth/auth-gate';
import type { PublicEnvResult } from '@/shared/config/public-env';

export interface AppProps {
  readonly envResult: PublicEnvResult;
}

export function App({ envResult }: AppProps) {
  return (
    <main className="app">
      <h1>TallerMecario</h1>
      {envResult.ok ? (
        <AuthProvider env={envResult.env} />
      ) : (
        <ConfigIssuesPanel issues={envResult.issues} />
      )}
    </main>
  );
}
