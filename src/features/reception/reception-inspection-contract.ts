import type { JsonObject } from '@/shared/api/http-client';
import { id, record } from './reception-contract';
import { normalizeReceptionText } from './reception-create-form';
export const CHECKLIST_STATES = { ok: 'Correcto', issue: 'Novedad', not_checked: 'Sin revisar', not_applicable: 'No aplica' } as const;
export const DAMAGE_SEVERITIES = { minor: 'Leve', moderate: 'Moderado', severe: 'Grave' } as const;
export type ChecklistState = keyof typeof CHECKLIST_STATES;
export type DamageSeverity = keyof typeof DAMAGE_SEVERITIES;
export function inspectionText(value: string, max: number): string | null {
    const normalized = normalizeReceptionText(value);
    return normalized === false || normalized === null || Array.from(normalized).length > max ? null : normalized;
}
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const required = (value: unknown, max: number) => typeof value === 'string' && inspectionText(value, max) !== null;
const optional = (value: unknown) => value === null || (typeof value === 'string' && normalizeReceptionText(value) !== false);
export function validInspectionBody(body: JsonObject, kind: 'checklist' | 'damages'): boolean {
    const collection = kind === 'checklist' ? 'items' : 'damages';
    const entries = body[collection];
    if (!exact(body, ['expectedUpdatedAt', collection]) || typeof body['expectedUpdatedAt'] !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(body['expectedUpdatedAt']) ||
        !Array.isArray(entries) || entries.length < 1 || entries.length > 100) return false;
    const seen = new Set<string>();
    return entries.every(value => {
        if (!record(value)) return false;
        if (kind === 'checklist') {
            if (!exact(value, ['code', 'label', 'status', 'notes']) || !required(value['code'], 64) ||
                !required(value['label'], 160) || typeof value['status'] !== 'string' ||
                !Object.hasOwn(CHECKLIST_STATES, value['status']) || !optional(value['notes'])) return false;
            const code = inspectionText(String(value['code']), 64);
            if (code === null || seen.has(code)) return false;
            seen.add(code); return true;
        }
        const update = value['operation'] === 'update';
        if ((!update && value['operation'] !== 'create') ||
            !exact(value, ['operation', ...(update ? ['damageId'] : []), 'zoneCode', 'damageType', 'severity', 'description']) ||
            !required(value['zoneCode'], 64) || !required(value['damageType'], 64) ||
            typeof value['severity'] !== 'string' || !Object.hasOwn(DAMAGE_SEVERITIES, value['severity']) ||
            !optional(value['description'])) return false;
        if (update) {
            const damageId = id(value['damageId']);
            if (damageId === null || seen.has(damageId)) return false;
            seen.add(damageId);
        }
        return true;
    });
}
