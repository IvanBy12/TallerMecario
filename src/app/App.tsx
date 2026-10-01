import type {
  PublicEnv,
  PublicEnvIssue,
  PublicEnvIssueReason,
  PublicEnvResult,
} from '@/shared/config/public-env';

const ISSUE_MESSAGES: Record<PublicEnvIssueReason, string> = {
  unknown_value: 'valor no permitido (usa local, staging o production).',
  invalid_origin:
    'debe ser un origen http(s) (esquema, host y puerto opcional), sin credenciales, sin ruta distinta de "/", sin parámetros ni fragmento.',
  https_required: 'debe usar https cuando VITE_APP_ENV no es local.',
};

export interface AppProps {
  readonly envResult: PublicEnvResult;
}

export function App({ envResult }: AppProps) {
  return (
    <main className="app">
      <h1>TallerMecario</h1>
      {envResult.ok ? (
        <BootstrapStatus env={envResult.env} />
      ) : (
        <ConfigIssues issues={envResult.issues} />
      )}
    </main>
  );
}

function BootstrapStatus({ env }: { readonly env: PublicEnv }) {
  return (
    <>
      <p>Base técnica del frontend. Esta pantalla solo verifica que la aplicación se ejecuta.</p>
      <dl>
        <dt>Entorno</dt>
        <dd>{env.appEnv}</dd>
        <dt>API del backend</dt>
        <dd>{env.apiOrigin === null ? 'No configurada' : 'Configurada'}</dd>
      </dl>
    </>
  );
}

function ConfigIssues({ issues }: { readonly issues: readonly PublicEnvIssue[] }) {
  return (
    <div role="alert">
      <h2>Configuración pública inválida</h2>
      <ul>
        {issues.map((issue) => (
          <li key={`${issue.variable}:${issue.reason}`}>
            <code>{issue.variable}</code>: {ISSUE_MESSAGES[issue.reason]}
          </li>
        ))}
      </ul>
    </div>
  );
}
