import { describe, expect, it } from 'vitest';

import { exhaustPages, PaginationError, type PageResult } from '../../e2e/support/pagination';

/** Fabrica un API paginado: `pages[i]` es la página servida cuando el cursor es `c<i>` (la primera con cursor null). */
function pagedApi(pages: readonly (readonly string[])[], nextOf?: (index: number) => unknown) {
  const calls: (string | null)[] = [];
  const fetchPage = (cursor: string | null): Promise<PageResult<string>> => {
    calls.push(cursor);
    const index = cursor === null ? 0 : Number(cursor.slice(1));
    const next = nextOf ? nextOf(index) : index + 1 < pages.length ? `c${String(index + 1)}` : null;
    return Promise.resolve({ items: pages[index] ?? [], nextCursor: next });
  };
  return { fetchPage, calls };
}

describe('paginador del listado cross-tenant', () => {
  it('termina normalmente cuando nextCursor === null y devuelve todos los ítems', async () => {
    const api = pagedApi([['a', 'b'], ['c'], ['d', 'e']]);
    const result = await exhaustPages(api.fetchPage, 10);
    expect(result).toEqual({ items: ['a', 'b', 'c', 'd', 'e'], pages: 3 });
    expect(api.calls).toEqual([null, 'c1', 'c2']);
  });

  it('una sola página sin cursor termina', async () => {
    expect((await exhaustPages(pagedApi([['x']]).fetchPage, 10)).pages).toBe(1);
  });

  it('terminar exactamente en la última página permitida es válido', async () => {
    const result = await exhaustPages(pagedApi([['a'], ['b'], ['c']]).fetchPage, 3);
    expect(result.pages).toBe(3);
  });

  it('el recurso de B en una página TARDÍA se detecta', async () => {
    const target = 'reception-of-tenant-b';
    const pages = Array.from({ length: 30 }, (_, index) => (index === 27 ? ['filler', target] : [`filler-${String(index)}`]));
    const { items } = await exhaustPages(pagedApi(pages).fetchPage, 100);
    expect(items).toContain(target);
  });

  it('más de MAX_PAGES con cursor pendiente → FAIL (nunca PASS)', async () => {
    const pages = Array.from({ length: 50 }, (_, index) => [`item-${String(index)}`]);
    const api = pagedApi(pages);
    await expect(exhaustPages(api.fetchPage, 5)).rejects.toMatchObject({ name: 'PaginationError', reason: 'max-pages-with-pending-cursor', pagesRead: 5 });
    expect(api.calls).toHaveLength(5);
  });

  it('cursor repetido (mismo cursor devuelto de nuevo) → FAIL', async () => {
    const api = pagedApi([['a'], ['b']], (index) => (index === 0 ? 'c1' : 'c1'));
    await expect(exhaustPages(api.fetchPage, 50)).rejects.toMatchObject({ reason: 'repeated-cursor' });
  });

  it('ciclo de cursors (c1 → c2 → c1) → FAIL explícito', async () => {
    const api = pagedApi([['a'], ['b'], ['c']], (index) => (index === 0 ? 'c1' : index === 1 ? 'c2' : 'c1'));
    await expect(exhaustPages(api.fetchPage, 50)).rejects.toMatchObject({ reason: 'cursor-cycle' });
  });

  it.each([[undefined], [''], [42], [{}]])('nextCursor inválido (%j) → FAIL', async (bad) => {
    const api = pagedApi([['a']], () => bad);
    await expect(exhaustPages(api.fetchPage, 5)).rejects.toMatchObject({ reason: 'invalid-cursor' });
  });

  it('maxPages < 1 no «lee» nada y por tanto falla', async () => {
    await expect(exhaustPages(pagedApi([['a']]).fetchPage, 0)).rejects.toBeInstanceOf(PaginationError);
  });

  it('un error al pedir una página se propaga (no se traga)', async () => {
    await expect(exhaustPages(() => Promise.reject(new Error('boom')), 3)).rejects.toThrow('boom');
  });
});

describe('el spec cross-tenant usa el paginador', () => {
  it('recorre con exhaustPages y ya no tiene un bucle con break silencioso', async () => {
    const { readRepoFile } = await import('../helpers/repo');
    const spec = readRepoFile('e2e/s3-cross-tenant.spec.ts');
    expect(spec).toContain('exhaustPages');
    expect(spec).not.toMatch(/pageNumber < 20/);
    expect(spec).not.toMatch(/if \(typeof next !== 'string'\) break/);
  });
});
