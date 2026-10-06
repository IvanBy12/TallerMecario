import { expect, it } from 'vitest';
import { normalizePermissions } from './effective-permissions';

it('permission normalization merges codes and scopes as sets with stable ordering', () => {
  const a = [{ code: 'b', scopes: ['tenant', 'assigned', 'tenant'] }, { code: 'a', scopes: ['quality_control'] }, { code: 'b', scopes: ['assigned'] }];
  const b = [{ code: 'b', scopes: ['assigned'] }, { code: 'b', scopes: ['tenant'] }, { code: 'a', scopes: ['quality_control', 'quality_control'] }];
  expect(JSON.stringify(normalizePermissions(a))).toBe(JSON.stringify(normalizePermissions(b)));
  expect(normalizePermissions(a)).toEqual([{ code: 'a', scopes: ['quality_control'] }, { code: 'b', scopes: ['assigned', 'tenant'] }]);
});
