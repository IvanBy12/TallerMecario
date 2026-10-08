import { useLayoutEffect, useRef, useState } from 'react';
import { PhotoPicker } from '@/shared/media/photo/photo-picker';
import { VideoPicker } from '@/shared/media/video/video-picker';
import type { ConfirmedMedia } from '@/shared/media/media-types';
import type { UploadExecutor } from '@/shared/media/upload-task-types';
import { can, useReception } from './reception-context';
import type { PrivacyConsent, PrivacyNotice } from './reception-contract';
import { ReceptionMediaUpload, type UploadCapacity } from './reception-media-upload';
import { RequestReference } from './request-reference';
import { useReceptionAction } from './use-reception-action';

function eligibleConsent(consent: { readonly status: string; readonly purposeCode: string }) {
  return consent.status === 'granted' && consent.purposeCode === 'service_provision';
}

interface ConfirmedItem { readonly localId: string; readonly label: string; readonly order: number; readonly media: ConfirmedMedia }
/** F02/F03 own selections/URLs; this screen stores counts, IDs and confirmed metadata only.
 * CONTRACT_DEPENDENCY: no production executor until photo/video + association contracts exist. */
export function ReceptionMedia({ consent, disabled = false, onPendingChange, executor }: {
  readonly consent: PrivacyConsent; readonly disabled?: boolean; readonly onPendingChange: (pending: boolean) => void;
  readonly executor?: UploadExecutor<undefined>;
}) {
  const { api, permissions, signal } = useReception();
  const action = useReceptionAction();
  const confirmedList = useRef<HTMLOListElement>(null);
  const focusConfirmed = useRef(false);
  const [notice, setNotice] = useState<PrivacyNotice | null>(null);
  const [adult, setAdult] = useState(false);
  const photoCount = useRef(0);
  const videoPresent = useRef(false);
  const [confirmed, setConfirmed] = useState<readonly ConfirmedItem[]>([]);
  useLayoutEffect(() => {
    if (!focusConfirmed.current) return;
    focusConfirmed.current = false;
    if (document.activeElement === document.body) confirmedList.current?.focus();
  }, [confirmed]);
  const order = useRef(new Map<string, number>());
  const serial = useRef(0);
  const active = useRef(new Set<string>());
  const [activeCount, setActiveCount] = useState(0);
  const authorized = () => can(permissions, 'receptions.create', true) && can(permissions, 'media.upload', true) &&
    eligibleConsent(consent) && !signal.aborted;
  const allowed = authorized();
  // Fixed cap of two explicit uploads across photos/video; no queue or automatic dispatch.
  const capacity: UploadCapacity = {
    full: activeCount >= 2,
    acquire(id) {
      if (active.current.has(id) || active.current.size >= 2) return false;
      active.current.add(id); setActiveCount(active.current.size); return true;
    },
    release(id) { if (active.current.delete(id)) setActiveCount(active.current.size); },
  };
  const confirm = (localId: string, label: string, media: ConfirmedMedia, release: () => void, restoreFocus: boolean) => {
    if (signal.aborted || !authorized()) return;
    focusConfirmed.current = restoreFocus;
    setConfirmed(previous => [...previous.filter(item => item.localId !== localId), {
      localId, label, media, order: order.current.get(localId) ?? ++serial.current,
    }].sort((a, b) => a.order - b.order));
    release();
  };
  const remember = (id: string) => { if (!order.current.has(id)) order.current.set(id, ++serial.current); };
  if (!allowed) return null;
  return <section className="reception-media" aria-label="Evidencia local de recepción">
    <h2>Fotos y video del vehículo</h2>
    <p>Estos archivos son opcionales y permanecen solo en esta pantalla. Al salir se liberan. La carga, asociación a recepción o daños y consulta de archivos existentes están pendientes del contrato de integración.</p>
    {notice === null ? <button type="button" disabled={disabled || action.blocked} onClick={() => {
      if (signal.aborted || !authorized()) return;
      void action.run(() => api.notice(), data => { setNotice(data.privacyNotice); });
    }}>Mostrar aviso para capturar evidencia</button> : <>
      <h3>Aviso de privacidad · {notice.privacyNoticeVersion}</h3>
      <p className="reception-text">{notice.privacyNoticeText}</p>
      <p className="reception-text">{notice.authorizationText}</p>
      <p>Responsable: {notice.controller.legalName} · {notice.controller.address} · {notice.controller.phone} · {notice.controller.email} · Derechos: {notice.controller.rightsChannel}</p>
      <label><input type="checkbox" checked={adult} disabled={disabled} onChange={event => { setAdult(event.currentTarget.checked); }}/>El propietario declara ser mayor de edad para la captura de evidencia.</label>
      {adult && <>
        <h3>Fotos</h3>
        <PhotoPicker disabled={disabled} onSelectionChange={photos => { photos.forEach(photo => { remember(photo.id); }); photoCount.current = photos.length; onPendingChange(photoCount.current > 0 || videoPresent.current); }}
          renderPhoto={(photo, position, release) => <ReceptionMediaUpload key={photo.id} id={photo.id} file={photo.file} label={`foto ${String(order.current.get(photo.id) ?? position)}`}
            executor={executor} signal={signal} disabled={disabled || !allowed} capacity={capacity} onConfirmed={(media, restoreFocus) => { confirm(photo.id, `Foto ${String(order.current.get(photo.id) ?? position)}`, media, release, restoreFocus); }}/>}/>
        <h3>Video de recorrido del vehículo</h3>
        <VideoPicker disabled={disabled} onSelectionChange={video => { if (video) remember(video.id); videoPresent.current = video !== null; onPendingChange(photoCount.current > 0 || videoPresent.current); }}
          renderVideo={(video, release) => <ReceptionMediaUpload key={`upload-${video.id}`} id={video.id} file={video.file} label="video" executor={executor}
            signal={signal} disabled={disabled || !allowed} capacity={capacity} onConfirmed={(media, restoreFocus) => { confirm(video.id, 'Video', media, release, restoreFocus); }}/>}/>
      </>}
    </>}
    <RequestReference failure={action.failure}/>
    {confirmed.length > 0 && <ol ref={confirmedList} tabIndex={-1} aria-label="Evidencia confirmada">{confirmed.map(item => <li key={item.media.mediaAssetId}>{item.label} · Guardado · Confirmado activo</li>)}</ol>}
  </section>;
}
