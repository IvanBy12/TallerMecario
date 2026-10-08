import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PhotoSelection } from './photo-types';

function PhotoPreview({ photo, position }: { readonly photo: PhotoSelection; readonly position: number }) {
  const [preview, setPreview] = useState<{ readonly file: File; readonly url: string } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    let url: string;
    try { url = URL.createObjectURL(photo.file); }
    catch { return; }
    setPreview({ file: photo.file, url });
    // Only this effect owns this URL. Cleanup happens after DOM removal or
    // replacement, and Strict Mode's probe balances its own URL separately.
    return () => { URL.revokeObjectURL(url); };
  }, [photo.file]);
  const url = preview?.file === photo.file ? preview.url : null;
  return url === null || failedUrl === url
    ? <p role="status">Vista previa no disponible para la foto {position}. Puedes quitarla y seleccionar otra.</p>
    : <img src={url} alt={`Vista previa de la foto ${String(position)}`} onError={() => { setFailedUrl(url); }} />;
}

export function PhotoPreviewList({ photos, onRemove, onEmptyFocus, renderPhoto, disabled = false }: {
  readonly photos: readonly PhotoSelection[];
  readonly onRemove: (id: string) => void;
  readonly onEmptyFocus?: () => void;
  readonly disabled?: boolean;
  readonly renderPhoto?: (photo: PhotoSelection, position: number) => ReactNode;
}) {
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ readonly id: string; readonly index: number; readonly button: HTMLButtonElement } | null>(null);
  useLayoutEffect(() => {
    const intent = pendingFocus.current;
    if (!intent || photos.some(photo => photo.id === intent.id)) return;
    pendingFocus.current = null;
    const { activeElement, body } = intent.button.ownerDocument;
    // Restore only after removal, without stealing focus moved elsewhere meanwhile.
    if (activeElement !== body && activeElement !== intent.button) return;
    const target = photos[Math.min(intent.index, photos.length - 1)];
    if (target) removeButtons.current.get(target.id)?.focus();
    else onEmptyFocus?.();
  }, [photos, onEmptyFocus]);
  return <ol className="photo-preview-list" aria-label="Fotos seleccionadas">
    {photos.map((photo, index) => <li key={photo.id}>
      <PhotoPreview photo={photo} position={index + 1} />
      <p>Foto {index + 1}</p>
      {renderPhoto?.(photo, index + 1)}
      <button className="ui-button" type="button" disabled={disabled}
        ref={button => {
          if (button) removeButtons.current.set(photo.id, button);
          else removeButtons.current.delete(photo.id);
        }}
        aria-label={`Quitar foto ${String(index + 1)}`} onClick={event => {
          if (event.currentTarget.ownerDocument.activeElement === event.currentTarget) {
            pendingFocus.current = { id: photo.id, index, button: event.currentTarget };
          }
          onRemove(photo.id);
        }}>Quitar</button>
    </li>)}
  </ol>;
}
