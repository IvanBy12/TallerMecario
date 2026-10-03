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
const EMPTY_CHECKLIST: ChecklistForm = { code: '', label: '', status: 'not_checked', notes: '' };
const EMPTY_DAMAGE: DamageForm = { damageId: null, zoneCode: '', damageType: '', severity: 'minor', description: '' };
export function ReceptionInspection({ reception, editable, unavailable, coordinator, onChange, onEditing, onLock }: {
    readonly reception: ReceptionDetail; readonly editable: boolean; readonly unavailable: boolean;
    readonly coordinator: ReceptionCoordinator; readonly onChange: (data: ReceptionDetail) => void;
    readonly onEditing: (editing: boolean) => void; readonly onLock: () => void;
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
    const blocked = unavailable || action.blocked || !editable;
    const finish = () => { setMode(null); onEditing(false); setValidation(false); setConflict(false); setRecoveryFailure(null); };
    const begin = (next: 'checklist' | 'damages') => {
        if (blocked || mode !== null) return;
        setMode(next); onEditing(true); setValidation(false); setConflict(false); setRecovered(false); setRecoveryFailure(null);
    };
    const refresh = async () => {
        const result = await api.detail(reception.receptionId);
        if (signal.aborted) return;
        if (result.ok) {
            onChange(result.data); setRecovered(true); setRecoveryFailure(null);
            if (result.data.status !== 'open') onLock();
        } else { setRecoveryFailure(result.failure); action.observeFailure(result.failure); }
    };
    const save = () => {
        if (blocked || conflict || mode === null || !('updatedAt' in reception)) return;
        let body: JsonObject;
        if (mode === 'checklist') {
            const code = inspectionText(checklist.code, 64), label = inspectionText(checklist.label, 160), notes = normalizeReceptionText(checklist.notes);
            if (code === null || label === null || notes === false) { setValidation(true); return; }
            body = { expectedUpdatedAt: reception.updatedAt, items: [{ code, label, status: checklist.status, notes }] };
        } else {
            const zoneCode = inspectionText(damage.zoneCode, 64), damageType = inspectionText(damage.damageType, 64), description = normalizeReceptionText(damage.description);
            if (zoneCode === null || damageType === null || description === false ||
                (damage.damageId !== null && !reception.damages.some(item => item.damageId === damage.damageId))) { setValidation(true); return; }
            body = { expectedUpdatedAt: reception.updatedAt, damages: [{ operation: damage.damageId === null ? 'create' : 'update',
                ...(damage.damageId === null ? {} : { damageId: damage.damageId }), zoneCode, damageType, severity: damage.severity, description }] };
        }
        setValidation(false);
        void action.run(() => mode === 'checklist' ? api.patchChecklist(reception.receptionId, body) : api.patchDamages(reception.receptionId, body),
            data => { onChange(data); finish(); }, async error => {
                if (error.code === 'RESOURCE_VERSION_CONFLICT' || error.code === 'RECEPTION_NOT_EDITABLE' ||
                    ['network', 'timeout', 'server_error', 'contract_violation'].includes(error.kind)) {
                    setConflict(true); setRecovered(false);
                    if (error.code === 'RECEPTION_NOT_EDITABLE') onLock();
                    await refresh();
                }
            });
    };
    return <div className="reception-inspection">
        <section className="reception-evidence" aria-labelledby="checklist-heading"><h2 id="checklist-heading">Checklist</h2>
            {reception.checklist.length === 0 ? <p>Sin elementos registrados.</p> : <ul className="reception-list">{reception.checklist.map(item =>
                <li key={item.checkItemId}><p>{item.label}: {CHECKLIST_STATES[item.status]}</p>{item.notes !== null && <p className="reception-text">{item.notes}</p>}
                    {editable && <button type="button" disabled={blocked || mode !== null} onClick={() => {
                        setChecklist({ code: item.code, label: item.label, status: item.status, notes: item.notes ?? '' }); setExistingCode(true); begin('checklist');
                    }}>Editar elemento {item.label}</button>}</li>)}</ul>}
            {editable && <button type="button" disabled={blocked || mode !== null} onClick={() => { setChecklist(EMPTY_CHECKLIST); setExistingCode(false); begin('checklist'); }}>Agregar elemento de checklist</button>}
        </section>
        <section className="reception-evidence" aria-labelledby="damages-heading"><h2 id="damages-heading">Daños</h2>
            {reception.damages.length === 0 ? <p>Sin daños registrados.</p> : <ul className="reception-list">{reception.damages.map(item =>
                <li key={item.damageId}><p>{item.zoneCode} · {item.damageType} · {DAMAGE_SEVERITIES[item.severity]}</p>{item.description !== null && <p className="reception-text">{item.description}</p>}
                    {editable && <button type="button" disabled={blocked || mode !== null} onClick={() => {
                        setDamage({ damageId: item.damageId, zoneCode: item.zoneCode, damageType: item.damageType, severity: item.severity, description: item.description ?? '' }); begin('damages');
                    }}>Editar daño {item.zoneCode} · {item.damageType}</button>}</li>)}</ul>}
            {editable && <button type="button" disabled={blocked || mode !== null} onClick={() => { setDamage(EMPTY_DAMAGE); begin('damages'); }}>Agregar daño</button>}
        </section>
        {mode !== null && <form className="reception-evidence" aria-label={mode === 'checklist' ? 'Edición de checklist' : 'Edición de daño'} onSubmit={event => { event.preventDefault(); save(); }}>
            <fieldset disabled={blocked}>
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
            <RequestReference failure={action.failure}/><RequestReference failure={recoveryFailure}/>
            {conflict && <div role="alert"><p>La recepción cambió o no se pudo confirmar el guardado. Conservamos tus datos. Revisa el checklist y los daños actuales antes de volver a guardar.</p>
                {recovered ? editable && <button type="button" disabled={blocked} onClick={() => { setConflict(false); }}>He revisado la inspección actual</button> :
                    <button type="button" disabled={unavailable || action.blocked} onClick={() => { void action.run(async () => { await refresh(); return { ok: true, data: null }; }, () => undefined); }}>Volver a consultar inspección</button>}
            </div>}
            <div className="reception-actions"><button type="submit" disabled={blocked || conflict}>{mode === 'checklist' ? 'Guardar checklist' : 'Guardar daño'}</button>
                <button type="button" disabled={unavailable || action.blocked} onClick={finish}>Salir de inspección</button></div>
        </form>}
    </div>;
}
