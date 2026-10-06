import { id, record } from './reception-contract';
export const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;
const opaqueVersion = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const time = (v: unknown): v is string => nonempty(v) && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
export function parseAttachedSignature(v: unknown) {
    if (!record(v) || id(v['signatureId']) === null || id(v['receptionId']) === null ||
        id(v['signatureMediaId']) === null || !nonempty(v['documentVersion']) || !time(v['signedAt'])) return null;
    return { signatureId: String(v['signatureId']), receptionId: String(v['receptionId']),
        signatureMediaId: String(v['signatureMediaId']), documentVersion: v['documentVersion'], signedAt: v['signedAt'] };
}
export function parseClosedReception(v: unknown) {
    if (!record(v) || !record(v['reception']) || !record(v['serviceOrder'])) return null;
    const r = v['reception'], o = v['serviceOrder'];
    if (id(r['id']) === null || r['status'] !== 'closed' || !time(r['closedAt']) || !opaqueVersion(r['updatedAt']) ||
        ['id','receptionId','vehicleId','customerId'].some(k => id(o[k]) === null) ||
        !nonempty(o['orderNumber']) || !nonempty(o['status']) || !time(o['openedAt']) ||
        typeof o['version'] !== 'number' || !Number.isInteger(o['version']) || o['version'] < 1 ||
        o['receptionId'] !== r['id']) return null;
    return { reception: { id: String(r['id']), status: 'closed' as const, closedAt: r['closedAt'], updatedAt: r['updatedAt'] },
        serviceOrder: { id: String(o['id']), receptionId: String(o['receptionId']), vehicleId: String(o['vehicleId']),
            customerId: String(o['customerId']), orderNumber: o['orderNumber'], status: o['status'], openedAt: o['openedAt'], version: o['version'] } };
}
export type CloseResult = NonNullable<ReturnType<typeof parseClosedReception>>;
