export const APP_ENV_NAMES = ['local', 'staging', 'production'] as const;

export type AppEnvName = (typeof APP_ENV_NAMES)[number];

export interface PublicEnv {
  readonly appEnv: AppEnvName;
  /**
   * Origen normalizado del backend (`URL.origin`: esquema + host + puerto no por defecto, sin "/" final).
   * No incluye rutas ni prefijos de versión. No se consume hasta la tarea del cliente API.
   */
  readonly apiOrigin: string | null;
}

export type PublicEnvVariable = 'VITE_APP_ENV' | 'VITE_API_BASE_URL';

export type PublicEnvIssueReason = 'unknown_value' | 'invalid_origin' | 'https_required';

/** Nunca incluye el valor recibido: solo el nombre de la variable y el motivo. */
export interface PublicEnvIssue {
  readonly variable: PublicEnvVariable;
  readonly reason: PublicEnvIssueReason;
}

export type PublicEnvResult =
  | { readonly ok: true; readonly env: PublicEnv }
  | { readonly ok: false; readonly issues: readonly PublicEnvIssue[] };

/** Subconjunto de ImportMetaEnv que se lee al arrancar. Todo valor VITE_* es público. */
export type PublicEnvSource = Pick<ImportMetaEnv, 'PROD' | 'VITE_APP_ENV' | 'VITE_API_BASE_URL'>;

function isAppEnvName(value: string): value is AppEnvName {
  return APP_ENV_NAMES.some((name) => name === value);
}

function readOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

/** Acepta solo http(s) con host, sin credenciales, '?' ni '#', y con ruta vacía o "/". */
function parseApiOrigin(raw: string): URL | null {
  if (/[?#]/.test(raw)) {
    return null;
  }
  try {
    const url = new URL(raw);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const hasCredentials = url.username !== '' || url.password !== '';
    return isHttp && !hasCredentials && url.pathname === '/' ? url : null;
  } catch {
    return null;
  }
}

export function parsePublicEnv(source: PublicEnvSource): PublicEnvResult {
  const issues: PublicEnvIssue[] = [];

  const rawAppEnv = readOptional(source.VITE_APP_ENV);
  let appEnv: AppEnvName | null;
  if (rawAppEnv === null) {
    appEnv = source.PROD ? 'production' : 'local';
  } else if (isAppEnvName(rawAppEnv)) {
    appEnv = rawAppEnv;
  } else {
    appEnv = null;
    issues.push({ variable: 'VITE_APP_ENV', reason: 'unknown_value' });
  }

  const rawApiBaseUrl = readOptional(source.VITE_API_BASE_URL);
  let apiOrigin: string | null = null;
  if (rawApiBaseUrl !== null) {
    const url = parseApiOrigin(rawApiBaseUrl);
    if (url === null) {
      issues.push({ variable: 'VITE_API_BASE_URL', reason: 'invalid_origin' });
    } else if (url.protocol === 'http:' && appEnv !== null && appEnv !== 'local') {
      issues.push({ variable: 'VITE_API_BASE_URL', reason: 'https_required' });
    } else {
      apiOrigin = url.origin;
    }
  }

  if (issues.length > 0 || appEnv === null) {
    return { ok: false, issues };
  }
  return { ok: true, env: { appEnv, apiOrigin } };
}
