import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { ConfigIssuesPanel } from '@/features/auth/auth-gate';
import { AuthProvider } from '@/features/auth/auth-provider';
import { LandingPage } from '@/features/public/landing-page';
import { LoginLayout } from '@/features/public/login-layout';
import type { PublicEnvResult } from '@/shared/config/public-env';

import { AuthenticatedRoot } from './authenticated-root';

export interface AppProps {
  readonly envResult: PublicEnvResult;
}

function SessionArea({ envResult, isLogin = false }: AppProps & { readonly isLogin?: boolean }) {
  if (!envResult.ok) {
    return <div className="app"><h2>TallerMecario</h2><ConfigIssuesPanel issues={envResult.issues} /></div>;
  }
  return <AuthProvider env={envResult.env}><AuthenticatedRoot isLogin={isLogin} /></AuthProvider>;
}

/** La landing se renderiza sin Clerk ni contexto; la frontera autenticada conserva G1–G5. */
export function App({ envResult }: AppProps) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginLayout><SessionArea envResult={envResult} isLogin /></LoginLayout>} />
        <Route path="*" element={
          envResult.ok
            ? <SessionArea envResult={envResult} />
            : <main className="app"><h1>TallerMecario</h1><ConfigIssuesPanel issues={envResult.issues} /></main>
        } />
      </Routes>
    </BrowserRouter>
  );
}
