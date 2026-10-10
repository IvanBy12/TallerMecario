import { useEffect, useRef } from 'react';
import type { ReceptionMediaDto } from './reception-operational-media-types';
import { useOperationalGallery, useOperationalMediaView } from './use-operational-gallery';

function VideoEvidence({ url, label, onError }: { readonly url: string; readonly label: string; readonly onError: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (video === null) return;
    // Restore after StrictMode effect replay; never retain a detached playing element.
    video.src = url;
    return () => { video.pause(); video.removeAttribute('src'); video.load(); };
  }, [url]);
  return <video ref={ref} className="reception-evidence-view" crossOrigin="anonymous" src={url}
    aria-label={label} controls preload="none" onError={onError}/>;
}
const labels = { photo: 'Foto', video: 'Video', video360: 'Video 360°' };
function GalleryItem({ media, index }: { readonly media: ReceptionMediaDto; readonly index: number }) {
  const { state, blocked, open, close, inaccessible } = useOperationalMediaView(media.mediaAssetId);
  const label = `${labels[media.mediaType]} ${String(index + 1)}`;
  return <li><h3>{label}</h3>
    {state.kind === 'loading' && <p role="status">Solicitando acceso temporal…</p>}
    {state.kind === 'error' && <p role="alert">{state.message}</p>}
    {state.kind !== 'ready' && <button type="button" disabled={blocked || state.kind === 'loading'} onClick={() => { void open(); }}>Ver {label}</button>}
    {(state.kind === 'ready' || state.kind === 'loading') && <button type="button" onClick={close}>Ocultar {label}</button>}
    {state.kind === 'ready' && (media.mediaType === 'photo' ?
      <img className="reception-evidence-view" crossOrigin="anonymous" src={state.capability.downloadUrl} alt={`Evidencia de recepción: ${label}`} referrerPolicy="no-referrer" onError={inaccessible}/> :
      <VideoEvidence url={state.capability.downloadUrl} label={`Evidencia de recepción: ${label}`} onError={inaccessible}/>)}
  </li>;
}
export function ReceptionOperationalGallery({ receptionId }: { readonly receptionId: string }) {
  const { state, allowed, blocked, retry } = useOperationalGallery(receptionId);
  return <section aria-label="Evidencia de recepción"><h2>Fotos y video del vehículo</h2>
    {!allowed ? <p>No tienes permiso para consultar evidencias.</p> : <>
      {state.kind === 'loading' && <p role="status">Consultando evidencias…</p>}
      {state.kind === 'error' && <><p role="alert">{state.message}</p><button type="button" disabled={blocked} onClick={retry}>Consultar evidencias de nuevo</button></>}
      {state.kind === 'loaded' && (state.media.length === 0 ? <p>No hay evidencias asociadas a esta recepción.</p> :
        <ol className="reception-evidence-list">{state.media.map((media, index) => <GalleryItem key={media.mediaAssetId} media={media} index={index}/>)}</ol>)}
    </>}
  </section>;
}
