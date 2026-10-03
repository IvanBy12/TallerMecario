// CRM HTTP §13.4. Parsers retain only approved DTO fields.
export type Parser<T> = (value: unknown) => T | null;
type ValueOf<P> = P extends Parser<infer T> ? T : never;
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export const text: Parser<string> = v => typeof v === 'string' ? v : null;
export const nonempty: Parser<string> = v => typeof v === 'string' && v.length > 0 ? v : null;
export const id: Parser<string> = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v) && !['00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff'].includes(v) ? v : null;
export const timestamp: Parser<string> = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(v) ? v : null;
export const integer: Parser<number> = v => typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
export const boolean: Parser<boolean> = v => typeof v === 'boolean' ? v : null;
const nullables = new WeakSet();
export function nullable<T>(parser: Parser<T>): Parser<T | null> {
  const p: Parser<T | null> = v => v === null ? null : parser(v);
  nullables.add(p); return p;
}
export function object<S extends Record<string, Parser<unknown>>>(fields: S): Parser<{ [K in keyof S]: ValueOf<S[K]> }> {
  return v => {
    if (!record(v)) return null;
    const result: Record<string, unknown> = {};
    for (const [key, parser] of Object.entries(fields)) {
      if (!Object.hasOwn(v, key) || (v[key] === null && !nullables.has(parser))) return null;
      const parsed = parser(v[key]);
      if (parsed === null && v[key] !== null) return null;
      result[key] = parsed;
    }
    // All mapped fields were validated above.
    return result as { [K in keyof S]: ValueOf<S[K]> };
  };
}
export function array<T>(parser: Parser<T>): Parser<readonly T[]> {
  return v => {
    if (!Array.isArray(v)) return null;
    const items: T[] = [];
    for (const item of v) { const parsed = parser(item); if (parsed === null) return null; items.push(parsed); }
    return items;
  };
}
export function envelope<T>(key: string, parser: Parser<T>): Parser<T> {
  return v => record(v) ? parser(v[key]) : null;
}
