import { useEffect, useRef, useState } from 'react';
import { classifyFailure, type ApiFailure } from '@/shared/api/api-failure';
import type { ApiResult } from '@/shared/api/http-client';
import { can, useReception } from './reception-context';
import type { ReceptionDetail } from './reception-contract';
import { RECEPTION_ACCEPTANCE, SIGNATURE_MAX_BYTES } from './reception-acceptance';
import { ReceptionSignaturePad, type SignaturePadHandle } from './reception-signature-pad';
import { putSignature } from './reception-media-upload';
import { RequestReference } from './request-reference';
import { useReceptionAction } from './use-reception-action';
type Stage = 'idle' | 'drawing' | 'creating_upload_session' | 'uploading' | 'completing_upload' | 'attaching_signature' | 'success' | 'error';
interface Attempt {
    blob: Blob; key: string; name: string; document: string | null;
    sessionId: string | null; mediaId: string | null; uploaded: boolean; active: boolean; reconcile: boolean;
}
const AMBIGUOUS = new Set(['network', 'timeout', 'server_error', 'contract_violation']);
const RESTART = new Set(['UPLOAD_SESSION_EXPIRED', 'UPLOAD_SESSION_FAILED', 'UPLOAD_SESSION_ALREADY_COMPLETED', 'SIGNATURE_MEDIA_NOT_FOUND', 'SIGNATURE_MEDIA_NOT_ELIGIBLE', 'SIGNATURE_MEDIA_ALREADY_USED']);
const progress: Partial<Record<Stage, string>> = {
    creating_upload_session: 'Preparando firma…', uploading: 'Subiendo firma…',
    completing_upload: 'Verificando subida…', attaching_signature: 'Registrando firma…',
};
function invalid<T>(): ApiResult<T> { return { ok: false, failure: classifyFailure({ source: 'contract' }) }; }
export function ReceptionWorkflow({ reception, onChange, unavailable, onBusy, onEdit }: {
    readonly reception: ReceptionDetail; readonly onChange: (data: ReceptionDetail) => void;
    readonly unavailable: boolean; readonly onBusy: (busy: boolean) => void; readonly onEdit: () => void;
}) {
    const { api, permissions, signal } = useReception();
    const action = useReceptionAction();
    const [stage, setStage] = useState<Stage>('idle');
    const [name, setName] = useState(''), [document, setDocument] = useState(''), [read, setRead] = useState(false);
    const [hasInk, setHasInk] = useState(false), [validation, setValidation] = useState<string | null>(null);
    const [confirm, setConfirm] = useState(false), [openedAt, setOpenedAt] = useState<string | null>(null);
    const [closeNeedsReconcile, setCloseNeedsReconcile] = useState(false);
    const [closedHere, setClosedHere] = useState(false);
    const closeButton = useRef<HTMLButtonElement>(null), orderHeading = useRef<HTMLHeadingElement>(null);
    const pad = useRef<SignaturePadHandle>(null), dialog = useRef<HTMLDialogElement>(null);
    const attempt = useRef<Attempt | null>(null);
    const lifetime = useRef(new AbortController());
    useEffect(() => {
        lifetime.current = new AbortController();
        const controller = lifetime.current;
        return () => { controller.abort(); attempt.current = null; };
    }, []);
    const alive = () => !signal.aborted && !lifetime.current.signal.aborted;
    useEffect(() => { onBusy(action.busy); return () => { onBusy(false); }; }, [action.busy, onBusy]);
    useEffect(() => { if (confirm) dialog.current?.showModal(); }, [confirm]);
    useEffect(() => { if (closedHere && reception.status === 'closed') orderHeading.current?.focus(); }, [closedHere, reception.status]);
    const dismissClose = () => { dialog.current?.close(); setConfirm(false); closeButton.current?.focus(); };
    const blocked = action.blocked || unavailable;
    const canSign = reception.status === 'open' && reception.signature === null &&
        can(permissions, 'signatures.capture', true) && can(permissions, 'media.upload', true);
    const canClose = reception.status === 'open' && reception.signature !== null && can(permissions, 'receptions.close', true);
    const cancel = (): ApiResult<ReceptionDetail> => ({ ok: false, failure: classifyFailure({ source: 'transport', reason: 'aborted' }) });
    const resetEvidence = () => {
        attempt.current = null; pad.current?.clear(); setName(''); setDocument(''); setRead(false); setHasInk(false);
        setStage('success'); setValidation(null);
    };
    const refresh = async () => {
        const result = await api.detail(reception.receptionId);
        if (!alive()) return cancel();
        if (result.ok) onChange(result.data);
        return result;
    };
    const signature = (restart = false) => {
        if (!canSign || blocked || !alive()) return;
        if (attempt.current === null && (!name.trim() || name.length > 200 || document.length > 60 || !read || !hasInk)) {
            setValidation('Revisa el nombre, confirma la lectura y dibuja una firma antes de enviarla.'); return;
        }
        void action.run<ReceptionDetail>(async () => {
            setValidation(null);
            if (attempt.current === null) {
                setStage('creating_upload_session');
                const blob = await pad.current?.png();
                if (!alive()) return cancel();
                if (!blob || blob.size === 0 || blob.type !== 'image/png' || blob.size > SIGNATURE_MAX_BYTES) {
                    setValidation('Dibuja una firma PNG de hasta 2 MB.'); return invalid();
                }
                attempt.current = { blob, key: crypto.randomUUID(), name: name.trim(), document: document.trim() || null,
                    sessionId: null, mediaId: null, uploaded: false, active: false, reconcile: false };
            }
            const current = attempt.current;
            if (current.reconcile) {
                const latest = await refresh();
                if (!alive()) return cancel();
                if (!latest.ok) return latest;
                current.reconcile = false;
                if (latest.data.signature !== null) return latest;
                if (latest.data.status !== 'open') return invalid();
            }
            if (restart) {
                current.key = crypto.randomUUID(); current.sessionId = null; current.mediaId = null;
                current.uploaded = false; current.active = false;
            }
            if (!current.uploaded) {
                setStage('creating_upload_session');
                const session = await api.createSignatureUpload(current.blob.size, current.key, lifetime.current.signal);
                if (!alive()) return cancel();
                if (!session.ok) return session;
                current.sessionId = session.data.uploadSessionId; current.mediaId = session.data.mediaAssetId;
                setStage('uploading');
                const uploaded = await putSignature(session.data, current.blob, AbortSignal.any([signal, lifetime.current.signal]));
                if (!alive()) return cancel();
                if (!uploaded.ok) return uploaded;
                current.uploaded = true;
            }
            if (!current.active) {
                if (current.sessionId === null || current.mediaId === null) return invalid();
                setStage('completing_upload');
                const complete = await api.completeSignatureUpload(current.sessionId, current.mediaId, lifetime.current.signal);
                if (!alive()) return cancel();
                if (!complete.ok) {
                    if (complete.failure.code === 'UPLOAD_NOT_FOUND_IN_STORAGE') current.uploaded = false;
                    return complete;
                }
                if (complete.data.sizeBytes !== current.blob.size) return invalid();
                current.active = true;
            }
            if (current.mediaId === null) return invalid();
            setStage('attaching_signature');
            const attached = await api.attachSignature(reception.receptionId, current.mediaId, current.name, current.document, lifetime.current.signal);
            if (!alive()) return cancel();
            if (attached.ok) {
                const result = { ...reception, signature: { signatureId: attached.data.signatureId, documentVersion: attached.data.documentVersion, signedAt: attached.data.signedAt } };
                onChange(result); resetEvidence();
                const latest = await refresh();
                return !alive() ? cancel() : latest.ok ? { ok: true, data: { ...latest.data, signature: latest.data.signature ?? result.signature } } : { ok: true, data: result };
            }
            if (AMBIGUOUS.has(attached.failure.kind) || ['RECEPTION_ALREADY_SIGNED', 'SIGNATURE_MEDIA_ALREADY_USED', 'RECEPTION_NOT_EDITABLE'].includes(attached.failure.code ?? '')) {
                current.reconcile = true;
                const latest = await refresh();
                if (!alive()) return cancel();
                if (latest.ok) {
                    current.reconcile = false;
                    if (latest.data.signature !== null) return latest;
                }
            }
            return attached;
        }, data => { if (alive()) { onChange(data); resetEvidence(); } }, () => { if (alive()) setStage('error'); return Promise.resolve(); });
    };
    const close = () => {
        if (!canClose || blocked || !alive()) return;
        void action.run<ReceptionDetail>(async () => {
            if (closeNeedsReconcile) {
                const latest = await refresh();
                if (!alive()) return cancel();
                if (!latest.ok) return latest;
                setCloseNeedsReconcile(false);
                if (latest.data.status === 'closed' && latest.data.serviceOrder !== null) return latest;
                // A successful GET establishes that an explicit retry is safe.
                if (latest.data.status !== 'open' || latest.data.signature === null) return invalid();
            }
            const result = await api.close(reception.receptionId, lifetime.current.signal);
            if (!alive()) return cancel();
            if (result.ok) {
                if (result.data.serviceOrder.vehicleId !== reception.vehicleId || ('customerId' in reception && result.data.serviceOrder.customerId !== reception.customerId)) return invalid();
                const updated = { ...reception, status: result.data.reception.status, closedAt: result.data.reception.closedAt,
                    ...('updatedAt' in reception ? { updatedAt: result.data.reception.updatedAt } : {}),
                    serviceOrder: { id: result.data.serviceOrder.id, orderNumber: result.data.serviceOrder.orderNumber, status: result.data.serviceOrder.status } };
                setOpenedAt(result.data.serviceOrder.openedAt); onChange(updated);
                const latest = await refresh();
                return !alive() ? cancel() : latest.ok && latest.data.status === 'closed' && latest.data.serviceOrder !== null ? latest : { ok: true, data: updated };
            }
            if (['RECEPTION_SIGNATURE_REQUIRED', 'RECEPTION_NOT_CLOSABLE'].includes(result.failure.code ?? '')) {
                await refresh();
                if (!alive()) return cancel();
            }
            if (AMBIGUOUS.has(result.failure.kind)) {
                setCloseNeedsReconcile(true);
                const latest = await refresh();
                if (!alive()) return cancel();
                if (latest.ok) {
                    setCloseNeedsReconcile(false);
                    if (latest.data.status === 'closed' && latest.data.serviceOrder !== null) return latest;
                }
            }
            return result;
        }, data => { if (alive()) { onChange(data); dismissClose(); setClosedHere(true); } });
    };
    const failure: ApiFailure | null = action.failure;
    return <div className="reception-workflow">
        <section className="reception-evidence" aria-labelledby="signature-heading">
            <h2 id="signature-heading">Firma de recepción</h2>
            {reception.signature !== null ? <><p>Firma registrada</p><dl><dt>Documento</dt><dd>{reception.signature.documentVersion}</dd><dt>Firmado</dt><dd>{reception.signature.signedAt}</dd></dl></> :
                canSign ? <form onSubmit={event => { event.preventDefault(); signature(); }}>
                    <p>Documento de aceptación de esta recepción · {reception.receivedAt} · {reception.mileageKm} km</p>
                    <p className="reception-text reception-acceptance">{RECEPTION_ACCEPTANCE.text}</p>
                    <fieldset disabled={blocked || attempt.current !== null}>
                        <label>Nombre del firmante *<input required maxLength={200} value={name} onChange={e => { setName(e.target.value); }}/></label>
                        <label>Documento del firmante (opcional)<input maxLength={60} value={document} onChange={e => { setDocument(e.target.value); }}/></label>
                        <label className="reception-check"><input type="checkbox" checked={read} onChange={e => { setRead(e.target.checked); }}/>He leído el documento de aceptación mostrado.</label>
                    </fieldset>
                    <ReceptionSignaturePad ref={pad} disabled={blocked || attempt.current !== null} onDrawing={ink => { setHasInk(ink); if (attempt.current === null) setStage(ink ? 'drawing' : 'idle'); }}/>
                    {validation !== null && <p role="alert">{validation}</p>}
                    {attempt.current === null ? <button className="ui-button" type="submit" disabled={blocked || !name.trim() || !read || !hasInk}>Registrar firma</button> :
                        <><button className="ui-button" type="button" disabled={blocked || RESTART.has(failure?.code ?? '')} onClick={() => { signature(); }}>Reintentar registro de firma</button>
                        {RESTART.has(failure?.code ?? '') && <button className="ui-button" type="button" disabled={blocked} onClick={() => { signature(true); }}>Reiniciar subida</button>}
                        <button className="ui-button" type="button" disabled={blocked} onClick={() => { attempt.current = null; pad.current?.clear(); setStage('idle'); }}>Nueva firma</button></>}
                </form> : <p>{reception.status === 'open' ? 'Firma pendiente. Se requieren permisos de firma y subida de media en este taller.' : 'Sin firma registrada.'}</p>}
            {progress[stage] !== undefined && action.busy && <p role="status" aria-live="polite">{progress[stage]}</p>}
        </section>
        <RequestReference failure={failure} closing/>
        {failure?.code === 'RECEPTION_MILEAGE_CONFLICT' && can(permissions, 'receptions.update_open', true) && reception.status === 'open' &&
            <button className="ui-button" type="button" disabled={blocked} onClick={() => { dismissClose(); onEdit(); }}>Volver a edición</button>}
        <section className="reception-evidence" aria-labelledby="close-heading">
            <h2 ref={orderHeading} tabIndex={-1} id="close-heading">{reception.status === 'closed' ? 'Orden de servicio' : 'Cierre de recepción'}</h2>
            {reception.serviceOrder !== null && <><h3>Orden #{reception.serviceOrder.orderNumber}</h3>
                <p>Estado: {reception.serviceOrder.status === 'reception' ? 'Recepción' : reception.serviceOrder.status}</p>
                {openedAt !== null && <p>Fecha de apertura: {openedAt}</p>}<p role="status">Generada correctamente</p></>}
            {reception.status === 'open' && reception.signature === null && <p>Registra la firma de recepción antes de cerrarla.</p>}
            {canClose && <button ref={closeButton} className="ui-button" type="button" disabled={blocked} onClick={() => { setConfirm(true); }}>Cerrar recepción</button>}
            {action.busy && confirm && <p role="status">Cerrando recepción…</p>}
        </section>
        {confirm && <dialog ref={dialog} className="reception-close-dialog" aria-labelledby="close-title" onCancel={event => {
            event.preventDefault(); if (!action.busy) dismissClose();
        }}><h2 id="close-title">Cerrar recepción</h2>
            <p>Al cerrar la recepción se creará la orden de servicio y la recepción dejará de ser editable.</p>
            <RequestReference failure={failure} closing/>
            {action.busy && <p role="status">Cerrando recepción…</p>}
            <div className="reception-actions"><button className="ui-button" type="button" autoFocus disabled={action.busy} onClick={dismissClose}>Cancelar</button>
            <button className="ui-button" type="button" disabled={blocked || !canClose} onClick={close}>Cerrar recepción</button></div>
        </dialog>}
    </div>;
}
