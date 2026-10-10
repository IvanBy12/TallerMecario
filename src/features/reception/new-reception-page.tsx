import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useVoluntaryExitGuard } from '@/shared/navigation/voluntary-exit';
import type { ApiFailure } from '@/shared/api/api-failure';
import { can, useReception } from './reception-context';
import { currentOwner, type Owner, type PrivacyConsent, type PrivacyNotice, type ReceptionSummary, type Vehicle } from './reception-contract';
import { EMPTY_FORM, intakeBody, type IntakeForm } from './reception-create-form';
import { ReceptionFields } from './reception-fields';
import { ReceptionPicker } from './reception-pickers';
import { ReceptionConsentStep } from './reception-consent-step';
import { ReceptionMedia, type ReceptionMediaCapability } from './reception-media';
import { RequestReference } from './request-reference';
import { useReceptionAction } from './use-reception-action';
export function NewReceptionPage({ mediaCapability: injectedCapability }: { readonly mediaCapability?: ReceptionMediaCapability }) {
    const { api, permissions, signal, mediaCapability: productionCapability } = useReception();
    const mediaCapability = injectedCapability ?? productionCapability;
    const action = useReceptionAction();
    const navigate = useNavigate();
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [owner, setOwner] = useState<Owner | null>(null);
    const [consent, setConsent] = useState<PrivacyConsent | null>(null);
    const [notice, setNotice] = useState<PrivacyNotice | null>(null);
    const [form, setForm] = useState<IntakeForm>(EMPTY_FORM);
    const [ownerProblem, setOwnerProblem] = useState(false);
    const [validatedOwner, setValidatedOwner] = useState(false);
    const [localMedia, setLocalMedia] = useState(false);
    const [mediaProcessing, setMediaProcessing] = useState(false);
    const [receptionId, setReceptionId] = useState<string | null>(null);
    const [allMediaAssociated, setAllMediaAssociated] = useState(false);
    const created = useRef<string | null>(null);
    const [discardMedia, setDiscardMedia] = useState(false);
    const [validation, setValidation] = useState(false);
    const [openConflict, setOpenConflict] = useState(false);
    const [existing, setExisting] = useState<readonly ReceptionSummary[]>([]);
    const [recoveryFailure, setRecoveryFailure] = useState<ApiFailure | null>(null);
    const allowed = can(permissions, 'receptions.create', true);
    const mediaEligible = mediaCapability.kind === 'available' && validatedOwner && consent !== null && can(permissions, 'media.upload', true);
    const pendingMedia = mediaEligible && localMedia;
    const creationLocked = action.blocked || receptionId !== null;
    const [mediaReleased, setMediaReleased] = useState(false);
    const releaseMedia = useCallback(() => { setMediaReleased(true); }, []);
    useVoluntaryExitGuard(!mediaReleased && (pendingMedia || mediaProcessing), {
        signal, release: releaseMedia,
        message: 'Hay evidencia del vehículo pendiente de guardar. Si sales, los archivos locales se perderán y las cargas en curso se cancelarán. ' +
            (receptionId === null ? 'La recepción todavía no se ha creado. ¿Deseas salir?' : 'La recepción ya creada permanecerá guardada. ¿Deseas salir?'),
    });
    const clearLocalMedia = () => { setLocalMedia(false); setDiscardMedia(false); };
    const choose = (v: Vehicle) => {
        clearLocalMedia();
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
        // Invalidate capture immediately, before the owner read can settle.
        clearLocalMedia();
        setValidatedOwner(false);
        setConsent(null);
        setNotice(null);
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
        clearLocalMedia();
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
        if (created.current !== null || mediaProcessing || signal.aborted) return;
        const fields = intakeBody(form);
        if (fields === null || vehicle === null || owner === null || consent === null || !validatedOwner || !allowed) {
            setValidation(true);
            return;
        }
        setValidation(false);
        setRecoveryFailure(null);
        void action.run(() => api.create({ ...fields, vehicleId: vehicle.vehicleId, customerId: owner.customerId, privacyConsentId: consent.privacyConsentId }), (r) => {
            if (signal.aborted) return;
            created.current = r.receptionId;
            setReceptionId(r.receptionId);
            if (!pendingMedia || discardMedia) { if (discardMedia) flushSync(releaseMedia); void navigate(`/recepciones/${r.receptionId}`); }
        }, async (error) => {
            if (error.code === 'PRIVACY_CONSENT_NOT_ELIGIBLE' || error.code === 'PRIVACY_CONSENT_NOT_FOUND') {
                clearLocalMedia();
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
                clearLocalMedia();
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
      <ReceptionPicker kind="vehicle" disabled={creationLocked} onVehicle={choose}/>
      {vehicle !== null && <><h2>Vehículo: {vehicle.plate}</h2><p>{vehicle.brand} {vehicle.model} · Kilometraje registrado: {vehicle.currentMileageKm ?? 'Sin registrar'}</p><button type="button" disabled={creationLocked} onClick={prepare}>Consultar propietario vigente</button></>}
      {ownerProblem && <p role="alert">No hay un único propietario principal vigente. Corrige la propiedad en CRM antes de continuar.</p>}
      {owner !== null && <><h2>Propietario: {owner.customer.firstName} {owner.customer.lastName}</h2><p>El propietario principal vigente debe entregar el vehículo.</p>{!validatedOwner && <button type="button" disabled={creationLocked} onClick={confirmOwner}>Confirmar propietario y consultar autorización</button>}</>}
      {consent !== null && <p role="status">Autorización vigente para la prestación del servicio.</p>}
      {notice !== null && owner !== null && <ReceptionConsentStep key={`${owner.customerId}:${notice.privacyNoticeVersion}:${notice.authorizationTextVersion}`} customerId={owner.customerId} notice={notice} onConsent={(c) => { setConsent(c); setNotice(null); }} onReload={reloadNotice}/>}
      {validatedOwner && consent === null && notice === null && !action.busy && <button type="button" disabled={creationLocked} onClick={reloadNotice}>Consultar aviso y recapturar autorización</button>}
      {!mediaReleased && vehicle !== null && owner !== null && validatedOwner && consent !== null && can(permissions, 'media.upload', true) && <ReceptionMedia key={`${vehicle.vehicleId}:${owner.customerId}:${consent.privacyConsentId}`} consent={consent} capability={mediaCapability} disabled={action.blocked} receptionId={receptionId} onProcessingChange={setMediaProcessing} onAllAssociated={() => { setAllMediaAssociated(true); }} onPendingChange={(pending) => { setLocalMedia(pending); setDiscardMedia(false); }}/>}
      {receptionId !== null && <section aria-label="Recepción creada">
        <p role="status">Recepción creada. Ahora puedes completar la carga de la evidencia.</p>
        {!allMediaAssociated ? <>
          <p>La recepción ya existe. Hay evidencia sin asociación confirmada. Al continuar se liberarán los archivos locales que aún permanecen en esta pantalla.</p>
          <button type="button" onClick={() => { void navigate(`/recepciones/${receptionId}`); }}>Continuar a la recepción sin completar esta evidencia</button>
        </> : <>
          <p>Toda la evidencia seleccionada está guardada en la recepción.</p>
          <button type="button" onClick={() => { void navigate(`/recepciones/${receptionId}`); }}>Continuar a la recepción</button>
        </>}
      </section>}
      <form onSubmit={(e) => { e.preventDefault(); create(); }}><ReceptionFields form={form} onChange={setForm} disabled={creationLocked}/>
        {validation && <p role="alert">Revisa los datos de ingreso y confirma vehículo, propietario y autorización.</p>}
        {receptionId === null && pendingMedia && <label><input type="checkbox" checked={discardMedia} disabled={creationLocked} onChange={(e) => { setDiscardMedia(e.target.checked); }}/>Crear la recepción sin estos archivos locales. Al continuar se liberarán de esta pantalla.</label>}
        <button type="submit" disabled={creationLocked || mediaProcessing || consent === null || !validatedOwner || openConflict}>Crear recepción</button>
      </form>
      {action.busy && <p role="status">Procesando recepción…</p>}<RequestReference failure={action.failure}/><RequestReference failure={recoveryFailure}/>
      {openConflict && <><button type="button" disabled={creationLocked} onClick={findOpen}>Buscar recepción abierta</button>{existing.map((r) => <p key={r.receptionId}><Link to={`/recepciones/${r.receptionId}`}>Abrir recepción existente · {r.receivedAt}</Link></p>)}</>}
      {action.failure !== null && vehicle !== null && owner === null && <button type="button" disabled={creationLocked} onClick={prepare}>Reintentar consulta de propietario</button>}
    </>}
  </section>;
}
