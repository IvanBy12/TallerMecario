import type { ReactElement } from 'react';

export type DashboardIconName = 'reception' | 'diagnosis' | 'repair' | 'authorization' | 'delivery' | 'customer' | 'vehicle' | 'list' | 'plus';

/** Iconos de trazo simple (`currentColor`), siempre decorativos: el texto adyacente nombra el dato. */
const ICON_CONTENT: Record<DashboardIconName, ReactElement> = {
  reception: (
    <>
      <path d="M12 3.5v10" />
      <path d="m8 9.5 4 4 4-4" />
      <path d="M4 15.5v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </>
  ),
  diagnosis: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </>
  ),
  repair: (
    <>
      <path d="M14.5 6.5a4 4 0 0 0 4.7 5.2l-8.9 8.9a2.1 2.1 0 0 1-3-3l8.9-8.9a4 4 0 0 1-.1-4.7l2.6 2.6Z" />
    </>
  ),
  authorization: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  delivery: (
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
  list: (
    <>
      <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" />
      <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
};

export function DashboardIcon({ name }: { readonly name: DashboardIconName }) {
  return (
    <svg
      className="dash-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_CONTENT[name]}
    </svg>
  );
}
