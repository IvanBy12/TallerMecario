import type { ReactElement } from 'react';

import type { NavigationIconName } from '../navigation';

/**
 * Iconos de la navegación. Se dibujan a mano (trazos simples, `currentColor`) para no añadir una
 * librería de iconos: FE-DOC-16 deja los tokens y el sistema visual para su propia tarea.
 */
const ICON_CONTENT: Record<NavigationIconName, ReactElement> = {
  panel: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  reception: (
    <>
      <path d="M12 3.5v10" />
      <path d="m8 9.5 4 4 4-4" />
      <path d="M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  order: (
    <>
      <path d="M6.5 3.5h11A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="m9 13.5 2.2 2.2 4.3-4.4" />
    </>
  ),
  customer: (
    <>
      <circle cx="9.5" cy="8" r="3" />
      <path d="M4 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.6a3 3 0 0 1 0 5.6" />
      <path d="M17.6 15.4A5.5 5.5 0 0 1 20 20" />
    </>
  ),
  vehicle: (
    <>
      <path d="M3.5 16v-2.6l1.7-3.7a2 2 0 0 1 1.8-1.2h10a2 2 0 0 1 1.8 1.2l1.7 3.7V16" />
      <path d="M3.5 13h17" />
      <circle cx="7.5" cy="16.5" r="1.8" />
      <circle cx="16.5" cy="16.5" r="1.8" />
    </>
  ),
  inventory: (
    <>
      <path d="M12 3.2 4 7.6v8.8l8 4.4 8-4.4V7.6z" />
      <path d="m4 7.6 8 4.4 8-4.4" />
      <path d="M12 12v8.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.4M12 18.6V21M4.6 7.6l2.1 1.2M17.3 15.2l2.1 1.2M4.6 16.4l2.1-1.2M17.3 8.8l2.1-1.2" />
    </>
  ),
};

export interface NavIconProps {
  readonly name: NavigationIconName;
}

export function NavIcon({ name }: NavIconProps) {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_CONTENT[name]}
    </svg>
  );
}
