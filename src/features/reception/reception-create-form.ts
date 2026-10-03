import type { JsonObject } from '@/shared/api/http-client';
import { id, type Reception } from './reception-contract';
export interface IntakeForm {
    readonly mileageKm: string;
    readonly fuelLevelPct: string;
    readonly customerNotes: string;
    readonly advisorNotes: string;
}
export type IntakeField = keyof IntakeForm;
export type EditedIntakeFields = ReadonlySet<IntakeField>;
export const EMPTY_FORM: IntakeForm = { mileageKm: '', fuelLevelPct: '', customerNotes: '', advisorNotes: '' };
export function formOf(r: Reception): IntakeForm { return { mileageKm: String(r.mileageKm), fuelLevelPct: r.fuelLevelPct === null ? '' : String(r.fuelLevelPct), customerNotes: r.customerNotes ?? '', advisorNotes: r.advisorNotes ?? '' }; }
export function normalizeReceptionText(value: string): string | null | false {
    for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = value.charCodeAt(i + 1);
            if (!(next >= 0xdc00 && next <= 0xdfff))
                return false;
            i += 1;
        }
        else if (code >= 0xdc00 && code <= 0xdfff)
            return false;
    }
    const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n');
    const trimmed = normalized.trim();
    return Array.from(trimmed).length > 2000 || Array.from(normalized).some((char) => { const code = char.charCodeAt(0); return (code <= 31 && code !== 10) || (code >= 127 && code <= 159) || [0x061c, 0x200e, 0x200f].includes(code) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069); }) ? false : trimmed || null;
}
export function intakeBody(form: IntakeForm): JsonObject | null {
    if (!/^\d+$/.test(form.mileageKm) || (form.fuelLevelPct !== '' && !/^\d+$/.test(form.fuelLevelPct)))
        return null;
    const mileageKm = Number(form.mileageKm), fuelLevelPct = form.fuelLevelPct === '' ? null : Number(form.fuelLevelPct);
    const customerNotes = normalizeReceptionText(form.customerNotes), advisorNotes = normalizeReceptionText(form.advisorNotes);
    return mileageKm > 2147483647 || (fuelLevelPct !== null && fuelLevelPct > 100) || customerNotes === false || advisorNotes === false ? null : { mileageKm, fuelLevelPct, customerNotes, advisorNotes };
}
export function patchBody(form: IntakeForm, baseline: Reception, editedFields: EditedIntakeFields): JsonObject | null {
    const body = intakeBody(form);
    if (body === null)
        return null;
    const patch: Record<string, string | number | null> = { expectedUpdatedAt: baseline.updatedAt };
    for (const key of ['mileageKm', 'fuelLevelPct', 'customerNotes', 'advisorNotes'] as const) {
        if (editedFields.has(key) && body[key] !== baseline[key])
            patch[key] = body[key] as string | number | null;
    }
    return Object.keys(patch).length > 1 ? patch : null;
}
const mutableFields = ['appointmentId', 'locationId', 'mileageKm', 'fuelLevelPct', 'customerNotes', 'advisorNotes'];
export function validReceptionBody(body: JsonObject, patch: boolean): boolean {
    const allowed = patch ? [...mutableFields, 'expectedUpdatedAt'] : [...mutableFields, 'vehicleId', 'customerId', 'privacyConsentId'];
    if (Object.keys(body).some((key) => !allowed.includes(key)))
        return false;
    if (patch) {
        if (typeof body['expectedUpdatedAt'] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(body['expectedUpdatedAt']) || !mutableFields.some((key) => Object.hasOwn(body, key)))
            return false;
    }
    else if (['vehicleId', 'customerId', 'privacyConsentId'].some((key) => id(body[key]) === null) || !Object.hasOwn(body, 'mileageKm'))
        return false;
    for (const key of ['appointmentId', 'locationId'])
        if (Object.hasOwn(body, key) && body[key] !== null && id(body[key]) === null)
            return false;
    const mileage = body['mileageKm'], fuel = body['fuelLevelPct'];
    if (Object.hasOwn(body, 'mileageKm') && (typeof mileage !== 'number' || !Number.isInteger(mileage) || mileage < 0 || mileage > 2147483647))
        return false;
    if (Object.hasOwn(body, 'fuelLevelPct') && fuel !== null && (typeof fuel !== 'number' || !Number.isInteger(fuel) || fuel < 0 || fuel > 100))
        return false;
    for (const key of ['customerNotes', 'advisorNotes']) {
        const value = body[key];
        if (Object.hasOwn(body, key) && value !== null && (typeof value !== 'string' || normalizeReceptionText(value) === false))
            return false;
    }
    return true;
}
