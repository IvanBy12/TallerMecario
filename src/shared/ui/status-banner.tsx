import type { ReactNode } from 'react';

export type StatusBannerTone = 'info' | 'warning';

const GLYPHS: Record<StatusBannerTone, string> = { info: 'i', warning: '!' };

export interface StatusBannerProps {
  readonly tone: StatusBannerTone;
  readonly title: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
}

/**
 * Aviso persistente dentro de la vista. El estado no depende solo del color: lleva un título
 * anunciado con `role="status"` y un glifo textual.
 */
export function StatusBanner({ tone, title, children, actions }: StatusBannerProps) {
  return (
    <div className={`ui-status-banner ui-status-banner--${tone}`} role="status">
      <span className="ui-status-banner__glyph" aria-hidden="true">
        {GLYPHS[tone]}
      </span>
      <div className="ui-status-banner__text">
        <p className="ui-status-banner__title">{title}</p>
        {children === undefined ? null : (
          <div className="ui-status-banner__body">{children}</div>
        )}
      </div>
      {actions === undefined ? null : <div className="ui-status-banner__actions">{actions}</div>}
    </div>
  );
}
