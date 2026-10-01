import { describe, expect, it } from 'vitest';
import { CONSENT, DETAIL, IDS, NOTICE, OWNER, RECEPTION, SUMMARY, TECH, TIME } from '@/test/render-reception';
import { currentOwner, parseConsent, parseConsents, parseNotice, parseOwners, parseReception, parseReceptionDetail, parseReceptions } from './reception-contract';
import { EMPTY_FORM, formOf, intakeBody, patchBody } from './reception-create-form';
describe('Track A reception parsers', () => {
    it('parses create/patch without exposing privacyConsentId', () => { expect(parseReception({ reception: RECEPTION })).toEqual(RECEPTION); });
    it('parses tenant detail and assigned detail independently', () => {
        expect(parseReceptionDetail({ reception: DETAIL })).toEqual(DETAIL);
        expect(parseReceptionDetail({ reception: TECH })).toEqual(TECH);
    });
    it.each(['customerNotes', 'advisorNotes', 'updatedAt'])('rejects partial tenant DTO with %s in assigned response', (field) => { expect(parseReceptionDetail({ reception: { ...TECH, [field]: TIME } })).toBeNull(); });
    it.each([null, {}, [], { receptions: [], nextCursor: '' }, { receptions: [RECEPTION], nextCursor: 3 }])('rejects malformed list %j', (value) => { expect(parseReceptions(value)).toBeNull(); });
    it.each([{ mileageKm: -1 }, { mileageKm: 1.5 }, { fuelLevelPct: 101 }, { status: 'cancelled' }, { vehicleId: 'bad' }, { updatedAt: null }, { updatedAt: '2026-10-01T15:04:05.123Z' }, { status: 'closed', closedAt: null }])('rejects malformed reception %j', (fields) => { expect(parseReception({ reception: { ...RECEPTION, ...fields } })).toBeNull(); });
    it('parses cursor as exact opaque text', () => { expect(parseReceptions({ receptions: [SUMMARY], nextCursor: 'opaque_cursor' })?.nextCursor).toBe('opaque_cursor'); });
    it('parses readonly checklist and damages', () => {
        const detail = { ...DETAIL, checklist: [{ checkItemId: IDS.other, code: 'lights', label: 'Luces', status: 'issue', notes: null, createdAt: TIME }], damages: [{ damageId: IDS.other, zoneCode: 'front', damageType: 'scratch', severity: 'minor', description: null, createdAt: TIME }] };
        expect(parseReceptionDetail({ reception: detail })).toEqual(detail);
        expect(parseReceptionDetail({ reception: { ...detail, damages: [{ ...detail.damages[0], severity: 'unknown' }] } })).toBeNull();
    });
    it('parses consent envelopes and notice preserving exact text and versions', () => {
        expect(parseConsent({ privacyConsent: CONSENT })).toEqual(CONSENT);
        expect(parseConsents({ privacyConsents: [CONSENT] })?.privacyConsents).toEqual([CONSENT]);
        expect(parseNotice({ privacyNotice: NOTICE })?.privacyNotice).toEqual(NOTICE);
        expect(parseConsent({ privacyConsent: { ...CONSENT, status: 'revoked' } })).toBeNull();
    });
    it('requires controller and every notice text', () => { expect(parseNotice({ privacyNotice: { ...NOTICE, controller: null } })).toBeNull(); });
    it('selects only the unique current primary owner', () => {
        expect(parseOwners({ owners: [OWNER] })?.owners[0]).toEqual(OWNER);
        expect(currentOwner([{ ...OWNER, validTo: TIME }, OWNER])).toEqual(OWNER);
        expect(currentOwner([])).toBeNull();
        expect(currentOwner([{ ...OWNER, isPrimary: false }])).toBeNull();
        expect(currentOwner([OWNER, { ...OWNER, ownershipId: IDS.reception }])).toBeNull();
    });
});
describe('intake form and OCC', () => {
    it('sends only changed fields and the exact microsecond token', () => {
        expect(patchBody({ ...formOf(RECEPTION), mileageKm: '101' }, RECEPTION, new Set(['mileageKm']))).toEqual({ expectedUpdatedAt: TIME, mileageKm: 101 });
        expect(patchBody(formOf(RECEPTION), RECEPTION, new Set())).toBeNull();
    });
    it('normalizes multiline notes, clears nullable values and retains Unicode', () => {
        expect(intakeBody({ mileageKm: '0', fuelLevelPct: '', customerNotes: '  A\r\nB  ', advisorNotes: ' ' })).toEqual({ mileageKm: 0, fuelLevelPct: null, customerNotes: 'A\nB', advisorNotes: null });
        expect(intakeBody({ ...EMPTY_FORM, mileageKm: '2147483647', customerNotes: '🔧' })).not.toBeNull();
    });
    it.each([{ mileageKm: '-1' }, { mileageKm: '1.5' }, { mileageKm: '2147483648' }, { fuelLevelPct: '101' }, { customerNotes: '\t' }, { customerNotes: '\ud800' }, { customerNotes: 'a'.repeat(2001) }])('rejects invalid inputs %j', (patch) => { expect(intakeBody({ ...EMPTY_FORM, mileageKm: '100', ...patch })).toBeNull(); });
});
it('includes an explicitly cleared note against the reread baseline, without changing untouched remote fields', () => {
    const fresh = '2026-10-01T15:04:05.999999Z';
    const baseline = { ...RECEPTION, customerNotes: 'nota remota', advisorNotes: 'nota interna remota', updatedAt: fresh };
    expect(patchBody(formOf(RECEPTION), baseline, new Set(['customerNotes']))).toEqual({ expectedUpdatedAt: fresh, customerNotes: null });
});
it('omits explicitly edited values that already match the current baseline', () => {
    const baseline = { ...RECEPTION, mileageKm: 101, advisorNotes: 'nota interna remota' };
    expect(patchBody({ ...formOf(RECEPTION), mileageKm: '101' }, baseline, new Set(['mileageKm']))).toBeNull();
});
