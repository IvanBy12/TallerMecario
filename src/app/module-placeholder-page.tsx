import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';

import type { NavigationItem } from './navigation';
import { NavIcon } from './shell/nav-icon';

export interface ModulePlaceholderPageProps {
  readonly module: NavigationItem;
}

/**
 * Página provisional de un módulo: encabezado real, aviso de alcance y estado vacío. Se genera
 * desde la estructura declarativa de navegación, así que no hay copias divergentes por sección.
 * No simula datos: no hay respuestas ni listados inventados.
 */
export function ModulePlaceholderPage({ module }: ModulePlaceholderPageProps) {
  return (
    <>
      <PageHeader
        icon={<NavIcon name={module.icon} />}
        title={module.label}
        description={module.summary}
      />
      <EmptyState
        title="Módulo en construcción"
        description={`${module.label} todavía no está implementado. No hay datos del taller que mostrar en esta sección.`}
        itemsLabel="Cuando esté disponible incluirá:"
        items={module.capabilities}
      />
    </>
  );
}
