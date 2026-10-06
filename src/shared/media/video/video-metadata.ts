type MetadataResult = { readonly ok: true; readonly durationSeconds: number } |
  { readonly ok: false } | null;

export interface VideoMetadataResource {
  /** Internal presentation handle; never part of VideoSelection/callbacks. */
  readonly url: string;
  readonly result: Promise<MetadataResult>;
  /** Idempotent: detaches decoder, settles pending work, revokes owned URL. */
  readonly dispose: () => void;
}

/** Allocate outside render. One URL is used first by a detached metadata element,
 * then by the accepted native preview. The caller owns dispose even on failure.
 * No bytes enter JS; no seek, container parsing, frames or duration guessing.
 */
export function createVideoMetadataResource(file: File): VideoMetadataResource {
  const element = document.createElement('video');
  const url = URL.createObjectURL(file);
  let disposed = false;
  let settled = false;
  let resolveResult: (result: MetadataResult) => void = () => {};
  const result = new Promise<MetadataResult>(resolve => { resolveResult = resolve; });
  const detach = () => {
    element.removeEventListener('loadedmetadata', loaded);
    element.removeEventListener('error', failed);
    element.removeAttribute('src');
    // Stop browser media work after detaching. Do not expose browser exceptions.
    try { element.load(); } catch { /* best-effort decoder release */ }
  };
  const finish = (value: MetadataResult) => {
    if (settled) return;
    settled = true;
    detach();
    resolveResult(value);
  };
  const loaded = () => { finish({ ok: true, durationSeconds: element.duration }); };
  const failed = () => { finish({ ok: false }); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (!settled) finish(null);
    URL.revokeObjectURL(url);
  };
  try {
    element.preload = 'metadata';
    element.addEventListener('loadedmetadata', loaded);
    element.addEventListener('error', failed);
    element.src = url;
    element.load();
  } catch {
    finish({ ok: false });
  }
  return { url, result, dispose };
}
