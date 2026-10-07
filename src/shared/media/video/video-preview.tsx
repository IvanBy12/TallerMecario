import { useState } from 'react';
import type { VideoSelection } from './video-types';

/** URL ownership stays with useVideoSelection; this view never allocates URLs.
 * Key this view by selection ID to reset preview failure on replacement.
 */
export function VideoPreview({ video, url }: { readonly video: VideoSelection; readonly url: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="video-preview">
    {failed ? <p role="status">Vista previa no disponible. Puedes quitar el video y seleccionar otro.</p>
      : <video src={url} controls preload="metadata" aria-label="Vista previa del video seleccionado"
        onError={() => { setFailed(true); }} />}
    <p>Duración: {video.durationSeconds.toLocaleString('es-CO', { maximumFractionDigits: 2 })} segundos</p>
  </div>;
}
