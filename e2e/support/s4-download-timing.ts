import { s4Check } from './s4-check';

// Assertion tolerance only: SigV4/HTTP Date have whole-second precision and API expiry has milliseconds.
export const S4_TIME_TOLERANCE_MS = 2_000;
export const S4_MAX_DOWNLOAD_TTL_MS = 300_000;
export function signedS4DownloadTimes(url: string): { signedAtMs: number; ttlMs: number } {
  const query = new URL(url).searchParams;
  const date = query.get('X-Amz-Date') ?? '';
  const duration = query.get('X-Amz-Expires') ?? '';
  s4Check(/^\d{8}T\d{6}Z$/.test(date) && /^\d+$/.test(duration), 'Reloj/TTL firmado de descarga inválido.');
  return { signedAtMs: Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`), ttlMs: Number(duration) * 1_000 };
}
export function checkS4DownloadTimes(apiExpiresAtMs: number, signedAtMs: number, ttlMs: number, requestDurationMs: number): void {
  s4Check(Number.isFinite(signedAtMs) && Number.isFinite(apiExpiresAtMs) &&
    ttlMs > 0 && ttlMs <= S4_MAX_DOWNLOAD_TTL_MS && Number.isFinite(requestDurationMs) && requestDurationMs >= 0 &&
    Math.abs(apiExpiresAtMs - (signedAtMs + ttlMs)) <= S4_TIME_TOLERANCE_MS, 'TTL download fuera del contrato o relojes API/firma inconsistentes.');
}
/** R2 Date, never browser/runner wall time, anchors effective expiry. Monotonic elapsed time prevents clock jumps. */
export function s4ExpiryWaitMs(signedExpiryMs: number, storageDateMs: number): number {
  const wait = signedExpiryMs - storageDateMs + S4_TIME_TOLERANCE_MS;
  // 420s scenario timeout includes bootstrap/reads; excessive skew cannot be claimed as verified.
  s4Check(Number.isFinite(wait) && wait >= S4_TIME_TOLERANCE_MS && wait <= 360_000,
    'No se puede verificar vencimiento con el reloj observado del storage.');
  return wait;
}
