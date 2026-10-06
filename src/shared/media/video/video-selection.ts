import { useEffect, useId, useRef, useState } from 'react';
import { createVideoMetadataResource, type VideoMetadataResource } from './video-metadata';
import type { VideoSelection, VideoSelectionState, VideoValidationPolicy } from './video-types';
import { validateVideo, validateVideoDuration } from './video-validation';

interface ReadyVideo {
  readonly selection: VideoSelection;
  readonly resource: VideoMetadataResource;
}
interface State {
  readonly ready: ReadyVideo | null;
  readonly status: VideoSelectionState['status'];
  readonly issue: VideoSelectionState['issue'];
}
const empty: State = { ready: null, status: 'idle', issue: null };

/** Atomic replacement: a rejected candidate never destroys the ready selection.
 * Policy is snapshotted per attempt; later prop changes apply to future attempts.
 * Re-selecting the same File is a new attempt/ID without copying its bytes.
 */
export function useVideoSelection(policy: VideoValidationPolicy = {}) {
  const prefix = useId();
  const serial = useRef(0);
  const generation = useRef(0);
  const mounted = useRef(false);
  const pending = useRef<VideoMetadataResource | null>(null);
  const accepted = useRef<VideoMetadataResource | null>(null);
  // Includes promoted resources awaiting React's commit/cleanup.
  const resources = useRef(new Set<VideoMetadataResource>());
  const [state, setState] = useState<State>(empty);
  const release = (resource: VideoMetadataResource) => {
    resources.current.delete(resource);
    resource.dispose();
  };
  const cancelPending = () => {
    ++generation.current;
    if (pending.current) { release(pending.current); pending.current = null; }
  };
  useEffect(() => {
    mounted.current = true;
    const owned = resources.current;
    const epoch = generation;
    return () => {
      mounted.current = false;
      ++epoch.current;
      pending.current = null;
      accepted.current = null;
      owned.forEach(resource => { resource.dispose(); });
      owned.clear();
    };
  }, []);
  useEffect(() => {
    // Release only after the previous preview leaves the DOM. Also collects
    // promoted selections superseded before a batched React commit. Preserve
    // the latest accepted resource even if this effect is from an older commit.
    resources.current.forEach(resource => {
      if (resource !== state.ready?.resource && resource !== pending.current && resource !== accepted.current) {
        resources.current.delete(resource);
        resource.dispose();
      }
    });
  }, [state]);

  const select = (value: unknown) => {
    cancelPending();
    const attempt = generation.current;
    const id = `${prefix}-video-${String(++serial.current)}`;
    const validation = validateVideo(value, policy);
    if (!validation.ok) {
      setState(current => ({ ...current, status: 'rejected', issue: validation.code }));
      return;
    }
    const snapshot: VideoValidationPolicy = {
      ...policy,
      ...(policy.allowedMimeTypes === undefined ? {} : { allowedMimeTypes: [...policy.allowedMimeTypes] }),
    };
    let resource: VideoMetadataResource;
    try { resource = createVideoMetadataResource(validation.file); }
    catch {
      setState(current => ({ ...current, status: 'rejected', issue: 'metadata_unavailable' }));
      return;
    }
    pending.current = resource;
    resources.current.add(resource);
    setState(current => ({ ...current, status: 'metadata_loading', issue: null }));
    void resource.result.then(result => {
      if (!mounted.current || generation.current !== attempt) { release(resource); return; }
      pending.current = null;
      const issue = result?.ok ? validateVideoDuration(result.durationSeconds, snapshot) : 'metadata_unavailable';
      if (!result?.ok || issue) {
        release(resource);
        setState(current => ({ ...current, status: 'rejected', issue }));
        return;
      }
      const selection: VideoSelection = { id, file: validation.file, durationSeconds: result.durationSeconds };
      accepted.current = resource;
      setState({ ready: { selection, resource }, status: 'ready', issue: null });
    });
  };
  const clear = () => { cancelPending(); accepted.current = null; setState({ ...empty }); };
  return {
    video: state.ready?.selection ?? null,
    status: state.status,
    issue: state.issue,
    /** Local presentation only; do not lift this into parent/domain state. */
    previewUrl: state.ready?.resource.url ?? null,
    select,
    clear,
  };
}
