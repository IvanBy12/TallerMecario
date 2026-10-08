import type { MediaResult } from './media-types';
import type { UploadExecutor, UploadObserver } from './upload-task-types';

/** Internal ownership cell, inspectable in tests without exposing payload in the task API. */
export interface UploadExecution<Input> {
  payload: { readonly input: Input; readonly blob: Blob } | null;
}
export function createUploadExecution<Input>(input: Input, blob: Blob): UploadExecution<Input> {
  return { payload: { input, blob } };
}

/** Executor compliance is not required for controller settlement on cancel/dispose. */
export async function executeUpload<Input>(executor: UploadExecutor<Input>, execution: UploadExecution<Input>,
  signal: AbortSignal, observer: UploadObserver): Promise<MediaResult | null> {
  let onAbort = () => {};
  const aborted = new Promise<null>(resolve => {
    onAbort = () => { execution.payload = null; resolve(null); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    if (signal.aborted || execution.payload === null) return null;
    // Read arguments only for dispatch; no separate payload local survives the await.
    // race installs both result and rejection handlers, consuming late executor outcomes.
    return await Promise.race([
      executor.upload(execution.payload.input, execution.payload.blob, signal, observer), aborted,
    ]);
  } finally {
    execution.payload = null;
    signal.removeEventListener('abort', onAbort);
  }
}
