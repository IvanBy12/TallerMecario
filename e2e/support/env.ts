import path from 'node:path';

/**
 * Variables PRIVADAS del runner (nunca VITE_*, nunca versionadas). Los mensajes de error nombran variables, jamás valores.
 * Referencia: .env.e2e.example y docs/quality/s3-mobile-e2e.md.
 */

export const AUTH_DIR = path.join(import.meta.dirname, '..', '.auth');

export type PersonaKey = 'advisor' | 'restricted' | 'tenantB';

export const STATE_FILES: Readonly<Record<PersonaKey, string>> = {
  advisor: path.join(AUTH_DIR, 'advisor.json'),
  restricted: path.join(AUTH_DIR, 'restricted.json'),
  tenantB: path.join(AUTH_DIR, 'tenant-b.json'),
};

const CORE = ['VITE_API_BASE_URL', 'VITE_CLERK_PUBLISHABLE_KEY', 'E2E_TENANT_ID', 'E2E_USER_EMAIL', 'E2E_USER_PASSWORD'] as const;
const RESTRICTED = ['E2E_RESTRICTED_EMAIL', 'E2E_RESTRICTED_PASSWORD'] as const;
const TENANT_B = ['E2E_TENANT_B_ID', 'E2E_TENANT_B_USER_EMAIL', 'E2E_TENANT_B_USER_PASSWORD', 'E2E_TENANT_B_RECEPTION_ID'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function read(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function required(name: string): string {
  const value = read(name);
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno ${name}. Consulta .env.e2e.example.`);
  }
  return value;
}

/** Nombres (nunca valores) de las variables obligatorias que faltan o están vacías. */
export function missingVariables(): readonly string[] {
  return [...CORE, ...RESTRICTED, ...TENANT_B].filter((name) => read(name) === undefined);
}

/** Problemas de formato detectables sin red. Solo nombres de variable y motivo; nunca el valor. */
export function invalidVariables(): readonly string[] {
  const problems: string[] = [];
  const key = read('VITE_CLERK_PUBLISHABLE_KEY');
  if (key !== undefined && !key.startsWith('pk_test_')) {
    problems.push('VITE_CLERK_PUBLISHABLE_KEY: el E2E crea datos y solo corre contra una instancia Clerk de PRUEBA (pk_test_…).');
  }
  const api = read('VITE_API_BASE_URL');
  if (api !== undefined) {
    try {
      const url = new URL(api);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') problems.push('VITE_API_BASE_URL: debe ser http(s).');
    } catch {
      problems.push('VITE_API_BASE_URL: no es una URL válida.');
    }
  }
  for (const name of ['E2E_TENANT_ID', 'E2E_TENANT_B_ID', 'E2E_TENANT_B_RECEPTION_ID']) {
    const value = read(name);
    if (value !== undefined && !UUID.test(value)) problems.push(`${name}: debe ser un UUID en minúsculas.`);
  }
  if (read('E2E_TENANT_ID') !== undefined && read('E2E_TENANT_ID') === read('E2E_TENANT_B_ID')) {
    problems.push('E2E_TENANT_B_ID: debe ser un taller distinto de E2E_TENANT_ID.');
  }
  return problems;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface E2eEnv {
  readonly apiOrigin: string;
  readonly tenantId: string;
  readonly tenantBId: string;
  readonly tenantBReceptionId: string;
  readonly tenantBSentinel: string | null;
  readonly verificationCode: string | null;
  readonly vehiclePlate: string | null;
  readonly credentials: Readonly<Record<PersonaKey, Credentials>>;
}

/** Lanza (con nombres de variable) si el ambiente no está completo. Los specs lo llaman tras el preflight. */
export function e2eEnv(): E2eEnv {
  return {
    apiOrigin: new URL(required('VITE_API_BASE_URL')).origin,
    tenantId: required('E2E_TENANT_ID'),
    tenantBId: required('E2E_TENANT_B_ID'),
    tenantBReceptionId: required('E2E_TENANT_B_RECEPTION_ID'),
    tenantBSentinel: read('E2E_TENANT_B_SENTINEL') ?? null,
    verificationCode: read('E2E_VERIFICATION_CODE') ?? null,
    vehiclePlate: read('E2E_VEHICLE_PLATE') ?? null,
    credentials: {
      advisor: { email: required('E2E_USER_EMAIL'), password: required('E2E_USER_PASSWORD') },
      restricted: { email: required('E2E_RESTRICTED_EMAIL'), password: required('E2E_RESTRICTED_PASSWORD') },
      tenantB: { email: required('E2E_TENANT_B_USER_EMAIL'), password: required('E2E_TENANT_B_USER_PASSWORD') },
    },
  };
}

/** Identificador único por corrida (alfanumérico, ≤ 8 caracteres): placas, nombres y trazabilidad de fixtures. */
export function newRunId(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const random = Math.floor(Math.random() * 36 ** 3).toString(36).toUpperCase().padStart(3, '0');
  return `${stamp}${random}`;
}
