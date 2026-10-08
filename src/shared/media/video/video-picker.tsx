import { useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { StatusBanner } from '@/shared/ui/status-banner';
import { VideoPreview } from './video-preview';
import { useVideoSelection } from './video-selection';
import type { VideoSelection, VideoValidationPolicy } from './video-types';
import { videoIssueCopy } from './video-validation';

export interface VideoPickerProps {
  readonly policy?: VideoValidationPolicy;
  readonly disabled?: boolean;
  /** Orchestration slot; this picker alone releases the File and preview. */
  readonly renderVideo?: (video: VideoSelection, release: () => void) => ReactNode;
  /** Reports only accepted original Files, without URLs/pending candidates.
   * Consumers release retained Files on reset/unmount. A new key resets notice.
   */
  readonly onSelectionChange?: (video: VideoSelection | null) => void;
}

export function VideoPicker({ policy, disabled = false, onSelectionChange, renderVideo }: VideoPickerProps) {
  const id = useId();
  const gallery = useRef<HTMLInputElement>(null);
  const acknowledgement = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<HTMLButtonElement | null>(null);
  const [noticeRead, setNoticeRead] = useState(false);
  const selection = useVideoSelection(policy);
  const blocked = disabled || !noticeRead;
  const report = useEffectEvent((video: VideoSelection | null) => { onSelectionChange?.(video); });
  useEffect(() => { report(selection.video); }, [selection.video]);
  useLayoutEffect(() => {
    const button = pendingFocus.current;
    if (!button || selection.video) return;
    pendingFocus.current = null;
    const { activeElement, body } = button.ownerDocument;
    if (activeElement !== button && activeElement !== body) return;
    if (gallery.current && !gallery.current.disabled) gallery.current.focus();
    else acknowledgement.current?.focus();
  }, [selection.video, selection.status]);
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!blocked && file) selection.select(file);
  };
  const canClear = selection.video !== null || selection.status === 'metadata_loading' || selection.issue !== null;
  return <section className="video-picker" aria-label="Selección local de video">
    <StatusBanner tone="warning" title="Antes de grabar o seleccionar un video">
      <p id={`${id}-notice`}>Enfoca el video en el vehículo y la evidencia. Evita capturar rostros/personas si no son necesarios y datos personales innecesarios.</p>
    </StatusBanner>
    <label className="video-picker__acknowledgement">
      <input ref={acknowledgement} type="checkbox" checked={noticeRead} disabled={disabled} aria-describedby={`${id}-notice`}
        onChange={event => { setNoticeRead(event.currentTarget.checked); }} />
      He leído este aviso
    </label>
    <p id={`${id}-instructions`}>{disabled ? 'La selección de video está deshabilitada.' : !noticeRead
      ? 'Lee el aviso y marca la casilla para habilitar la grabación y la selección.'
      : 'Puedes grabar o seleccionar un video. La cámara depende del dispositivo y navegador. Un nuevo video válido reemplaza al anterior.'}</p>
    <div className="video-picker__controls">
      <label htmlFor={`${id}-capture`}>Grabar video</label>
      <input id={`${id}-capture`} type="file" accept="video/*" capture="environment" disabled={blocked}
        aria-describedby={`${id}-notice ${id}-instructions`} onChange={choose} />
      <label htmlFor={`${id}-gallery`}>Seleccionar video</label>
      <input ref={gallery} id={`${id}-gallery`} type="file" accept="video/*" disabled={blocked}
        aria-describedby={`${id}-notice ${id}-instructions`} onChange={choose} />
    </div>
    <p>El video permanece solo en esta pantalla. No se ha subido ni guardado.</p>
    <div aria-live="polite" aria-atomic="true">
      {selection.status === 'metadata_loading' && <p>Obteniendo y validando la duración del video…</p>}
      {selection.issue && <p>{videoIssueCopy(selection.issue)}</p>}
      <p>{selection.video ? 'Video seleccionado y listo para una futura carga.' : 'Sin video seleccionado.'}</p>
    </div>
    {selection.video && selection.previewUrl && <VideoPreview key={selection.video.id} video={selection.video} url={selection.previewUrl} />}
    {selection.video && renderVideo?.(selection.video, selection.clear)}
    {canClear && <button type="button" className="ui-button" disabled={disabled}
      onClick={event => {
        if (event.currentTarget.ownerDocument.activeElement === event.currentTarget) pendingFocus.current = event.currentTarget;
        selection.clear();
      }}>Quitar video</button>}
  </section>;
}
