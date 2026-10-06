import { randomBytes } from 'node:crypto';
import path from 'node:path';

/**
 * Variables PRIVADAS del runner (nunca VITE_*, nunca versionadas). Los mensajes de error nombran variables, jamás valores.
 * Referencia: .env.e2e.example y docs/quality/s3-mobile-e2e.md.
 *
 * Todas las funciones reciben el origen de variables (`source`, por defecto `process.env`) para poder probarlas sin tocar el
 * entorno real del proceso.
 */

export const AUTH_DIR = path.join(import.meta.dirname, '..', '.auth');

export type PersonaKey = 'advisor' | 'restricted' | 'tenantB';
export const PERSONA_KEYS: readonly PersonaKey[] = ['advisor', 'restricted', 'tenantB'];

export type EnvSource = Readonly<Record<string, string | undefined>>;

export const STATE_FILES: Readonly<Record<PersonaKey, string>> = {
  advisor: path.join(AUTH_DIR, 'advisor.json'),
  restricted: path.join(AUTH_DIR, 'restricted.json'),
  tenantB: path.join(AUTH_DIR, 'tenant-b.json'),
};

/** Variables de identidad por persona. No hay fallback entre personas: cada una exige las suyas. */
export const PERSONA_VARIABLES: Readonly<Record<PersonaKey, { readonly email: string; readonly password: string }>> = {
  advisor: { email: 'E2E_USER_EMAIL', password: 'E2E_USER_PASSWORD' },
  restricted: { email: 'E2E_RESTRICTED_EMAIL', password: 'E2E_RESTRICTED_PASSWORD' },
  tenantB: { email: 'E2E_TENANT_B_USER_EMAIL', password: 'E2E_TENANT_B_USER_PASSWORD' },
};

const CORE = ['VITE_API_BASE_URL', 'VITE_CLERK_PUBLISHABLE_KEY', 'E2E_TENANT_ID', 'E2E_USER_EMAIL', 'E2E_USER_PASSWORD'] as const;
const RESTRICTED = ['E2E_RESTRICTED_EMAIL', 'E2E_RESTRICTED_PASSWORD'] as const;
const TENANT_B = ['E2E_TENANT_B_ID', 'E2E_TENANT_B_USER_EMAIL', 'E2E_TENANT_B_USER_PASSWORD', 'E2E_TENANT_B_RECEPTION_ID'] as const;

/**
 * Variable retirada: una placa fija obligaba a que todas las corridas mutantes (crear recepción abierta) reutilizaran el mismo
 * vehículo, y la segunda corrida fallaba porque ya tenía una recepción abierta. Las placas se derivan por corrida.
 */
export const RETIRED_FIXED_PLATE_VARIABLE = 'E2E_VEHICLE_PLATE';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function read(name: string, source: EnvSource): string | undefined {
  const value = source[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function required(name: string, source: EnvSource): string {
  const value = read(name, source);
  if (value === undefined) {
    throw new Error(`Falta la variable de entorno ${name}. Consulta .env.e2e.example.`);
  }
  return value;
}

/** Nombres (nunca valores) de las variables obligatorias que faltan o están vacías. */
export function missingVariables(source: EnvSource = process.env): readonly string[] {
  return [...CORE, ...RESTRICTED, ...TENANT_B].filter((name) => read(name, source) === undefined);
}

/** Problemas de formato detectables sin red. Solo nombres de variable y motivo; nunca el valor. */
export function invalidVariables(source: EnvSource = process.env): readonly string[] {
  const problems: string[] = [];
  const key = read('VITE_CLERK_PUBLISHABLE_KEY', source);
  if (key !== undefined && !key.startsWith('pk_test_')) {
    problems.push('VITE_CLERK_PUBLISHABLE_KEY: el E2E crea datos y solo corre contra una instancia Clerk de PRUEBA (pk_test_…).');
  }
  const api = read('VITE_API_BASE_URL', source);
  if (api !== undefined) {
    try {
      const url = new URL(api);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') problems.push('VITE_API_BASE_URL: debe ser http(s).');
    } catch {
      problems.push('VITE_API_BASE_URL: no es una URL válida.');
    }
  }
  for (const name of ['E2E_TENANT_ID', 'E2E_TENANT_B_ID', 'E2E_TENANT_B_RECEPTION_ID']) {
    const value = read(name, source);
    if (value !== undefined && !UUID.test(value)) problems.push(`${name}: debe ser un UUID en minúsculas.`);
  }
  if (read('E2E_TENANT_ID', source) !== undefined && read('E2E_TENANT_ID', source) === read('E2E_TENANT_B_ID', source)) {
    problems.push('E2E_TENANT_B_ID: debe ser un taller distinto de E2E_TENANT_ID.');
  }
  // Personas distintas: compartir identidad entre personas anularía la prueba de RBAC y de aislamiento entre talleres.
  const emails = new Map<string, PersonaKey>();
  for (const persona of PERSONA_KEYS) {
    const variable = PERSONA_VARIABLES[persona].email;
    const email = read(variable, source)?.toLowerCase();
    if (email === undefined) continue;
    const other = emails.get(email);
    if (other !== undefined) {
      problems.push(`${variable}: debe ser una identidad distinta de ${PERSONA_VARIABLES[other].email}.`);
    } else {
      emails.set(email, persona);
    }
  }
  if (read(RETIRED_FIXED_PLATE_VARIABLE, source) !== undefined) {
    problems.push(
      `${RETIRED_FIXED_PLATE_VARIABLE}: ya no se admite. Obligaría a reutilizar un vehículo con recepción abierta entre corridas; ` +
        'las placas se generan únicas por corrida. Elimina la variable.',
    );
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
  readonly credentials: Readonly<Record<PersonaKey, Credentials>>;
}

/** Lanza (con nombres de variable) si el ambiente no está completo. Los specs lo llaman tras el preflight. */
export function e2eEnv(source: EnvSource = process.env): E2eEnv {
  const credentialsOf = (persona: PersonaKey): Credentials => ({
    email: required(PERSONA_VARIABLES[persona].email, source),
    password: required(PERSONA_VARIABLES[persona].password, source),
  });
  return {
    apiOrigin: new URL(required('VITE_API_BASE_URL', source)).origin,
    tenantId: required('E2E_TENANT_ID', source),
    tenantBId: required('E2E_TENANT_B_ID', source),
    tenantBReceptionId: required('E2E_TENANT_B_RECEPTION_ID', source),
    tenantBSentinel: read('E2E_TENANT_B_SENTINEL', source) ?? null,
    verificationCode: read('E2E_VERIFICATION_CODE', source) ?? null,
    credentials: {
      advisor: credentialsOf('advisor'),
      restricted: credentialsOf('restricted'),
      tenantB: credentialsOf('tenantB'),
    },
  };
}

const RUN_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const issuedRunIds = new Set<string>();

/**
 * Identificador único por corrida: 10 caracteres [0-9A-Z] = 6 de reloj (ms en base 36, ~2 años de ciclo) + 4 de CSPRNG,
 * y garantía adicional de no repetirse dentro del proceso. Se usa en placas, nombres y trazabilidad de fixtures; cada
 * test que muta datos pide el suyo.
 */
export function newRunId(): string {
  for (;;) {
    const clock = Date.now().toString(36).toUpperCase().slice(-6).padStart(6, '0');
    const entropy = Array.from(randomBytes(4), (byte) => RUN_ID_ALPHABET.charAt(byte % RUN_ID_ALPHABET.length)).join('');
    const id = `${clock}${entropy}`;
    if (!issuedRunIds.has(id)) {
      issuedRunIds.add(id);
      return id;
    }
  }
}

/** Placa canónica del backend/CRM: `^[A-Z0-9]{1,16}$` (docs/api/crm.md). Prefijo `E2E` = identificable como dato de prueba. */
export const PLATE_FORMAT = /^[A-Z0-9]{1,16}$/;

export function plateForRun(runId: string): string {
  const plate = `E2E${runId}`;
  if (!PLATE_FORMAT.test(plate)) {
    throw new Error('La placa derivada de la corrida no cumple el formato canónico ^[A-Z0-9]{1,16}$.');
  }
  return plate;
}
