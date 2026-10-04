/**
 * Marcadores SINTÉTICOS: son los únicos «secretos» que usa el harness. Ninguna credencial real interviene jamás.
 *
 * El código de los specs referencia las CLAVES (`password`, `token`…) y los nombres de variable de entorno de `MARKER_ENV`,
 * nunca el texto del marcador: si un fallo hiciera que Playwright imprimiera el fragmento de código fuente (code frame o
 * error-context.md), el marcador no aparecería por culpa del propio código de prueba, solo si el VALOR se filtra.
 */
export const SYNTHETIC_MARKERS = {
  password: 'AUDIT_SYNTHETIC_PASSWORD',
  token: 'AUDIT_SYNTHETIC_TOKEN',
  cookie: 'AUDIT_SYNTHETIC_COOKIE',
  signedQuery: 'AUDIT_SYNTHETIC_SIGNED_QUERY',
} as const;

export type MarkerKey = keyof typeof SYNTHETIC_MARKERS;

/** Variable de entorno del proceso hijo que transporta cada marcador. */
export const MARKER_ENV: Readonly<Record<MarkerKey, string>> = {
  password: 'HARNESS_SYNTHETIC_PASSWORD',
  token: 'HARNESS_SYNTHETIC_TOKEN',
  cookie: 'HARNESS_SYNTHETIC_COOKIE',
  signedQuery: 'HARNESS_SYNTHETIC_SIGNED_QUERY',
};

export const ALL_MARKERS: readonly string[] = Object.values(SYNTHETIC_MARKERS);

export const SYNTHETIC_EMAIL = 'audit.synthetic@example.invalid';
