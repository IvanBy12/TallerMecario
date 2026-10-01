import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { PublicEnvIssue, PublicEnvIssueReason } from '@/shared/config/public-env';

import { ClerkSignInPanel } from './clerk-session';
import type { AuthState, ContextNotice, RecoverableReason } from './workshop-context';

export interface AuthGateActions {
  readonly onSignOut: () => void;
  /** `session_expired` → `signed_out` (la sesión ya terminó según Clerk). */
  readonly onSignInAgain: () => void;
  readonly onRetry: () => void;
  readonly onReload: () => void;
  readonly onDismissNotice: () => void;
}

export interface AuthGateProps {
  readonly state: AuthState;
  readonly actions: AuthGateActions;
}

const ISSUE_MESSAGES: Record<PublicEnvIssueReason, string> = {
  unknown_value: 'valor no permitido (usa local, staging o production).',
  invalid_origin:
    'debe ser un origen http(s) (esquema, host y puerto opcional), sin credenciales, sin ruta distinta de "/", sin parámetros ni fragmento.',
  https_required: 'debe usar https cuando VITE_APP_ENV no es local.',
  invalid_publishable_key:
    'debe ser la clave PUBLICABLE de Clerk (pk_test_… o pk_live_…); production exige pk_live_.',
};

const RECOVERABLE_MESSAGES: Record<RecoverableReason, string> = {
  offline: 'Sin conexión. Revisa tu red e inténtalo de nuevo.',
  network: 'No se pudo conectar con el servidor.',
  timeout: 'La operación tardó demasiado.',
  rate_limited: 'Demasiadas solicitudes. Espera unos segundos antes de reintentar.',
  server_error: 'El servidor no pudo completar la operación.',
  identity_client_error: 'Error al preparar tu sesión.',
};

const NOTICE_MESSAGES: Record<ContextNotice, string> = {
  workshop_access_revoked: 'Tu acceso al taller cambió. Verifica de nuevo.',
  workshop_changed: 'El taller activo cambió.',
};

/** Pantalla de configuración pública inválida: nombra la variable y el motivo, nunca el valor. */
export function ConfigIssuesPanel({ issues }: { readonly issues: readonly PublicEnvIssue[] | 'missing_auth_config' }) {
  return (
    <div role="alert">
      <h2>Configuración pública inválida</h2>
      {issues === 'missing_auth_config' ? (
        <p>
          Falta la configuración de autenticación: define <code>VITE_CLERK_PUBLISHABLE_KEY</code> y{' '}
          <code>VITE_API_BASE_URL</code>.
        </p>
      ) : (
        <ul>
          {issues.map((issue) => (
            <li key={`${issue.variable}:${issue.reason}`}>
              <code>{issue.variable}</code>: {ISSUE_MESSAGES[issue.reason]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestId({ value }: { readonly value: string | null }) {
  return value === null ? null : (
    <p>
      Referencia: <code>{value}</code>
    </p>
  );
}

function Notice({
  notice,
  onDismiss,
}: {
  readonly notice: ContextNotice;
  readonly onDismiss: () => void;
}) {
  return (
    <p role="status">
      {NOTICE_MESSAGES[notice]}{' '}
      <button type="button" onClick={onDismiss}>
        Descartar aviso
      </button>
    </p>
  );
}

/** *Reintentar* se habilita solo cuando se cumple la espera de `retryNotBefore`. */
function useRetryEnabled(retryNotBefore: number | null): boolean {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (retryNotBefore === null) {
      return undefined;
    }
    const remaining = retryNotBefore - Date.now();
    if (remaining <= 0) {
      // El plazo ya venció (p. ej. el estado llega con la marca superada): sincroniza el reloj
      // de inmediato para no dejar *Reintentar* deshabilitado por un `now` obsoleto.
      setNow(Date.now());
      return undefined;
    }
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, remaining);
    return () => {
      clearTimeout(timer);
    };
  }, [retryNotBefore]);
  return retryNotBefore === null || now >= retryNotBefore;
}

export function AuthGate({ state, actions }: AuthGateProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const retryNotBefore =
    state.kind === 'recoverable_error'
      ? state.retryNotBefore
      : state.kind === 'ready' && state.degraded !== null
        ? state.degraded.retryNotBefore
        : null;
  const retryEnabled = useRetryEnabled(retryNotBefore);
  const kind = state.kind;

  useEffect(() => {
    const heading = headingRef.current;
    if (heading !== null) {
      heading.focus();
    }
  }, [kind]);

  const heading = (text: string): ReactNode => (
    <h2 ref={headingRef} tabIndex={-1}>
      {text}
    </h2>
  );

  const signOutButton = (
    <button type="button" onClick={actions.onSignOut}>
      Cerrar sesión
    </button>
  );

  switch (state.kind) {
    case 'config_error':
      return <ConfigIssuesPanel issues={state.issues} />;

    case 'loading_identity':
      return (
        <div className="auth">
          {heading('TallerMecario')}
          <p role="status">Cargando sesión…</p>
        </div>
      );

    case 'signed_out':
      return (
        <div className="auth">
          {heading('Inicia sesión')}
          <ClerkSignInPanel />
        </div>
      );

    case 'signed_in_context_pending':
      return (
        <div className="auth">
          {heading('Sesión iniciada')}
          <p role="status">El acceso a talleres aún no está integrado.</p>
          {signOutButton}
        </div>
      );

    case 'loading_context':
      return (
        <div className="auth">
          {heading('Sesión iniciada')}
          {state.notice === null ? null : (
            <Notice notice={state.notice} onDismiss={actions.onDismissNotice} />
          )}
          <p role="status">Verificando acceso al taller…</p>
        </div>
      );

    case 'no_access':
      return (
        <div className="auth">
          {heading('Sin acceso a talleres')}
          {state.notice === null ? null : (
            <Notice notice={state.notice} onDismiss={actions.onDismissNotice} />
          )}
          <p role="alert">Tu cuenta no tiene acceso activo a un taller.</p>
          <button type="button" onClick={actions.onRetry} disabled={!retryEnabled}>
            Reintentar
          </button>
          {signOutButton}
        </div>
      );

    case 'workshop_selection_required':
      return (
        <div className="auth">
          {heading('Selecciona un taller')}
          {state.notice === null ? null : (
            <Notice notice={state.notice} onDismiss={actions.onDismissNotice} />
          )}
          <p role="status">
            Tu cuenta tiene acceso a varios talleres. La selección de taller aún no está disponible.
          </p>
          {signOutButton}
        </div>
      );

    case 'ready':
      return (
        <div className="auth">
          {heading('TallerMecario')}
          {state.notice === null ? null : (
            <Notice notice={state.notice} onDismiss={actions.onDismissNotice} />
          )}
          {state.degraded === null ? null : (
            <div>
              <p role="status">
                No se pudo verificar tu acceso. Reintenta.
                {state.degraded.reason === 'rate_limited' ? ' Espera unos segundos.' : ''}
              </p>
              <RequestId value={state.degraded.requestId} />
              <button type="button" onClick={actions.onRetry} disabled={!retryEnabled}>
                Reintentar
              </button>
            </div>
          )}
          <dl>
            <dt>Taller activo</dt>
            <dd>{state.tenantId}</dd>
          </dl>
          {signOutButton}
        </div>
      );

    case 'session_expired':
      return (
        <div className="auth">
          {heading('Sesión terminada')}
          <p role="status">Tu sesión terminó.</p>
          <button type="button" onClick={actions.onSignInAgain}>
            Iniciar sesión
          </button>
        </div>
      );

    case 'auth_rejected':
      return (
        <div className="auth">
          {heading('Sesión no aceptada')}
          <p role="alert">El servidor no aceptó tu sesión.</p>
          <RequestId value={state.requestId} />
          <button type="button" onClick={actions.onRetry} disabled={!retryEnabled}>
            Reintentar
          </button>
          {signOutButton}
        </div>
      );

    case 'recoverable_error':
      return (
        <div className="auth">
          {heading('No se pudo continuar')}
          <p role="alert">{RECOVERABLE_MESSAGES[state.reason]}</p>
          <RequestId value={state.requestId} />
          <button type="button" onClick={actions.onRetry} disabled={!retryEnabled}>
            Reintentar
          </button>
          {signOutButton}
        </div>
      );

    case 'fatal_error':
      return (
        <div className="auth">
          {heading('Error inesperado')}
          <p role="alert">Ocurrió un error inesperado.</p>
          <RequestId value={state.requestId} />
          {signOutButton}
          <button type="button" onClick={actions.onReload}>
            Recargar la página
          </button>
        </div>
      );
  }
}
