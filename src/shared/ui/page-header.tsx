import type { ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  /** Elemento decorativo opcional (por ejemplo, el icono del módulo). */
  readonly icon?: ReactNode;
  readonly actions?: ReactNode;
}

/**
 * Encabezado de sección: único `h1` de la vista. Genérico a propósito: no conoce ningún dominio.
 */
export function PageHeader({ title, description, icon, actions }: PageHeaderProps) {
  return (
    <header className="ui-page-header">
      {icon === undefined ? null : <span className="ui-page-header__icon">{icon}</span>}
      <div className="ui-page-header__text">
        <h1 className="ui-page-header__title">{title}</h1>
        {description === undefined ? null : (
          <p className="ui-page-header__description">{description}</p>
        )}
      </div>
      {actions === undefined ? null : <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}
