import { useCallback, useEffect, useState } from 'react';

import type { DashboardDataSource } from './dashboard-data-source';
import type { DashboardSnapshot } from './dashboard-types';

export type DashboardState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly snapshot: DashboardSnapshot }
  | { readonly kind: 'error' };

/** Carga el snapshot, cancela la lectura al desmontar y permite reintentar. */
export function useDashboardSnapshot(dataSource: DashboardDataSource) {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    dataSource.load(controller.signal).then(
      (snapshot) => {
        if (!controller.signal.aborted) setState({ kind: 'ready', snapshot });
      },
      () => {
        if (!controller.signal.aborted) setState({ kind: 'error' });
      },
    );
    return () => {
      controller.abort();
    };
  }, [dataSource, attempt]);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((value) => value + 1);
  }, []);

  return { state, retry };
}
