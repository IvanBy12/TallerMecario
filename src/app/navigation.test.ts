import { describe, expect, it } from 'vitest';

import {
  NAVIGATION_ITEMS,
  NAVIGATION_SECTIONS,
  visibleItems,
  visibleSections,
  type NavigationItem,
} from './navigation';

/** Entrada sintética: sólo existe para ejercitar el filtro por permisos. */
const RESTRICTED: NavigationItem = {
  id: 'restringido',
  path: '/restringido',
  label: 'Restringido',
  summary: 'Entrada de prueba con permiso requerido.',
  capabilities: [],
  icon: 'settings',
  requiredPermission: 'clientes.leer',
};

describe('estructura declarativa de navegación', () => {
  it('declara una ruta por sección, sin repetir rutas ni identificadores', () => {
    expect(NAVIGATION_ITEMS.map((item) => item.path)).toEqual([
      '/panel',
      '/recepciones',
      '/ordenes',
      '/clientes',
      '/vehiculos',
      '/inventario',
      '/configuracion',
    ]);
    expect(new Set(NAVIGATION_ITEMS.map((item) => item.id)).size).toBe(NAVIGATION_ITEMS.length);
    expect(NAVIGATION_ITEMS.every((item) => item.path.startsWith('/'))).toBe(true);
  });

  it('cada entrada tiene etiqueta y resumen, y pertenece a una sola sección', () => {
    expect(
      NAVIGATION_ITEMS.every((item) => item.label.length > 0 && item.summary.length > 0),
    ).toBe(true);
    expect(NAVIGATION_SECTIONS.flatMap((section) => section.items.map((item) => item.id))).toEqual(
      NAVIGATION_ITEMS.map((item) => item.id),
    );
  });

  it('las capacidades de recepción no anuncian captura de firma', () => {
    const reception = NAVIGATION_ITEMS.find(item => item.id === 'recepciones');
    expect(reception).toBeDefined();
    expect(reception?.capabilities.join(' ')).not.toMatch(/firma/i);
  });

  it('declara permisos del catálogo backend', () => {
    expect(NAVIGATION_ITEMS.every((item) => item.requiredPermission !== null)).toBe(true);
  });

  it('sin catálogo de permisos deniega la navegación', () => {
    expect(visibleSections(NAVIGATION_SECTIONS, null)).toHaveLength(0);
  });

  it('una entrada con permiso requerido sólo es visible si el catálogo lo concede', () => {
    expect(visibleItems([RESTRICTED], null)).toHaveLength(0);
    expect(visibleItems([RESTRICTED], new Set(['otro.permiso']))).toHaveLength(0);
    expect(visibleItems([RESTRICTED], new Set(['clientes.leer']))).toHaveLength(1);
  });

  it('las secciones que se quedan sin entradas visibles desaparecen', () => {
    const sections = [{ id: 'prueba', label: 'Prueba', items: [RESTRICTED] }];
    expect(visibleSections(sections, null)).toHaveLength(0);
    expect(visibleSections(sections, new Set(['clientes.leer']))).toHaveLength(1);
  });
});

it('filtra el catálogo real por permisos efectivos, incluidos scopes restringidos', () => {
  const permissions = [{ code: 'vehicles.read', scopes: ['assigned'] }, { code: 'orders.read', scopes: ['quality_control'] }];
  expect(visibleSections(NAVIGATION_SECTIONS, new Set(permissions.map((permission) => permission.code)))
    .flatMap((section) => section.items.map((item) => item.id))).toEqual(['ordenes', 'vehiculos']);
});
