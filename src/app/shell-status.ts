import type { AuthState } from '@/features/auth/workshop-context';

/** Estados en los que el shell puede renderizarse sin afirmar un contexto de taller que no existe. */
export type ShellContextStatus = 'context_pending' | 'context_ready';

/**
 * Traduce el estado de autenticación al estado del shell.
 *
 * - `signed_in_context_pending` → shell con aviso: hay sesión, pero G5 todavía no integra el
 *   acceso a talleres, así que **no** hay taller activo ni datos que mostrar.
 * - `ready` → shell normal, sólo si el contexto está sano: si llega degradado o con un aviso de
 *   revocación/cambio de taller, la incidencia la sigue tratando `AuthGate` (dueño único de esos
 *   estados y de su botón *Reintentar*), en lugar de duplicar esa lógica aquí.
 * - Cualquier otro estado → `null`: lo renderiza `AuthGate` como hasta ahora.
 */
export function shellStatusOf(state: AuthState): ShellContextStatus | null {
  switch (state.kind) {
    case 'signed_in_context_pending':
      return 'context_pending';
    case 'ready':
      return state.degraded === null && state.notice === null ? 'context_ready' : null;
    default:
      return null;
  }
}
