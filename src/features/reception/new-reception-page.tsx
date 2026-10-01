import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ApiFailure } from '@/shared/api/api-failure';
import { can, useReception } from './reception-context';
import { currentOwner, type Owner, type PrivacyConsent, type PrivacyNotice, type ReceptionSummary, type Vehicle } from './reception-contract';
import { EMPTY_FORM, intakeBody, type IntakeForm } from './reception-create-form';
import { ReceptionFields } from './reception-fields';
import { ReceptionPicker } from './reception-pickers';
import { ReceptionConsentStep } from './reception-consent-step';
import { RequestReference } from './request-reference';
import { useReceptionAction } from './use-reception-action';
export function NewReceptionPage() {
    const { api, permissions, signal } = useReception();
    const action = useReceptionAction();
    const navigate = useNavigate();
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [owner, setOwner] = useState<Owner | null>(null);
    const [consent, setConsent] = useState<PrivacyConsent | null>(null);
    const [notice, setNotice] = useState<PrivacyNotice | null>(null);
    const [form, setForm] = useState<IntakeForm>(EMPTY_FORM);
    const [ownerProblem, setOwnerProblem] = useState(false);
    const [validatedOwner, setValidatedOwner] = useState(false);
    const [validation, setValidation] = useState(false);
    const [openConflict, setOpenConflict] = useState(false);
    const [existing, setExisting] = useState<readonly ReceptionSummary[]>([]);
    const [recoveryFailure, setRecoveryFailure] = useState<ApiFailure | null>(null);
    const allowed = can(permissions, 'receptions.create', true);
    const choose = (v: Vehicle) => {
        setVehicle(v);
        setOwner(null);
        setConsent(null);
        setNotice(null);
        setExisting([]);
        setOpenConflict(false);
        setOwnerProblem(false);
        setValidatedOwner(false);
        setRecoveryFailure(null);
    };
    const prepare = () => {
        if (vehicle === null)
            return;
        void action.run(() => api.owners(vehicle.vehicleId), (data) => {
            const o = currentOwner(data.owners);
            setOwner(o);
            setOwnerProblem(o === null);
            setValidatedOwner(false);
            setConsent(null);
            setNotice(null);
            setRecoveryFailure(null);
        });
    };
    const confirmOwner = () => {
        if (owner === null)
            return;
        void action.run<{
            consent: PrivacyConsent | null;
            notice: PrivacyNotice | null;
        }>(async () => {
            const consents = await api.consents(owner.customerId);
            if (!consents.ok)
                return consents;
            const c = consents.data.privacyConsents[0];
            if (c !== undefined)
                return { ok: true, data: { consent: c, notice: null } } as const;
            const n = await api.notice();
            return n.ok ? { ok: true, data: { consent: null, notice: n.data.privacyNotice } } as const : n;
        }, (data) => { setConsent(data.consent); setNotice(data.notice); setValidatedOwner(true); });
    };
    const reloadNotice = () => {
        setNotice(null);
        setConsent(null);
        void action.run(() => api.notice(), (data) => { setNotice(data.privacyNotice); });
    };
    const findOpen = () => {
        if (vehicle === null)
            return;
        void action.run(() => api.list({ vehicleId: vehicle.vehicleId, status: 'open' }), (data) => { setExisting(data.receptions); setOpenConflict(data.receptions.length > 0); setRecoveryFailure(null); });
    };
    const create = () => {
        const fields = intakeBody(form);
        if (fields === null || vehicle === null || owner === null || consent === null || !validatedOwner || !allowed) {
            setValidation(true);
            return;
        }
        setValidation(false);
        setRecoveryFailure(null);
        void action.run(() => api.create({ ...fields, vehicleId: vehicle.vehicleId, customerId: owner.customerId, privacyConsentId: consent.privacyConsentId }), (r) => { void navigate(`/recepciones/${r.receptionId}`); }, async (error) => {
            if (error.code === 'PRIVACY_CONSENT_NOT_ELIGIBLE' || error.code === 'PRIVACY_CONSENT_NOT_FOUND') {
                setConsent(null);
                setNotice(null);
                const n = await api.notice();
                if (signal.aborted)
                    return;
                if (n.ok)
                    setNotice(n.data.privacyNotice);
                else {
                    setRecoveryFailure(n.failure);
                    action.observeFailure(n.failure);
                }
            }
            else if (error.code === 'RECEPTION_ALREADY_OPEN') {
                setOpenConflict(true);
                const open = await api.list({ vehicleId: vehicle.vehicleId, status: 'open' });
                if (signal.aborted)
                    return;
                if (open.ok) {
                    setExisting(open.data.receptions);
                    setOpenConflict(open.data.receptions.length > 0);
                }
                else {
                    setRecoveryFailure(open.failure);
                    action.observeFailure(open.failure);
                }
            }
            else if (error.code === 'VEHICLE_OWNERSHIP_CONFLICT') {
                setConsent(null);
                setNotice(null);
                setValidatedOwner(false);
                setOwner(null);
                const owners = await api.owners(vehicle.vehicleId);
                if (signal.aborted)
                    return;
                if (owners.ok) {
                    const o = currentOwner(owners.data.owners);
                    setOwner(o);
                    setOwnerProblem(o === null);
                }
                else {
                    setRecoveryFailure(owners.failure);
                    action.observeFailure(owners.failure);
                }
            }
        });
    };
    return <section className="reception-page"><h1>Nueva recepción</h1><Link to="/recepciones">Volver a recepciones</Link>
    {!allowed ? <p role="alert">No tienes permiso para crear recepciones.</p> : <>
      <ReceptionPicker kind="vehicle" disabled={action.blocked} onVehicle={choose}/>
      {vehicle !== null && <><h2>Vehículo: {vehicle.plate}</h2><p>{vehicle.brand} {vehicle.model} · Kilometraje registrado: {vehicle.currentMileageKm ?? 'Sin registrar'}</p><button type="button" disabled={action.blocked} onClick={prepare}>Consultar propietario vigente</button></>}
      {ownerProblem && <p role="alert">No hay un único propietario principal vigente. Corrige la propiedad en CRM antes de continuar.</p>}
      {owner !== null && <><h2>Propietario: {owner.customer.firstName} {owner.customer.lastName}</h2><p>El propietario principal vigente debe entregar el vehículo.</p>{!validatedOwner && <button type="button" disabled={action.blocked} onClick={confirmOwner}>Confirmar propietario y consultar autorización</button>}</>}
      {consent !== null && <p role="status">Autorización vigente para la prestación del servicio.</p>}
      {notice !== null && owner !== null && <ReceptionConsentStep key={`${owner.customerId}:${notice.privacyNoticeVersion}:${notice.authorizationTextVersion}`} customerId={owner.customerId} notice={notice} onConsent={(c) => { setConsent(c); setNotice(null); }} onReload={reloadNotice}/>}
      {validatedOwner && consent === null && notice === null && !action.busy && <button type="button" disabled={action.blocked} onClick={reloadNotice}>Consultar aviso y recapturar autorización</button>}
      <form onSubmit={(e) => { e.preventDefault(); create(); }}><ReceptionFields form={form} onChange={setForm} disabled={action.blocked}/>
        {validation && <p role="alert">Revisa los datos de ingreso y confirma vehículo, propietario y autorización.</p>}
        <button type="submit" disabled={action.blocked || consent === null || !validatedOwner || openConflict}>Crear recepción</button>
      </form>
      {action.busy && <p role="status">Procesando recepción…</p>}<RequestReference failure={action.failure}/><RequestReference failure={recoveryFailure}/>
      {openConflict && <><button type="button" disabled={action.blocked} onClick={findOpen}>Buscar recepción abierta</button>{existing.map((r) => <p key={r.receptionId}><Link to={`/recepciones/${r.receptionId}`}>Abrir recepción existente · {r.receivedAt}</Link></p>)}</>}
      {action.failure !== null && vehicle !== null && owner === null && <button type="button" disabled={action.blocked} onClick={prepare}>Reintentar consulta de propietario</button>}
    </>}
  </section>;
}
