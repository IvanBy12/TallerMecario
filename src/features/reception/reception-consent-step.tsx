import { useState } from 'react';
import type { PrivacyConsent, PrivacyNotice } from './reception-contract';
import { useReception } from './reception-context';
import { RequestReference } from './request-reference';
import { useReceptionAction } from './use-reception-action';
export function ReceptionConsentStep({ customerId, notice, onConsent, onReload }: {
    readonly customerId: string;
    readonly notice: PrivacyNotice;
    readonly onConsent: (consent: PrivacyConsent) => void;
    readonly onReload: () => void;
}) {
    const { api } = useReception();
    const action = useReceptionAction();
    const [adult, setAdult] = useState(false);
    const [authorized, setAuthorized] = useState(false);
    const capture = () => {
        if (!adult || !authorized)
            return;
        void action.run(async () => {
            const result = await api.capture(customerId, { purposeCode: 'service_provision', privacyNoticeVersion: notice.privacyNoticeVersion, authorizationTextVersion: notice.authorizationTextVersion, channel: 'in_person', adultAttestationConfirmed: true });
            if (!result.ok && result.failure.code === 'PRIVACY_CONSENT_ALREADY_GRANTED') {
                const existing = await api.consents(customerId);
                if (!existing.ok)
                    return existing;
                const consent = existing.data.privacyConsents[0];
                return consent === undefined ? result : { ok: true, data: consent } as const;
            }
            return result;
        }, onConsent);
    };
    return <section aria-labelledby="consent-title"><h2 id="consent-title">Autorización de datos personales</h2>
    <dl><dt>Responsable</dt><dd>{notice.controller.legalName}</dd><dt>Dirección</dt><dd>{notice.controller.address}</dd><dt>Teléfono</dt><dd>{notice.controller.phone ?? 'Sin teléfono'}</dd><dt>Correo</dt><dd>{notice.controller.email ?? 'Sin correo'}</dd><dt>Canal para ejercer derechos</dt><dd>{notice.controller.rightsChannel}</dd></dl>
    <h3>Aviso · {notice.privacyNoticeVersion}</h3><p className="reception-text">{notice.privacyNoticeText}</p>
    <h3>Autorización · {notice.authorizationTextVersion}</h3><p className="reception-text">{notice.authorizationText}</p>
    <label><input type="checkbox" checked={adult} disabled={action.blocked} onChange={(e) => { setAdult(e.target.checked); }}/>El propietario declara expresamente que es mayor de edad.</label>
    <label><input type="checkbox" checked={authorized} disabled={action.blocked} onChange={(e) => { setAuthorized(e.target.checked); }}/>El propietario autoriza el tratamiento descrito para la prestación del servicio.</label>
    <RequestReference failure={action.failure}/>{action.busy && <p role="status">Registrando autorización…</p>}
    <button type="button" disabled={!adult || !authorized || action.blocked} onClick={capture}>Registrar autorización</button>
    <button type="button" disabled={action.blocked} onClick={onReload}>Consultar aviso vigente</button>
  </section>;
}
