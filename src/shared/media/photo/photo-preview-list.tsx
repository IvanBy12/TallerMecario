import { useEffect, useState } from 'react';
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

export function PhotoPreviewList({ photos, onRemove, disabled = false }: {
  readonly photos: readonly PhotoSelection[];
  readonly onRemove: (id: string) => void;
  readonly disabled?: boolean;
}) {
  return <ol className="photo-preview-list" aria-label="Fotos seleccionadas">
    {photos.map((photo, index) => <li key={photo.id}>
      <PhotoPreview photo={photo} position={index + 1} />
      <p>Foto {index + 1}</p>
      <button className="ui-button" type="button" disabled={disabled}
        aria-label={`Quitar foto ${String(index + 1)}`} onClick={() => { onRemove(photo.id); }}>Quitar</button>
    </li>)}
  </ol>;
}
