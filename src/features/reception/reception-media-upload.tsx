import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { parseActiveMedia } from '@/shared/media/media-contract';
import type { ConfirmedMedia } from '@/shared/media/media-types';
import { createUploadTask } from '@/shared/media/upload-task';
import { uploadTaskCopy } from '@/shared/media/upload-task-copy';
import type { UploadAttempt, UploadTaskState } from '@/shared/media/upload-task-types';
import { classifyFailure } from '@/shared/api/api-failure';
import type { ReceptionMediaCapability } from './reception-media-capability';
import type { ReceptionOperationalMediaInput } from './reception-operational-media-types';
import { useReceptionAction } from './use-reception-action';
import { RequestReference } from './request-reference';

export interface UploadCapacity { acquire(id: string): boolean; release(id: string): void; readonly full: boolean }
type Association = { readonly phase: 'idle' } | {
  readonly phase: 'active' | 'associating' | 'failed'; readonly media: ConfirmedMedia;
};
/** F04 owns upload/recovery. Only canonical association success releases the picker File. */
export function ReceptionMediaUpload({ id, file, label, capability, input, sortOrder, signal, disabled, capacity, onConfirmed }: {
  readonly id: string; readonly file: File; readonly label: string;
  readonly capability: Extract<ReceptionMediaCapability, { kind: 'available' }>;
  readonly input: ReceptionOperationalMediaInput | null; readonly sortOrder: number;
  readonly signal: AbortSignal; readonly disabled: boolean;
  readonly capacity: UploadCapacity; readonly onConfirmed: (media: ConfirmedMedia, restoreFocus: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const restartButton = useRef<HTMLButtonElement>(null);
  const focusCanceled = useRef(false);
  const task = useRef<ReturnType<typeof createUploadTask<ReceptionOperationalMediaInput>> | null>(null);
  const attempt = useRef<UploadAttempt | null>(null);
  const [state, setState] = useState<UploadTaskState>({ phase: 'idle' });
  const [association, setAssociation] = useState<Association>({ phase: 'idle' });
  const associationStarted = useRef(false);
  const attaching = useRef(false);
  const associationController = useRef<AbortController | null>(null);
  const action = useReceptionAction();
  const confirm = useRef(onConfirmed);
  useLayoutEffect(() => { confirm.current = onConfirmed; }, [onConfirmed]);
  const release = useEffectEvent(() => { capacity.release(id); });
  const attach = (media: ConfirmedMedia) => {
    const controller = associationController.current;
    if (input === null || disabled || signal.aborted || !controller || controller.signal.aborted || attaching.current || action.blocked) return;
    attaching.current = true;
    let associated = false;
    const receptionId = input.receptionId;
    setAssociation({ phase: 'associating', media });
    void action.run(async () => {
      try { return await capability.attach(receptionId, { mediaAssetId: media.mediaAssetId, sortOrder }, controller.signal); }
      catch { return { ok: false, failure: classifyFailure({ source: 'transport', reason: 'network' }) } as const; }
    }, () => {
      if (signal.aborted || controller.signal.aborted) return;
      associated = true;
      confirm.current(media, root.current?.contains(document.activeElement) ?? false);
    }).finally(() => {
      attaching.current = false;
      if (!associated && !signal.aborted && !controller.signal.aborted) setAssociation({ phase: 'failed', media });
    });
  };
  const associateActive = useEffectEvent(attach);
  useLayoutEffect(() => {
    if (signal.aborted) return;
    const current = createUploadTask(capability.executor);
    const controller = new AbortController();
    associationController.current = controller;
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
          setAssociation({ phase: 'active', media });
          if (!associationStarted.current && !signal.aborted) {
            associationStarted.current = true;
            associateActive(media);
          }
        }
      } else setState(next);
    });
    const dispose = () => { controller.abort(); unsubscribe(); current.dispose(); task.current = null; attempt.current = null; release(); };
    signal.addEventListener('abort', dispose, { once: true });
    return () => { signal.removeEventListener('abort', dispose); dispose(); };
  }, [capability.executor, signal]);
  useLayoutEffect(() => {
    if (!focusCanceled.current || state.phase !== 'canceled') return;
    focusCanceled.current = false;
    if (document.activeElement === document.body) (restartButton.current ?? root.current)?.focus();
  }, [state.phase]);
  const active = state.phase === 'preparing' || state.phase === 'uploading' || state.phase === 'completing';
  const cancelAttempt = attempt.current;
  const restart = 'recovery' in state && state.recovery.kind === 'safe_local_restart';
  const start = () => {
    if (input === null || disabled || signal.aborted || !task.current || !capacity.acquire(id)) return;
    const result = state.phase === 'idle' ? task.current.start(input, file) : task.current.restart(input, file);
    if (result.ok) attempt.current = result.attempt;
    else capacity.release(id);
  };
  return <div ref={root} tabIndex={-1} className="reception-media-upload" aria-label={`Estado de ${label}`}>
    <p role="status">{association.phase === 'associating' ? 'Carga activa. Asociando evidencia a la recepción…' :
      association.phase === 'failed' ? 'Archivo cargado. No se confirmó su asociación a la recepción.' :
      association.phase === 'active' ? 'Archivo cargado. Pendiente de asociar a la recepción.' :
      state.phase === 'idle' ? input === null ? 'Solo local · Se podrá subir después de crear la recepción.' : 'Solo local · Lista para subir.' : uploadTaskCopy(state)}</p>
    {active && <progress aria-label={`Progreso de ${label}`} {...(state.progress.determinate ? { value: state.progress.ratio, max: 1 } : {})}/>}
    {input !== null && (state.phase === 'idle' || restart) && <button ref={restartButton} className="ui-button" type="button" disabled={disabled || signal.aborted || capacity.full}
      onClick={start}>{state.phase === 'idle' ? 'Subir' : 'Reiniciar carga'} {label}</button>}
    {active && <button className="ui-button" type="button" disabled={signal.aborted} onClick={event => { focusCanceled.current = document.activeElement === event.currentTarget; cancelAttempt?.cancel(); }}>Cancelar carga de {label}</button>}
    {(association.phase === 'failed' || association.phase === 'active') && <button type="button" disabled={disabled || signal.aborted || action.blocked}
      onClick={() => { attach(association.media); }}>Reintentar asociación de {label}</button>}
    {association.phase === 'failed' && <RequestReference failure={action.failure}/>}
    {'recovery' in state && state.recovery.kind === 'user_action' && <p>Este archivo no se puede guardar. Puedes continuar a la recepción sin completar esta evidencia.</p>}
    {'recovery' in state && state.recovery.kind === 'contract_dependency' && <p>No vuelvas a cargar este archivo hasta que se pueda verificar su estado.</p>}
  </div>;
}
