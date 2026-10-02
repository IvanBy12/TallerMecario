import type { JsonObject, JsonValue } from '@/shared/api/http-client';
export interface FieldSpec { readonly key: string; readonly label: string; readonly type?: 'text' | 'tel' | 'email' | 'number' | 'textarea' | 'select'; readonly required?: boolean; readonly options?: readonly { readonly value: string; readonly label: string }[]; readonly min?: number; readonly max?: number }
export type FormValues = Readonly<Record<string, string>>;
export type FieldErrors = Readonly<Record<string, string>>;
export function CrmFields({ fields, values, errors, disabled, onChange }: { readonly fields: readonly FieldSpec[]; readonly values: FormValues; readonly errors: FieldErrors; readonly disabled: boolean; readonly onChange: (key: string, value: string) => void }) {
  return <fieldset className="crm-fields" disabled={disabled}><legend>Datos del registro</legend>{fields.map(field => <div className={field.type === 'textarea' ? 'crm-field crm-field--wide' : 'crm-field'} key={field.key}>
    <label htmlFor={`crm-${field.key}`}>{field.label}{field.required ? ' *' : ''}</label>
    {field.type === 'textarea' ? <textarea id={`crm-${field.key}`} rows={4} value={values[field.key] ?? ''} aria-invalid={errors[field.key] !== undefined} aria-describedby={errors[field.key] === undefined ? undefined : `error-${field.key}`} onChange={e => { onChange(field.key, e.target.value); }} /> :
      field.type === 'select' ? <select id={`crm-${field.key}`} required={field.required} value={values[field.key] ?? ''} aria-invalid={errors[field.key] !== undefined} aria-describedby={errors[field.key] === undefined ? undefined : `error-${field.key}`} onChange={e => { onChange(field.key, e.target.value); }}>{field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> :
      <input id={`crm-${field.key}`} type={field.type ?? 'text'} required={field.required} min={field.min} max={field.max} step={field.type === 'number' ? 1 : undefined} value={values[field.key] ?? ''} aria-invalid={errors[field.key] !== undefined} aria-describedby={errors[field.key] === undefined ? undefined : `error-${field.key}`} onChange={e => { onChange(field.key, e.target.value); }} />}
    {errors[field.key] !== undefined && <p className="crm-field-error" id={`error-${field.key}`}>{errors[field.key]}</p>}
  </div>)}</fieldset>;
}
export function valuesOf(fields: readonly FieldSpec[], data?: object): FormValues {
  const source: Record<string, unknown> = Object.fromEntries(Object.entries(data ?? {}));
  return Object.fromEntries(fields.map(f => [f.key, source[f.key] === null || source[f.key] === undefined ? (f.type === 'select' ? f.options?.[0]?.value ?? '' : '') : String(source[f.key])]));
}
export function formBody(fields: readonly FieldSpec[], values: FormValues): JsonObject {
  return Object.fromEntries(fields.map(f => { const value = values[f.key]?.trim() ?? ''; return [f.key, value === '' ? null : f.type === 'number' ? Number(value) : value]; }));
}
export function modifiedBody(body: JsonObject, baseline: JsonObject, edited: ReadonlySet<string>, expectedUpdatedAt: string): JsonObject {
  const patch: Record<string, JsonValue> = { expectedUpdatedAt };
  for (const key of edited) { if (body[key] !== baseline[key] && body[key] !== undefined) patch[key] = body[key]; }
  return patch;
}
export function requiredErrors(fields: readonly FieldSpec[], values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const value = values[f.key]?.trim() ?? '';
    if (f.required && !value) errors[f.key] = 'Completa este campo.';
    if (f.type === 'number' && value !== '' && (!Number.isInteger(Number(value)) || Number(value) < (f.min ?? 0) || Number(value) > (f.max ?? Number.MAX_SAFE_INTEGER))) errors[f.key] = `Ingresa un año entero entre ${String(f.min)} y ${String(f.max)}.`;
  }
  return errors;
}
