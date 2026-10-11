import { useEffect, useRef, useState } from 'react';
import type { ApiFailure } from '@/shared/api/api-failure';
import { can, useReception } from './reception-context';
import { receptionCopy } from './reception-copy';
import { useReceptionAction } from './use-reception-action';
import type { ReceptionMediaDownload, ReceptionMediaDto } from './reception-operational-media-types';

function safeCopy(failure: ApiFailure): string {
  return failure.status === 404 ? 'La evidencia no existe o no está disponible para tu acceso.' : receptionCopy(failure);
}
type ListState = { kind: 'loading' } | { kind: 'error'; message: string } |
  { kind: 'loaded'; media: readonly ReceptionMediaDto[] };
export function useOperationalGallery(receptionId: string) {
  const { operationalMediaApi: api, permissions, signal } = useReception();
  const allowed = can(permissions, 'media.read', true);
  const { observeFailure, blocked } = useReceptionAction();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  useEffect(() => {
    if (!allowed) return;
    const local = new AbortController();
    void api.list(receptionId, local.signal).then(result => {
      if (signal.aborted || local.signal.aborted) return;
      if (!result.ok) observeFailure(result.failure);
      setState(result.ok ? { kind: 'loaded', media: result.data.media } :
        { kind: 'error', message: result.failure.kind === 'aborted' ? 'Consulta cancelada.' : safeCopy(result.failure) });
    });
    return () => { local.abort(); };
  }, [api, receptionId, signal, allowed, attempt, observeFailure]);
  return { state, allowed, blocked, retry: () => { if (blocked) return; setState({ kind: 'loading' }); setAttempt(value => value + 1); } };
}

type ViewState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } |
  { kind: 'ready'; capability: ReceptionMediaDownload };
export function useOperationalMediaView(mediaAssetId: string) {
  const { operationalMediaApi: api, signal } = useReception();
  const { observeFailure, blocked } = useReceptionAction();
  const [state, setState] = useState<ViewState>({ kind: 'idle' });
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, [api, mediaAssetId]);
  useEffect(() => {
    if (state.kind !== 'ready') return;
    const expires = Date.parse(state.capability.expiresAt);
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      const remaining = expires - Date.now();
      if (remaining <= 0) setState({ kind: 'error', message: 'El acceso temporal expiró. Vuelve a solicitar la visualización.' });
      else timer = setTimeout(check, Math.min(remaining, 2147483647));
    };
    check();
    // Background tabs may suspend timers. Recheck before resuming interaction.
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [state]);
  const open = async () => {
    if (blocked || signal.aborted || (pending.current !== null && !pending.current.signal.aborted)) return;
    const local = new AbortController();
    pending.current = local;
    setState({ kind: 'loading' });
    const result = await api.download(mediaAssetId, local.signal);
    const canceled = () => signal.aborted || local.signal.aborted;
    if (canceled()) return;
    pending.current = null;
    if (!result.ok) {
      observeFailure(result.failure);
      setState({ kind: 'error', message: result.failure.kind === 'aborted' ? 'Consulta cancelada.' : safeCopy(result.failure) });
    } else if (Date.parse(result.data.expiresAt) <= Date.now()) {
      setState({ kind: 'error', message: 'El acceso temporal expiró. Vuelve a solicitar la visualización.' });
    } else setState({ kind: 'ready', capability: result.data });
  };
  const close = () => { pending.current?.abort(); pending.current = null; setState({ kind: 'idle' }); };
  const inaccessible = () => { setState({ kind: 'error', message: 'No se pudo visualizar la evidencia. Puede haber expirado o no estar disponible.' }); };
  return { state, blocked, open, close, inaccessible };
}
