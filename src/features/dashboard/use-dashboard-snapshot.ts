import { useCallback, useLayoutEffect, useMemo, useState } from 'react';

import type { DashboardDataSource } from './dashboard-data-source';
import type { DashboardSnapshot } from './dashboard-types';

export type DashboardState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly snapshot: DashboardSnapshot }
  | { readonly kind: 'error' };

/** Cada resultado pertenece a una fuente, contexto e intento concretos. */
export function useDashboardSnapshot(dataSource: DashboardDataSource, contextKey: string) {
  const [attempt, setAttempt] = useState(0);
  const loadIdentity = useMemo(() => ({ dataSource, contextKey, attempt }), [dataSource, contextKey, attempt]);
  const [result, setResult] = useState<{ readonly identity: typeof loadIdentity; readonly state: DashboardState } | null>(null);

  // El render invalida el snapshot antes de los efectos: nunca combina contexto nuevo y datos viejos.
  const state: DashboardState = result?.identity === loadIdentity ? result.state : { kind: 'loading' };

  useLayoutEffect(() => {
    const controller = new AbortController();
    let current = true;
    dataSource.load(controller.signal).then(
      (snapshot) => {
        if (current) setResult({ identity: loadIdentity, state: { kind: 'ready', snapshot } });
      },
      () => {
        if (current) setResult({ identity: loadIdentity, state: { kind: 'error' } });
      },
    );
    return () => {
      // No depende de que el datasource atienda AbortSignal.
      current = false;
      controller.abort();
    };
  }, [dataSource, loadIdentity]);

  const retry = useCallback(() => { setAttempt((value) => value + 1); }, []);
  return { state, retry };
}
