/**
 * Paginador por cursor que AGOTA el listado o falla. Un listado solo puede declararse «sin el recurso» si se recorrió hasta
 * `nextCursor === null`. Alcanzar el tope de seguridad con un cursor pendiente, repetir un cursor o entrar en un ciclo es FALLO,
 * nunca un PASS silencioso. Puro (sin Playwright): se prueba en e2e-harness-tests.
 */

export interface PageResult<T> {
  readonly items: readonly T[];
  /** Cursor de la siguiente página, o `null` cuando no hay más. Cualquier otro valor inválido es un fallo. */
  readonly nextCursor: unknown;
}

export type PaginationFailure = 'max-pages-with-pending-cursor' | 'repeated-cursor' | 'cursor-cycle' | 'invalid-cursor';

export class PaginationError extends Error {
  constructor(
    readonly reason: PaginationFailure,
    readonly pagesRead: number,
  ) {
    super(
      {
        'max-pages-with-pending-cursor': `Paginación sin agotar tras ${String(pagesRead)} páginas: aún hay nextCursor pendiente (no se declara aislamiento).`,
        'repeated-cursor': `Paginación inválida: la página ${String(pagesRead)} devolvió el mismo cursor que se acababa de usar.`,
        'cursor-cycle': `Paginación inválida: la página ${String(pagesRead)} devolvió un cursor ya visitado (ciclo).`,
        'invalid-cursor': `Paginación inválida: nextCursor de la página ${String(pagesRead)} no es null ni una cadena no vacía.`,
      }[reason],
    );
    this.name = 'PaginationError';
  }
}

export const DEFAULT_MAX_PAGES = 100;

export interface ExhaustedPages<T> {
  readonly items: readonly T[];
  readonly pages: number;
}

export async function exhaustPages<T>(
  fetchPage: (cursor: string | null) => Promise<PageResult<T>>,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<ExhaustedPages<T>> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let pages = 1; pages <= maxPages; pages += 1) {
    const page: PageResult<T> = await fetchPage(cursor);
    items.push(...page.items);
    const next = page.nextCursor;
    if (next === null) return { items, pages };
    if (typeof next !== 'string' || next === '') throw new PaginationError('invalid-cursor', pages);
    if (next === cursor) throw new PaginationError('repeated-cursor', pages);
    if (seen.has(next)) throw new PaginationError('cursor-cycle', pages);
    seen.add(next);
    if (pages === maxPages) throw new PaginationError('max-pages-with-pending-cursor', pages);
    cursor = next;
  }
  // maxPages < 1: no se leyó nada, y no leer nada no demuestra aislamiento.
  throw new PaginationError('max-pages-with-pending-cursor', 0);
}
