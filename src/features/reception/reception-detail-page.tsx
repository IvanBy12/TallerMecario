import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ApiFailure } from '@/shared/api/api-failure';
import { can, useReception } from './reception-context';
import type { Reception, ReceptionDetail } from './reception-contract';
import { EMPTY_FORM, formOf, patchBody, type EditedIntakeFields, type IntakeField, type IntakeForm } from './reception-create-form';
import { ReceptionFields } from './reception-fields';
import { RequestReference } from './request-reference';
import { useReceptionAction } from './use-reception-action';
import { ReceptionWorkflow } from './reception-workflow';
export function ReceptionDetailPage() {
    const { receptionId = '' } = useParams();
    return <ReceptionDetailContent key={receptionId} receptionId={receptionId}/>;
}
function ReceptionDetailContent({ receptionId }: {
    readonly receptionId: string;
}) {
    const { api, permissions, signal } = useReception();
    const { run, busy, blocked, failure, observeFailure } = useReceptionAction();
    const [reception, setReception] = useState<ReceptionDetail | null>(null);
    const [editedFields, setEditedFields] = useState<EditedIntakeFields>(() => new Set<IntakeField>());
    const [baseline, setBaseline] = useState<Reception | null>(null);
    const [form, setForm] = useState<IntakeForm>(EMPTY_FORM);
    const [workflowBusy, setWorkflowBusy] = useState(false);
    const [editing, setEditing] = useState(false);
    const [locked, setLocked] = useState(false);
    const [recoveryFailure, setRecoveryFailure] = useState<ApiFailure | null>(null);
    const [validation, setValidation] = useState(false);
    const [conflicted, setConflicted] = useState(false);
    const allowed = can(permissions, 'receptions.read');
    const load = useCallback(() => run(() => api.detail(receptionId), setReception), [api, receptionId, run]);
    useEffect(() => {
        if (allowed)
            void load();
    }, [allowed, load]);
    const editable = reception !== null && 'customerId' in reception && reception.status === 'open' && can(permissions, 'receptions.update_open', true) && !locked;
    const refreshConflict = async () => {
        const latest = await api.detail(receptionId);
        if (signal.aborted)
            return;
        if (!latest.ok) {
            setRecoveryFailure(latest.failure);
            observeFailure(latest.failure);
            return;
        }
        setRecoveryFailure(null);
        setReception(latest.data);
        if ('customerId' in latest.data && latest.data.status === 'open' && !locked) {
            setBaseline(latest.data);
            setConflicted(true);
        }
        else
            setLocked(true);
    };
    const save = () => {
        if (workflowBusy || !editable || baseline === null || conflicted || recoveryFailure !== null)
            return;
        const body = patchBody(form, baseline, editedFields);
        if (body === null) {
            setValidation(true);
            return;
        }
        setValidation(false);
        void run(() => api.patch(receptionId, body), (r) => {
            setReception((old) => old === null ? null : { ...old, ...r });
            setEditing(false);
            setBaseline(null);
            setEditedFields(new Set<IntakeField>());
        }, async (error) => {
            if (error.code === 'RESOURCE_VERSION_CONFLICT' || error.code === 'RECEPTION_NOT_EDITABLE') {
                if (error.code === 'RECEPTION_NOT_EDITABLE')
                    setLocked(true);
                setConflicted(true);
                await refreshConflict();
            }
        });
    };
    return <section className="reception-page reception-detail"><h1>Detalle de recepción</h1><Link to="/recepciones">Volver a recepciones</Link>
    {!allowed ? <p role="alert">No tienes permiso para consultar recepciones.</p> : <>
      {busy && <p role="status">Cargando recepción…</p>}<RequestReference failure={failure}/><RequestReference failure={recoveryFailure}/>
      {failure !== null && !editing && <button type="button" disabled={blocked} onClick={() => { void load(); }}>Reintentar</button>}
      {reception !== null && <><dl><dt>Estado</dt><dd>{reception.status === 'open' ? 'Abierta' : 'Cerrada'}</dd><dt>Kilometraje</dt><dd>{reception.mileageKm} km</dd><dt>Combustible</dt><dd>{reception.fuelLevelPct === null ? 'Sin registrar' : `${String(reception.fuelLevelPct)}%`}</dd><dt>Recibido</dt><dd>{reception.receivedAt}</dd></dl>
        {'customerId' in reception && <><h2>Observaciones del cliente</h2><p className="reception-text">{reception.customerNotes ?? 'Sin observaciones'}</p><h2>Notas del asesor</h2><p className="reception-text">{reception.advisorNotes ?? 'Sin notas'}</p></>}
        <h2>Checklist</h2>{reception.checklist.length === 0 ? <p>Sin elementos registrados.</p> : <ul>{reception.checklist.map((item) => <li key={item.checkItemId}>{item.label}: {({ ok: 'Correcto', issue: 'Novedad', not_checked: 'Sin revisar', not_applicable: 'No aplica' })[item.status]}{item.notes !== null && <p>{item.notes}</p>}</li>)}</ul>}
        <h2>Daños</h2>{reception.damages.length === 0 ? <p>Sin daños registrados.</p> : <ul>{reception.damages.map((d) => <li key={d.damageId}>{d.zoneCode} · {d.damageType} · {({ minor: 'Leve', moderate: 'Moderado', severe: 'Grave' })[d.severity]}{d.description !== null && <p>{d.description}</p>}</li>)}</ul>}
        {editable && !editing && <button type="button" disabled={blocked || workflowBusy} onClick={() => {
                        if ('customerId' in reception) {
                            setBaseline(reception);
                            setEditedFields(new Set<IntakeField>());
                            setForm(formOf(reception));
                            setEditing(true);
                            setConflicted(false);
                            setRecoveryFailure(null);
                        }
                    }}>Editar recepción</button>}
        <ReceptionWorkflow reception={reception} onChange={setReception} unavailable={busy || editing || locked} onBusy={setWorkflowBusy} onEdit={() => {
            if ('customerId' in reception && editable) { setBaseline(reception); setForm(formOf(reception)); setEditedFields(new Set<IntakeField>()); setEditing(true); setConflicted(false); }
        }}/>
      </>}
      {editing && <form onSubmit={(e) => { e.preventDefault(); save(); }}><ReceptionFields form={form} onChange={setForm} onFieldEdited={(field) => { setEditedFields((previous) => new Set([...previous, field])); }} disabled={blocked || !editable}/>
        {validation && <p role="alert">Revisa los valores y modifica al menos un campo antes de guardar.</p>}
        {conflicted && editable && recoveryFailure === null && <><p>Valores actuales del servidor: {reception.mileageKm} km, combustible {reception.fuelLevelPct ?? 'sin registrar'}%. Observaciones: {baseline?.customerNotes ?? 'sin observaciones'}. Notas del asesor: {baseline?.advisorNotes ?? 'sin notas'}.</p><button type="button" disabled={blocked} onClick={() => { setConflicted(false); }}>He revisado la versión actual</button></>}
        {recoveryFailure !== null && <button type="button" disabled={blocked} onClick={() => {
                        void run(async () => api.detail(receptionId), (data) => {
                            setReception(data);
                            setRecoveryFailure(null);
                            if ('customerId' in data)
                                setBaseline(data);
                            if (data.status !== 'open')
                                setLocked(true);
                        });
                    }}>Volver a consultar recepción</button>}
        <button type="submit" disabled={blocked || !editable || conflicted || recoveryFailure !== null}>Guardar cambios</button><button type="button" disabled={blocked} onClick={() => { setEditing(false); setValidation(false); setEditedFields(new Set<IntakeField>()); }}>Salir de edición</button>
      </form>}
    </>}
  </section>;
}
