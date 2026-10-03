// Authority: Track A docs/api/reception-contract.md (2026-10-01), §§2,4,5; CRM S2 §13.4.
type Parser<T> = (value: unknown) => T | null;
type ValueOf<P> = P extends Parser<infer T> ? T : never;
export function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const text: Parser<string> = (v) => typeof v === 'string' ? v : null;
const nonempty: Parser<string> = (v) => typeof v === 'string' && v.length > 0 ? v : null;
export const id: Parser<string> = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) && v !== '00000000-0000-0000-0000-000000000000' && v !== 'ffffffff-ffff-ffff-ffff-ffffffffffff' ? v : null;
const timestamp: Parser<string> = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v) ? v : null;
const crmTimestamp: Parser<string> = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(v) ? v : null;
const integer = (max: number, min = 0): Parser<number> => (v) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;
const boolean: Parser<boolean> = (v) => typeof v === 'boolean' ? v : null;
const choices = <T extends string>(...values: readonly T[]): Parser<T> => (v) => values.find((item) => item === v) ?? null;
function nullable<T>(parser: Parser<T>): Parser<T | null> { return (v) => v === null ? null : parser(v); }
// A nullable field is accepted only when explicitly null or valid; missing fields fail.
const nullableParsers = new WeakSet();
function optionalNull<T>(parser: Parser<T>): Parser<T | null> {
    const p = nullable(parser);
    nullableParsers.add(p);
    return p;
}
function object<S extends Record<string, Parser<unknown>>>(fields: S): Parser<{
    [K in keyof S]: ValueOf<S[K]>;
}> {
    return (v) => {
        if (!record(v))
            return null;
        const result: Record<string, unknown> = {};
        for (const [key, parser] of Object.entries(fields)) {
            if (!Object.hasOwn(v, key) || (v[key] === null && !nullableParsers.has(parser)))
                return null;
            const parsed = parser(v[key]);
            if (parsed === null && v[key] !== null)
                return null;
            result[key] = parsed;
        }
        // Every field has been validated; TypeScript cannot infer a dynamically built mapped object.
        return result as {
            [K in keyof S]: ValueOf<S[K]>;
        };
    };
}
function array<T>(parser: Parser<T>): Parser<readonly T[]> {
    return (v) => {
        if (!Array.isArray(v))
            return null;
        const items: T[] = [];
        for (const item of v) {
            const parsed = parser(item);
            if (parsed === null)
                return null;
            items.push(parsed);
        }
        return items;
    };
}
const common = {
    receptionId: id, vehicleId: id, mileageKm: integer(2147483647), fuelLevelPct: optionalNull(integer(100)),
    status: choices('open', 'closed'), receivedAt: timestamp, closedAt: optionalNull(timestamp),
};
const full = {
    ...common, customerId: id, appointmentId: optionalNull(id), locationId: optionalNull(id), receivedByMembershipId: id,
    customerNotes: optionalNull(text), advisorNotes: optionalNull(text), createdAt: timestamp, updatedAt: timestamp,
};
const summaryParser = object({ ...common, customerId: id, updatedAt: timestamp });
const receptionParser = object(full);
const checklistParser = array(object({ checkItemId: id, code: nonempty, label: nonempty, status: choices('ok', 'issue', 'not_checked', 'not_applicable'), notes: optionalNull(text), createdAt: timestamp }));
const damagesParser = array(object({ damageId: id, zoneCode: nonempty, damageType: nonempty, severity: choices('minor', 'moderate', 'severe'), description: optionalNull(text), createdAt: timestamp }));
const signatureParser = object({ signatureId: id, documentVersion: nonempty, signedAt: crmTimestamp });
const orderSummaryParser = object({ id, orderNumber: nonempty, status: nonempty });
const details = { signature: optionalNull(signatureParser), serviceOrder: optionalNull(orderSummaryParser), checklist: checklistParser, damages: damagesParser };
const tenantDetail = object({ ...full, ...details });
const techDetail = object({ ...common, ...details });
export type Reception = NonNullable<ReturnType<typeof receptionParser>>;
export type ReceptionSummary = NonNullable<ReturnType<typeof summaryParser>>;
export type ReceptionDetail = NonNullable<ReturnType<typeof tenantDetail>> | NonNullable<ReturnType<typeof techDetail>>;
function statusConsistent<T extends {
    status: 'open' | 'closed';
    closedAt: string | null;
}>(value: T | null): T | null {
    return value !== null && (value.status === 'open' ? value.closedAt === null : value.closedAt !== null) ? value : null;
}
export function parseReception(body: unknown): Reception | null {
    return record(body) ? statusConsistent(receptionParser(body['reception'])) : null;
}
export function parseReceptionDetail(body: unknown): ReceptionDetail | null {
    if (!record(body) || !record(body['reception']))
        return null;
    const r = body['reception'];
    if (Object.hasOwn(r, 'customerId'))
        return statusConsistent(tenantDetail(r));
    // Reject partially stripped tenant DTOs; the assigned view never retains CRM or internal notes.
    if (['updatedAt', 'advisorNotes', 'customerNotes', 'receivedByMembershipId', 'appointmentId', 'locationId', 'createdAt'].some((k) => Object.hasOwn(r, k)))
        return null;
    return statusConsistent(techDetail(r));
}
const listParser = object({ receptions: array(summaryParser), nextCursor: optionalNull(nonempty) });
export function parseReceptions(body: unknown) {
    const parsed = listParser(body);
    return parsed !== null && parsed.receptions.every((r) => statusConsistent(r) !== null) ? parsed : null;
}
const consentParser = object({ privacyConsentId: id, customerId: id, purposeCode: choices('service_provision', 'marketing', 'image_use', 'appointment_reminders', 'service_notifications_whatsapp'), privacyNoticeVersion: nonempty, authorizationTextVersion: nonempty, channel: choices('web', 'in_person', 'whatsapp', 'email', 'phone', 'import', 'other'), status: choices('granted'), capturedAt: timestamp, createdAt: timestamp });
export type PrivacyConsent = NonNullable<ReturnType<typeof consentParser>>;
export const parseConsents = object({ privacyConsents: array(consentParser) });
export function parseConsent(body: unknown) { return record(body) ? consentParser(body['privacyConsent']) : null; }
export const parseNotice = object({ privacyNotice: object({ purposeCode: choices('service_provision'), privacyNoticeVersion: nonempty, privacyNoticeText: nonempty, authorizationTextVersion: nonempty, authorizationText: nonempty, controller: object({ legalName: nonempty, address: nonempty, phone: optionalNull(text), email: optionalNull(text), rightsChannel: nonempty }) }) });
export type PrivacyNotice = NonNullable<ReturnType<typeof parseNotice>>['privacyNotice'];
const vehicleParser = object({ vehicleId: id, plate: nonempty, vehicleType: choices('car', 'motorcycle', 'other'), brand: nonempty, model: nonempty, modelYear: optionalNull(integer(2200, 1886)), color: optionalNull(text), vin: optionalNull(text), engineNumber: optionalNull(text), currentMileageKm: optionalNull(integer(2147483647)), createdAt: crmTimestamp, updatedAt: crmTimestamp });
export type Vehicle = NonNullable<ReturnType<typeof vehicleParser>>;
export const parseVehicles = object({ vehicles: array(vehicleParser), nextCursor: optionalNull(nonempty) });
const customerParser = object({ customerId: id, firstName: nonempty, lastName: nonempty, phone: nonempty, email: optionalNull(text), documentType: optionalNull(text), documentNumber: optionalNull(text), notes: optionalNull(text), createdAt: crmTimestamp, updatedAt: crmTimestamp });
export const parseCustomers = object({ customers: array(customerParser), nextCursor: optionalNull(nonempty) });
export type Customer = NonNullable<ReturnType<typeof customerParser>>;
const ownerParser = object({ ownershipId: id, customerId: id, customer: object({ firstName: nonempty, lastName: nonempty }), relationshipType: choices('owner'), isPrimary: boolean, validFrom: crmTimestamp, validTo: optionalNull(crmTimestamp) });
export const parseOwners = object({ owners: array(ownerParser) });
export type Owner = NonNullable<ReturnType<typeof ownerParser>>;
export function currentOwner(owners: readonly Owner[]): Owner | null {
    const current = owners.filter((o) => o.isPrimary && o.validTo === null);
    return current.length === 1 ? current[0] ?? null : null;
}
