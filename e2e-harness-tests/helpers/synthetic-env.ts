import { SYNTHETIC_MARKERS } from './markers';

const TENANT_A = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const TENANT_B = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
const RECEPTION_B = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c';

/** Entorno E2E completo y 100 % sintético (dominios `.invalid`, contraseñas = marcadores). Nunca contiene valores reales. */
export function syntheticEnv(): Record<string, string> {
  return {
    VITE_API_BASE_URL: 'https://api.example.invalid',
    VITE_CLERK_PUBLISHABLE_KEY: 'pk_test_synthetic',
    E2E_TENANT_ID: TENANT_A,
    E2E_USER_EMAIL: 'owner@example.invalid',
    E2E_USER_PASSWORD: SYNTHETIC_MARKERS.password,
    E2E_RESTRICTED_EMAIL: 'technician@example.invalid',
    E2E_RESTRICTED_PASSWORD: SYNTHETIC_MARKERS.password,
    E2E_TENANT_B_ID: TENANT_B,
    E2E_TENANT_B_USER_EMAIL: 'tenant-b@example.invalid',
    E2E_TENANT_B_USER_PASSWORD: SYNTHETIC_MARKERS.password,
    E2E_TENANT_B_RECEPTION_ID: RECEPTION_B,
  };
}

export function without(env: Record<string, string>, ...names: string[]): Record<string, string> {
  const copy = { ...env };
  for (const name of names) Reflect.deleteProperty(copy, name);
  return copy;
}
