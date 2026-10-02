export type PublicIconName = 'arrow' | 'check' | 'order' | 'vehicle' | 'people' | 'chart' | 'box' | 'history' | 'camera' | 'link' | 'message' | 'wrench';

const paths: Record<PublicIconName, string> = {
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  order: 'M8 4H5v17h14V4h-3M8 2h8v5H8zM8 11h8M8 15h6',
  vehicle: 'm3 11 2-6h14l2 6M3 11h18v7H3zM6 18v3m12-3v3M6 14h2m8 0h2',
  people: 'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m17 0v-3a4 4 0 0 0-3-4M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8m7-7a4 4 0 0 1 0 7',
  chart: 'M4 3v18h17M8 17v-5m5 5V8m5 9V4',
  box: 'm12 2 9 5v10l-9 5-9-5V7zm-9 5 9 5 9-5m-9 5v10M7 4l9 5',
  history: 'M3 10a9 9 0 1 1 1 7M3 3v7h7m2-4v6l4 2',
  camera: 'M8 5l2-3h4l2 3h5v15H3V5zM16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0',
  link: 'm10 14 4-4m-6 2-2 2a4 4 0 0 0 6 6l3-3m-6-10 3-3a4 4 0 0 1 6 6l-2 2',
  message: 'M21 11a9 9 0 0 1-9 9H8l-5 2 1-6a9 9 0 1 1 17-5M8 11h8M8 7h5',
  wrench: 'm14 6 4 4 4-4a7 7 0 0 1-9 9l-7 7-4-4 7-7a7 7 0 0 1 9-9z',
};

export function PublicIcon({ name, className }: { readonly name: PublicIconName; readonly className?: string }) {
  return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
