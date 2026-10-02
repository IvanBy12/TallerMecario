import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiFailure } from '@/shared/api/api-failure';
import type { ApiResult } from '@/shared/api/http-client';
export function useCrmAction(signal: AbortSignal) {
  const active = useRef(false);
  const retryUntil = useRef(0);
  const mounted = useRef(false);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current = false; generation.current += 1; }; }, []);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setTimeout(() => { tick(v => v + 1); }, Math.min(retryAt - Date.now(), 2147483647));
    return () => { clearTimeout(timer); };
  }, [retryAt]);
  const run = useCallback(async <T,>(work: () => Promise<ApiResult<T>>, success: (data: T) => void, recover?: (failure: ApiFailure) => Promise<void>) => {
    if (active.current || signal.aborted || Date.now() < retryUntil.current) return;
    const attempt = generation.current;
    const isCurrent = () => mounted.current && !signal.aborted && attempt === generation.current;
    active.current = true; setBusy(true); setFailure(null);
    try {
      const result = await work();
      if (!isCurrent()) return;
      if (result.ok) success(result.data);
      else if (result.failure.kind !== 'aborted') {
        setFailure(result.failure);
        if (result.failure.kind === 'rate_limited') { retryUntil.current = Date.now() + (result.failure.retryAfterSeconds ?? 5) * 1000; setRetryAt(retryUntil.current); }
        await recover?.(result.failure);
      }
    } finally {
      if (attempt === generation.current) { active.current = false; if (isCurrent()) setBusy(false); }
    }
  }, [signal]);
  return { run, busy, failure, blocked: busy || Date.now() < retryAt };
}
