import { useState } from 'react';
import type { ApiFailure } from '@/shared/api/api-failure';
import type { JsonObject } from '@/shared/api/http-client';
import { useReception } from './reception-context';
import type { ReceptionDetail } from './reception-contract';
import { normalizeReceptionText } from './reception-create-form';
import { CHECKLIST_STATES, DAMAGE_SEVERITIES, inspectionText, type ChecklistState, type DamageSeverity } from './reception-inspection-contract';
import { RequestReference } from './request-reference';
import { useReceptionAction, type ReceptionCoordinator } from './use-reception-action';
type ChecklistForm = { code: string; label: string; status: ChecklistState; notes: string };
type DamageForm = { damageId: string | null; zoneCode: string; damageType: string; severity: DamageSeverity; description: string };
type DamageCreate = { operation: 'create'; zoneCode: string; damageType: string; severity: DamageSeverity; description: string | null };
type CreateAttempt = { body: JsonObject };
const ambiguous = (error: ApiFailure) => ['network', 'timeout', 'server_error', 'contract_violation'].includes(error.kind);
const EMPTY_CHECKLIST: ChecklistForm = { code: '', label: '', status: 'not_checked', notes: '' };
const EMPTY_DAMAGE: DamageForm = { damageId: null, zoneCode: '', damageType: '', severity: 'minor', description: '' };
export function ReceptionInspection({ reception, editable, unavailable, coordinator, onChange, onEditing, onRecoveryPending, onLock }: {
    readonly reception: ReceptionDetail; readonly editable: boolean; readonly unavailable: boolean;
    readonly coordinator: ReceptionCoordinator; readonly onChange: (data: ReceptionDetail) => void;
    readonly onEditing: (editing: boolean) => void; readonly onRecoveryPending: (pending: boolean) => void; readonly onLock: () => void;
}) {
    const { api, signal } = useReception();
    const action = useReceptionAction(coordinator);
    const [mode, setMode] = useState<'checklist' | 'damages' | null>(null);
    const [checklist, setChecklist] = useState<ChecklistForm>(EMPTY_CHECKLIST);
    const [existingCode, setExistingCode] = useState(false);
    const [damage, setDamage] = useState<DamageForm>(EMPTY_DAMAGE);
    const [validation, setValidation] = useState(false);
    const [conflict, setConflict] = useState(false);
    const [recovered, setRecovered] = useState(false);
    const [recoveryFailure, setRecoveryFailure] = useState<ApiFailure | null>(null);
    const [recoveryReception, setRecoveryReception] = useState<ReceptionDetail | null>(null);
    const [ambiguousCreate, setAmbiguousCreate] = useState<CreateAttempt | null>(null);
    const [reviewed, setReviewed] = useState(false);
    const blocked = unavailable || action.blocked || !editable;
    const createVersionUnchanged = ambiguousCreate !== null && recoveryReception !== null &&
        'updatedAt' in recoveryReception && recoveryReception.updatedAt === ambiguousCreate.body['expectedUpdatedAt'];
    const createVersionChanged = ambiguousCreate !== null && recoveryReception !== null &&
        'updatedAt' in recoveryReception && recoveryReception.updatedAt !== ambiguousCreate.body['expectedUpdatedAt'];
    const finish = () => { setMode(null); onEditing(false); setValidation(false); };
    const begin = (next: 'checklist' | 'damages') => {
        if (blocked || conflict || ambiguousCreate !== null || mode !== null) return;
        setMode(next); onEditing(true); setValidation(false); setConflict(false); setRecovered(false); setRecoveryFailure(null);
    };
    const refresh = async () => {
        setRecovered(false); setReviewed(false); setRecoveryReception(null);
        const result = await api.detail(reception.receptionId);
        if (signal.aborted) return;
        if (result.ok) {
            onChange(result.data); setRecoveryReception(result.data); setRecovered(true); setRecoveryFailure(null);
            if (result.data.status !== 'open') onLock();
        } else { setRecoveryFailure(result.failure); action.observeFailure(result.failure); }
    };
    const confirmed = (data: ReceptionDetail) => {
        onChange(data); setAmbiguousCreate(null); setConflict(false); setRecoveryFailure(null);
        setRecoveryReception(null); setRecovered(false); setReviewed(false);
        onRecoveryPending(false); finish();
    };
    const recover = async (error: ApiFailure, attempt: CreateAttempt | null) => {
        if (error.code === 'RESOURCE_VERSION_CONFLICT' || error.code === 'RECEPTION_NOT_EDITABLE' || ambiguous(error)) {
            setConflict(true); setRecovered(false); setReviewed(false); onRecoveryPending(true);
            if (attempt !== null && ambiguous(error)) setAmbiguousCreate(attempt);
            if (error.code === 'RECEPTION_NOT_EDITABLE') onLock();
            await refresh();
        }
    };
    const save = () => {
        if (blocked || conflict || ambiguousCreate !== null || mode === null || !('updatedAt' in reception)) return;
        let body: JsonObject;
        let attempt: CreateAttempt | null = null;
        if (mode === 'checklist') {
            const code = inspectionText(checklist.code, 64), label = inspectionText(checklist.label, 160), notes = normalizeReceptionText(checklist.notes);
            if (code === null || label === null || notes === false) { setValidation(true); return; }
            body = { expectedUpdatedAt: reception.updatedAt, items: [{ code, label, status: checklist.status, notes }] };
        } else {
            const zoneCode = inspectionText(damage.zoneCode, 64), damageType = inspectionText(damage.damageType, 64), description = normalizeReceptionText(damage.description);
            if (zoneCode === null || damageType === null || description === false ||
                (damage.damageId !== null && !reception.damages.some(item => item.damageId === damage.damageId))) { setValidation(true); return; }
            const entry: DamageCreate = { operation: 'create', zoneCode, damageType, severity: damage.severity, description };
            body = { expectedUpdatedAt: reception.updatedAt, damages: [damage.damageId === null ? entry :
                { ...entry, operation: 'update', damageId: damage.damageId }] };
            if (damage.damageId === null) attempt = { body };
        }
        setValidation(false);
        void action.run(() => mode === 'checklist' ? api.patchChecklist(reception.receptionId, body) : api.patchDamages(reception.receptionId, body),
            confirmed, error => recover(error, ambiguous(error) ? attempt : null));
    };
    const retryCreate = () => {
        if (blocked || !recovered || !reviewed || !createVersionUnchanged) return;
        const attempt = ambiguousCreate;
        void action.run(() => api.patchDamages(reception.receptionId, attempt.body), confirmed, error => recover(error, attempt));
    };
    const associateDamage = (damageId: string) => {
        if (blocked || !recovered || !createVersionChanged) return;
        const canonical = recoveryReception.damages.find(item => item.damageId === damageId);
        if (canonical === undefined) return;
        // Serialize this explicit local decision with the other reception actions.
        // Selection preserves the server snapshot and performs no HTTP mutation.
        void action.run(() => Promise.resolve({ ok: true as const, data: canonical }), item => {
            setDamage({ damageId: item.damageId, zoneCode: item.zoneCode, damageType: item.damageType,
                severity: item.severity, description: item.description ?? '' });
            confirmed(recoveryReception);
        });
    };
    return <div className="reception-inspection">
        <section className="reception-evidence" aria-labelledby="checklist-heading"><h2 id="checklist-heading">Checklist</h2>
            {reception.checklist.length === 0 ? <p>Sin elementos registrados.</p> : <ul className="reception-list">{reception.checklist.map(item =>
                <li key={item.checkItemId}><p>{item.label}: {CHECKLIST_STATES[item.status]}</p>{item.notes !== null && <p className="reception-text">{item.notes}</p>}
                    {editable && <button type="button" disabled={blocked || conflict || mode !== null} onClick={() => {
                        setChecklist({ code: item.code, label: item.label, status: item.status, notes: item.notes ?? '' }); setExistingCode(true); begin('checklist');
                    }}>Editar elemento {item.label}</button>}</li>)}</ul>}
            {editable && <button type="button" disabled={blocked || conflict || mode !== null} onClick={() => { setChecklist(EMPTY_CHECKLIST); setExistingCode(false); begin('checklist'); }}>Agregar elemento de checklist</button>}
        </section>
        <section className="reception-evidence" aria-labelledby="damages-heading"><h2 id="damages-heading">Daños</h2>
            {reception.damages.length === 0 ? <p>Sin daños registrados.</p> : <ul className="reception-list">{reception.damages.map(item =>
                <li key={item.damageId}><p>{item.zoneCode} · {item.damageType} · {DAMAGE_SEVERITIES[item.severity]}</p>{item.description !== null && <p className="reception-text">{item.description}</p>}
                    {editable && <button type="button" disabled={blocked || conflict || mode !== null} onClick={() => {
                        setDamage({ damageId: item.damageId, zoneCode: item.zoneCode, damageType: item.damageType, severity: item.severity, description: item.description ?? '' }); begin('damages');
                    }}>Editar daño {item.zoneCode} · {item.damageType}</button>}</li>)}</ul>}
            {editable && <button type="button" disabled={blocked || conflict || mode !== null} onClick={() => { setDamage(EMPTY_DAMAGE); begin('damages'); }}>Agregar daño</button>}
        </section>
        {mode !== null && <form className="reception-evidence" aria-label={mode === 'checklist' ? 'Edición de checklist' : 'Edición de daño'} onSubmit={event => { event.preventDefault(); save(); }}>
            <fieldset disabled={blocked || ambiguousCreate !== null}>
                {mode === 'checklist' ? <>
                    <legend>Elemento del checklist</legend>
                    <label>Código del elemento<input required readOnly={existingCode} value={checklist.code} onChange={e => { setChecklist(old => ({ ...old, code: e.target.value })); }}/></label>
                    <label>Elemento del checklist<input required value={checklist.label} onChange={e => { setChecklist(old => ({ ...old, label: e.target.value })); }}/></label>
                    <label>Estado del elemento<select value={checklist.status} onChange={e => {
                        const value = e.target.value; if (Object.hasOwn(CHECKLIST_STATES, value)) setChecklist(old => ({ ...old, status: value as ChecklistState }));
                    }}>{Object.entries(CHECKLIST_STATES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label>Notas del checklist (opcional)<textarea rows={3} value={checklist.notes} onChange={e => { setChecklist(old => ({ ...old, notes: e.target.value })); }}/></label>
                </> : <>
                    <legend>{damage.damageId === null ? 'Nuevo daño' : 'Editar daño existente'}</legend>
                    <label>Zona<input required value={damage.zoneCode} onChange={e => { setDamage(old => ({ ...old, zoneCode: e.target.value })); }}/></label>
                    <label>Tipo de daño<input required value={damage.damageType} onChange={e => { setDamage(old => ({ ...old, damageType: e.target.value })); }}/></label>
                    <label>Severidad<select value={damage.severity} onChange={e => {
                        const value = e.target.value; if (Object.hasOwn(DAMAGE_SEVERITIES, value)) setDamage(old => ({ ...old, severity: value as DamageSeverity }));
                    }}>{Object.entries(DAMAGE_SEVERITIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label>Descripción opcional<textarea rows={3} value={damage.description} onChange={e => { setDamage(old => ({ ...old, description: e.target.value })); }}/></label>
                </>}
            </fieldset>
            {validation && <p role="alert">Completa los campos obligatorios: códigos, zona y tipo hasta 64 caracteres; elemento hasta 160; notas y descripción hasta 2000, sin caracteres de control.</p>}
            {action.busy && <p role="status">Guardando inspección…</p>}
            <div className="reception-actions"><button type="submit" disabled={blocked || conflict}>{mode === 'checklist' ? 'Guardar checklist' : 'Guardar daño'}</button>
                <button type="button" disabled={unavailable || action.blocked} onClick={finish}>Salir de inspección</button></div>
        </form>}
        <RequestReference failure={action.failure}/><RequestReference failure={recoveryFailure}/>
        {conflict && <div role="alert"><p>La recepción cambió o no se pudo confirmar el guardado. Conservamos tus datos. Revisa el checklist y los daños actuales antes de volver a guardar.</p>
            {recovered && editable && !reviewed && (ambiguousCreate === null || createVersionUnchanged) && <button type="button" disabled={blocked} onClick={() => {
                setReviewed(true);
                if (ambiguousCreate === null) { setConflict(false); onRecoveryPending(false); }
            }}>He revisado la inspección actual</button>}
            {(!recovered || ambiguousCreate !== null) && <button type="button" disabled={unavailable || action.blocked} onClick={() => { void action.run(async () => { await refresh(); return { ok: true, data: null }; }, () => undefined); }}>Volver a consultar inspección</button>}
            {ambiguousCreate !== null && <><p>No pudimos confirmar si este daño se registró. La recuperación sigue pendiente aunque salgas del editor.</p>
                {createVersionUnchanged && <><p>La versión no cambió. Puedes reintentar con los datos y la versión originales.</p>
                    <button type="button" disabled={blocked || !recovered || !reviewed} onClick={retryCreate}>Reintentar el daño original</button></>}
                {recovered && createVersionChanged && <section className="reception-evidence" aria-label="Asociación explícita de daño">
                    <p>La recepción cambió. Revisa los daños actuales y elige uno sólo si puedes identificarlo como el registrado. Elegirlo no modifica sus datos; cualquier cambio requiere una nueva edición.</p>
                    {recoveryReception.damages.length === 0 ? <p>No hay daños actuales que puedas asociar. La recuperación continúa pendiente.</p> :
                        <ul className="reception-list">{recoveryReception.damages.map(item => <li key={item.damageId}>
                            <dl><dt>ID del daño</dt><dd><code>{item.damageId}</code></dd><dt>Zona</dt><dd>{item.zoneCode}</dd>
                                <dt>Tipo</dt><dd>{item.damageType}</dd><dt>Severidad</dt><dd>{DAMAGE_SEVERITIES[item.severity]}</dd>
                                <dt>Descripción</dt><dd className="reception-text">{item.description ?? 'Sin descripción'}</dd></dl>
                            <button type="button" disabled={blocked} aria-label={'Usar este daño como el registrado: ' + item.damageId}
                                onClick={() => { associateDamage(item.damageId); }}>Usar este daño como el registrado</button>
                        </li>)}</ul>}
                </section>}
            </>}
        </div>}
    </div>;
}
