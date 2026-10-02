import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import { ConfigIssuesPanel } from '@/features/auth/auth-gate';
import { AuthProvider } from '@/features/auth/auth-provider';
import { LandingPage } from '@/features/public/landing-page';
import { LoginLayout } from '@/features/public/login-layout';
import type { PublicEnvResult } from '@/shared/config/public-env';

import { AuthenticatedRoot } from './authenticated-root';

export interface AppProps {
  readonly envResult: PublicEnvResult;
}

function SessionArea({ envResult }: AppProps) {
  const { pathname } = useLocation();
  if (!envResult.ok || envResult.env.apiOrigin === null || envResult.env.clerkPublishableKey === null) {
    const panel = <ConfigIssuesPanel issues={envResult.ok ? 'missing_auth_config' : envResult.issues} />;
    return pathname === '/login' || pathname === '/login/'
      ? <LoginLayout>{panel}</LoginLayout>
      : <main className="app"><h1>TallerMecario</h1>{panel}</main>;
  }
  return <AuthProvider env={envResult.env}><Outlet /></AuthProvider>;
}

/** La landing no monta Clerk; login y rutas privadas comparten la sesión y el contexto G1–G5. */
export function App({ envResult }: AppProps) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route element={<SessionArea envResult={envResult} />}>
          <Route path="/login" element={<LoginLayout><AuthenticatedRoot isLogin /></LoginLayout>} />
          <Route path="*" element={<AuthenticatedRoot />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
