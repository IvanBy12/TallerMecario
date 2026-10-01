import { useId, type ReactNode } from 'react';

export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  /** Etiqueta de la lista de elementos previstos o pendientes. */
  readonly itemsLabel?: string;
  readonly items?: readonly string[];
  /** Acción principal sugerida (enlace o botón). */
  readonly action?: ReactNode;
}

/**
 * Estado vacío reutilizable. Describe la ausencia de datos sin simular contenido: es el estado
 * correcto mientras un módulo, un permiso o un taller no estén disponibles.
 */
export function EmptyState({ title, description, itemsLabel, items, action }: EmptyStateProps) {
  const titleId = useId();
  return (
    <section className="ui-empty-state" aria-labelledby={titleId}>
      <h2 className="ui-empty-state__title" id={titleId}>
        {title}
      </h2>
      <p className="ui-empty-state__description">{description}</p>
      {itemsLabel === undefined ? null : (
        <p className="ui-empty-state__items-label">{itemsLabel}</p>
      )}
      {items === undefined ? null : (
        <ul className="ui-empty-state__items">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {action === undefined ? null : <div className="ui-empty-state__action">{action}</div>}
    </section>
  );
}
