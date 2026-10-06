import { useEffect, useEffectEvent, useId, useState, type ChangeEvent } from 'react';
import { StatusBanner } from '@/shared/ui/status-banner';
import { PhotoPreviewList } from './photo-preview-list';
import { usePhotoSelection } from './photo-selection';
import type { PhotoSelection, PhotoValidationPolicy } from './photo-types';
import { photoIssueCopy } from './photo-validation';

export interface PhotoPickerProps {
  readonly policy?: PhotoValidationPolicy;
  readonly disabled?: boolean;
  /** In-memory selections only, without preview URLs. Never persist/log them.
   * Parent consumers must release retained Files when clearing/unmounting.
   * Mount with a new key to reset both selection and notice acknowledgement.
   */
  readonly onSelectionChange?: (photos: readonly PhotoSelection[]) => void;
}

export function PhotoPicker({ policy, disabled = false, onSelectionChange }: PhotoPickerProps) {
  const id = useId();
  const [noticeRead, setNoticeRead] = useState(false);
  const selection = usePhotoSelection(policy);
  const blocked = disabled || !noticeRead;
  const reportSelection = useEffectEvent((photos: readonly PhotoSelection[]) => { onSelectionChange?.(photos); });
  useEffect(() => { reportSelection(selection.photos); }, [selection.photos]);
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!blocked && files.length > 0) selection.add(files);
  };
  return <section className="photo-picker" aria-label="Selección local de fotos">
    <StatusBanner tone="warning" title="Antes de tomar o seleccionar fotos">
      <p id={`${id}-notice`}>Enfoca las fotos en el vehículo y la evidencia. Evita capturar rostros/personas si no son necesarios y datos personales innecesarios.</p>
    </StatusBanner>
    <label className="photo-picker__acknowledgement">
      <input type="checkbox" checked={noticeRead} disabled={disabled} aria-describedby={`${id}-notice`}
        onChange={event => { setNoticeRead(event.currentTarget.checked); }} />
      He leído este aviso
    </label>
    <p id={`${id}-instructions`}>{disabled ? 'La selección de fotos está deshabilitada.' : !noticeRead
      ? 'Lee el aviso y marca la casilla para habilitar la cámara y la selección.'
      : 'Puedes agregar fotos varias veces. Si la cámara no está disponible, selecciona un archivo.'}</p>
    <div className="photo-picker__controls">
      <label htmlFor={`${id}-capture`}>Tomar foto</label>
      <input id={`${id}-capture`} type="file" accept="image/*" capture="environment" disabled={blocked}
        aria-describedby={`${id}-notice ${id}-instructions`} onChange={choose} />
      <label htmlFor={`${id}-gallery`}>Seleccionar fotos</label>
      <input id={`${id}-gallery`} type="file" accept="image/*" multiple disabled={blocked}
        aria-describedby={`${id}-notice ${id}-instructions`} onChange={choose} />
    </div>
    <p>Las fotos permanecen solo en esta pantalla. No se han subido ni guardado.</p>
    <div aria-live="polite" aria-atomic="true">
      {selection.issues.length > 0 && <ul aria-label="Problemas de selección">
        {selection.issues.map(issue => <li key={issue.position}>Archivo {issue.position}: {photoIssueCopy(issue.code)}</li>)}
      </ul>}
      <p>{selection.photos.length} {selection.photos.length === 1 ? 'foto seleccionada' : 'fotos seleccionadas'}</p>
    </div>
    <PhotoPreviewList photos={selection.photos} onRemove={selection.remove} disabled={disabled} />
    <button type="button" className="ui-button" disabled={disabled || selection.photos.length === 0}
      onClick={selection.clear}>Quitar todas las fotos</button>
  </section>;
}
