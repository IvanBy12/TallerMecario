import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { parseActiveMedia } from '@/shared/media/media-contract';
import type { ConfirmedMedia } from '@/shared/media/media-types';
import { createUploadTask } from '@/shared/media/upload-task';
import { uploadTaskCopy } from '@/shared/media/upload-task-copy';
import type { UploadAttempt, UploadExecutor, UploadTaskState } from '@/shared/media/upload-task-types';

export interface UploadCapacity { acquire(id: string): boolean; release(id: string): void; readonly full: boolean }
/** An executor must include a legitimate domain association before production wiring.
 * No DTO or network adapter is defined here. F05 currently exercises this seam synthetically. */
export function ReceptionMediaUpload({ id, file, label, executor, signal, disabled, capacity, onConfirmed }: {
  readonly id: string; readonly file: File; readonly label: string;
  readonly executor: UploadExecutor<undefined>; readonly signal: AbortSignal; readonly disabled: boolean;
  readonly capacity: UploadCapacity; readonly onConfirmed: (media: ConfirmedMedia, restoreFocus: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const restartButton = useRef<HTMLButtonElement>(null);
  const focusCanceled = useRef(false);
  const task = useRef<ReturnType<typeof createUploadTask<undefined>> | null>(null);
  const attempt = useRef<UploadAttempt | null>(null);
  const [state, setState] = useState<UploadTaskState>({ phase: 'idle' });
  const confirm = useEffectEvent(onConfirmed);
  const release = useEffectEvent(() => { capacity.release(id); });
  useLayoutEffect(() => {
    if (signal.aborted) return;
    const current = createUploadTask(executor);
    task.current = current;
    setState(current.getState());
    const unsubscribe = current.subscribe(() => {
      const next = current.getState();
      if (!['preparing', 'uploading', 'completing'].includes(next.phase)) {
        attempt.current = null;
        release();
      }
      if (next.phase === 'succeeded') {
        const media = parseActiveMedia(next.media);
        if (media === null) setState({ phase: 'ambiguous', failure: { source: 'contract', kind: 'invalid_completion' }, recovery: { kind: 'contract_dependency', reason: 'reconciliation' } });
        else {
          setState(next);
          if (!signal.aborted) confirm(media, root.current?.contains(document.activeElement) ?? false);
        }
      } else setState(next);
    });
    const dispose = () => { unsubscribe(); current.dispose(); task.current = null; attempt.current = null; release(); };
    signal.addEventListener('abort', dispose, { once: true });
    return () => { signal.removeEventListener('abort', dispose); dispose(); };
  }, [executor, signal]);
  useLayoutEffect(() => {
    if (!focusCanceled.current || state.phase !== 'canceled') return;
    focusCanceled.current = false;
    if (document.activeElement === document.body) (restartButton.current ?? root.current)?.focus();
  }, [state.phase]);
  const active = state.phase === 'preparing' || state.phase === 'uploading' || state.phase === 'completing';
  const cancelAttempt = attempt.current;
  const restart = 'recovery' in state && state.recovery.kind === 'safe_local_restart';
  const start = () => {
    if (disabled || signal.aborted || !task.current || !capacity.acquire(id)) return;
    const result = state.phase === 'idle' ? task.current.start(undefined, file) : task.current.restart(undefined, file);
    if (result.ok) attempt.current = result.attempt;
    else capacity.release(id);
  };
  return <div ref={root} tabIndex={-1} className="reception-media-upload" aria-label={`Estado de ${label}`}>
    <p role="status">{state.phase === 'idle' ? 'Solo local · Lista para subir.' : uploadTaskCopy(state)}</p>
    {active && <progress aria-label={`Progreso de ${label}`} {...(state.progress.determinate ? { value: state.progress.ratio, max: 1 } : {})}/>}
    {(state.phase === 'idle' || restart) && <button ref={restartButton} className="ui-button" type="button" disabled={disabled || signal.aborted || capacity.full}
      onClick={start}>{state.phase === 'idle' ? 'Subir' : 'Reiniciar carga'} {label}</button>}
    {active && <button className="ui-button" type="button" disabled={signal.aborted} onClick={event => { focusCanceled.current = document.activeElement === event.currentTarget; cancelAttempt?.cancel(); }}>Cancelar carga de {label}</button>}
    {'recovery' in state && state.recovery.kind === 'user_action' && <p>Quita este archivo y selecciona otro antes de continuar.</p>}
    {'recovery' in state && state.recovery.kind === 'contract_dependency' && <p>No vuelvas a cargar este archivo hasta que se pueda verificar su estado.</p>}
  </div>;
}
