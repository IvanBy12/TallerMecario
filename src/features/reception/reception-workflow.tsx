import { useEffect, useRef, useState } from 'react';
import { classifyFailure } from '@/shared/api/api-failure';
import type { ApiResult } from '@/shared/api/http-client';
import { can, useReception } from './reception-context';
import type { ReceptionDetail } from './reception-contract';
import { RequestReference } from './request-reference';
import { useReceptionAction, type ReceptionCoordinator } from './use-reception-action';

function invalid<T>(): ApiResult<T> { return { ok: false, failure: classifyFailure({ source: 'contract' }) }; }
const AMBIGUOUS = new Set(['network', 'timeout', 'server_error', 'contract_violation']);
export function ReceptionWorkflow({ reception, onChange, unavailable, coordinator, onEdit }: {
    readonly reception: ReceptionDetail; readonly onChange: (data: ReceptionDetail) => void;
    readonly unavailable: boolean; readonly coordinator: ReceptionCoordinator; readonly onEdit: () => void;
}) {
    const { api, permissions, signal } = useReception();
    const action = useReceptionAction(coordinator);
    const [confirm, setConfirm] = useState(false), [openedAt, setOpenedAt] = useState<string | null>(null);
    const [closeNeedsReconcile, setCloseNeedsReconcile] = useState(false);
    const [closedHere, setClosedHere] = useState(false);
    const closeButton = useRef<HTMLButtonElement>(null), orderHeading = useRef<HTMLHeadingElement>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const lifetime = useRef(new AbortController());
    useEffect(() => {
        lifetime.current = new AbortController();
        const controller = lifetime.current;
        return () => { controller.abort(); };
    }, []);
    const alive = () => !signal.aborted && !lifetime.current.signal.aborted;
    useEffect(() => { if (confirm) dialog.current?.showModal(); }, [confirm]);
    useEffect(() => { if (closedHere && reception.status === 'closed') orderHeading.current?.focus(); }, [closedHere, reception.status]);
    const dismissClose = () => { dialog.current?.close(); setConfirm(false); closeButton.current?.focus(); };
    const blocked = action.blocked || unavailable;
    const canClose = reception.status === 'open' && can(permissions, 'receptions.close', true);
    const cancel = (): ApiResult<ReceptionDetail> => ({ ok: false, failure: classifyFailure({ source: 'transport', reason: 'aborted' }) });
    const refresh = async () => {
        const result = await api.detail(reception.receptionId);
        if (!alive()) return cancel();
        if (result.ok) onChange(result.data);
        return result;
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
                if (latest.data.status !== 'open') return invalid();
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
            if (result.failure.code === 'RECEPTION_NOT_CLOSABLE') {
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
    const failure = action.failure;
    return <div className="reception-workflow">
        {reception.signature !== null && <section className="reception-evidence" aria-labelledby="signature-heading">
            <h2 id="signature-heading">Firma de recepción</h2><p>Firma registrada</p>
            <dl><dt>Documento</dt><dd>{reception.signature.documentVersion}</dd><dt>Firmado</dt><dd>{reception.signature.signedAt}</dd></dl>
        </section>}
        <RequestReference failure={failure} closing/>
        {failure?.code === 'RECEPTION_MILEAGE_CONFLICT' && can(permissions, 'receptions.update_open', true) && reception.status === 'open' &&
            <button className="ui-button" type="button" disabled={blocked} onClick={() => { dismissClose(); onEdit(); }}>Volver a edición</button>}
        <section className="reception-evidence" aria-labelledby="close-heading">
            <h2 ref={orderHeading} tabIndex={-1} id="close-heading">{reception.status === 'closed' ? 'Orden de servicio' : 'Cierre de recepción'}</h2>
            {reception.serviceOrder !== null && <><h3>Orden #{reception.serviceOrder.orderNumber}</h3>
                <p>Estado: {reception.serviceOrder.status === 'reception' ? 'Recepción' : reception.serviceOrder.status}</p>
                {openedAt !== null && <p>Fecha de apertura: {openedAt}</p>}<p role="status">Generada correctamente</p></>}
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
