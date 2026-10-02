const dateTime = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Tiempo relativo corto («hace 5 min»); pasadas 24 h muestra fecha y hora. */
export function formatRelativeTime(iso: string, now: Date): string {
  const at = new Date(iso);
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (Number.isNaN(minutes)) return '';
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${String(minutes)} min`;
  if (minutes < 24 * 60) return `hace ${String(Math.floor(minutes / 60))} h`;
  return dateTime.format(at);
}

export function formatAbsoluteTime(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? '' : dateTime.format(at);
}
