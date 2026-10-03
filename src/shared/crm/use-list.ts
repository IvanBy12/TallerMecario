import { useCallback, useEffect, useState } from 'react';
import type { ApiResult } from '@/shared/api/http-client';
import { useCrmAction } from './use-action';
export interface CursorPage<T> { readonly items: readonly T[]; readonly nextCursor: string | null }
export function useCrmList<T, F>(load: (filter: F, cursor?: string) => Promise<ApiResult<CursorPage<T>>>, initialFilter: F, allowed: boolean, signal: AbortSignal) {
  const [filter, setFilter] = useState(initialFilter);
  const [items, setItems] = useState<readonly T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [operation, setOperation] = useState<'replace' | 'append'>('replace');
  const action = useCrmAction(signal);
  const { run } = action;
  const fetchPage = useCallback((nextFilter: F, nextCursor?: string) => {
    if (!allowed) return;
    setOperation(nextCursor === undefined ? 'replace' : 'append');
    return run(() => load(nextFilter, nextCursor), page => {
      setItems(old => nextCursor === undefined ? page.items : [...old, ...page.items]);
      setCursor(page.nextCursor); setLoaded(true);
    });
  }, [allowed, run, load]);
  useEffect(() => { void fetchPage(initialFilter); }, [fetchPage, initialFilter]);
  return { ...action, items, cursor, loaded, filter,
    search: (next: F) => { if (action.blocked) return; setFilter(next); setItems([]); setCursor(null); setLoaded(false); void fetchPage(next); },
    more: () => { if (cursor !== null) void fetchPage(filter, cursor); },
    retry: () => { void fetchPage(filter, operation === 'append' ? cursor ?? undefined : undefined); },
  };
}
