import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiFailure } from '@/shared/api/api-failure';
import type { ApiResult } from '@/shared/api/http-client';
export function useReceptionAction() {
    const active = useRef(false);
    const mounted = useRef(false);
    const generation = useRef(0);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<ApiFailure | null>(null);
    const [retryAt, setRetryAt] = useState(0);
    const [, tick] = useState(0);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current = false; generation.current += 1; }; }, []);
    useEffect(() => {
        if (retryAt <= Date.now())
            return;
        const timer = setTimeout(() => { tick((v) => v + 1); }, Math.min(retryAt - Date.now(), 2147483647));
        return () => { clearTimeout(timer); };
    }, [retryAt]);
    const observeFailure = useCallback((error: ApiFailure) => {
        if (error.kind === 'rate_limited')
            setRetryAt(Date.now() + (error.retryAfterSeconds ?? 5) * 1000);
    }, []);
    const run = useCallback(async <T,>(work: () => Promise<ApiResult<T>>, success: (data: T) => void, recover?: (error: ApiFailure) => Promise<void>) => {
        if (active.current || Date.now() < retryAt)
            return;
        const attempt = generation.current;
        active.current = true;
        setBusy(true);
        setFailure(null);
        try {
            const result = await work();
            if (!mounted.current || attempt !== generation.current)
                return;
            if (result.ok)
                success(result.data);
            else if (result.failure.kind !== 'aborted') {
                setFailure(result.failure);
                observeFailure(result.failure);
                await recover?.(result.failure);
            }
        }
        finally {
            if (attempt === generation.current) {
                active.current = false;
                if (mounted.current)
                    setBusy(false);
            }
        }
    }, [retryAt, observeFailure]);
    return { busy, failure, run, observeFailure, blocked: busy || Date.now() < retryAt };
}
