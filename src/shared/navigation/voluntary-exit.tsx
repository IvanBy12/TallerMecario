import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useBlocker } from 'react-router-dom';

interface ExitGuard {
  readonly message: string;
  readonly signal: AbortSignal;
  readonly release: () => void;
}
interface ExitCoordinator {
  readonly register: (guard: ExitGuard) => () => void;
  readonly run: (action: () => void) => void;
}
const ExitContext = createContext<ExitCoordinator | null>(null);

/** One router blocker and one voluntary-action coordinator. Auth invalidation never calls run. */
export function VoluntaryExitProvider({ children }: { readonly children: ReactNode }) {
  const guard = useRef<ExitGuard | null>(null);
  const accepting = useRef(false);
  const [sessionExit, setSessionExit] = useState<{ readonly guard: ExitGuard; readonly action: () => void } | null>(null);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => guard.current !== null && !guard.current.signal.aborted &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  const blocked = useRef(blocker);
  useLayoutEffect(() => { blocked.current = blocker; }, [blocker]);
  const register = useCallback((next: ExitGuard) => {
    guard.current = next;
    const unregister = () => {
      if (guard.current !== next) return;
      guard.current = null;
      setSessionExit(null);
      if (!accepting.current && blocked.current.state === 'blocked') blocked.current.reset();
    };
    next.signal.addEventListener('abort', unregister, { once: true });
    return () => { next.signal.removeEventListener('abort', unregister); unregister(); };
  }, []);
  const run = useCallback((action: () => void) => {
    const current = guard.current;
    if (current === null || current.signal.aborted) { action(); return; }
    // Keep the first shell action; a second click cannot replace an unresolved router exit.
    if (blocked.current.state === 'blocked') return;
    setSessionExit(previous => previous ?? { guard: current, action });
  }, []);
  const coordinator = useMemo(() => ({ register, run }), [register, run]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (guard.current === null || guard.current.signal.aborted) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('beforeunload', beforeUnload); };
  }, []);
  const current = guard.current;
  const prompt = current !== null && !current.signal.aborted && (blocker.state === 'blocked' || sessionExit?.guard === current);
  const reject = () => {
    setSessionExit(null);
    if (blocker.state === 'blocked') blocker.reset();
  };
  const accept = () => {
    if (guard.current === null || guard.current.signal.aborted || accepting.current) return;
    const release = guard.current.release;
    const action = sessionExit?.action;
    accepting.current = true;
    // Unmount the page's media boundary before invoking auth or proceeding. Its existing lifecycle aborts tasks/releases previews.
    flushSync(release);
    setSessionExit(null);
    if (action !== undefined) {
      if (blocker.state === 'blocked') blocker.reset();
      action();
    } else if (blocker.state === 'blocked') blocker.proceed();
    accepting.current = false;
  };
  return <ExitContext.Provider value={coordinator}>{children}
    {prompt && <ExitDialog message={current.message} onReject={reject} onAccept={accept}/>}
  </ExitContext.Provider>;
}

function ExitDialog({ message, onReject, onAccept }: { readonly message: string; readonly onReject: () => void; readonly onAccept: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();
  const [previous] = useState(() => document.activeElement);
  useEffect(() => {
    dialog.current?.showModal();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [previous]);
  return <dialog ref={dialog} className="reception-close-dialog" aria-labelledby={title} aria-describedby={description}
    onCancel={event => { event.preventDefault(); onReject(); }}>
    <h2 id={title}>Salir de Nueva recepción</h2><p id={description}>{message}</p>
    <div className="reception-actions">
      <button className="ui-button" type="button" autoFocus onClick={onReject}>Permanecer aquí</button>
      <button className="ui-button" type="button" onClick={onAccept}>Salir y descartar archivos locales</button>
    </div>
  </dialog>;
}

export function useVoluntaryExitGuard(enabled: boolean, value: ExitGuard) {
  const coordinator = useContext(ExitContext);
  if (coordinator === null) throw new Error('VoluntaryExitProvider requerido');
  const { register } = coordinator;
  const { message, signal, release } = value;
  useLayoutEffect(() => {
    if (!enabled || signal.aborted) return;
    return register({ message, signal, release });
  }, [enabled, message, signal, release, register]);
}

/** Standalone shells keep their original callbacks when there is no registered page. */
export function useVoluntaryExit() {
  const coordinator = useContext(ExitContext);
  return coordinator?.run ?? ((action: () => void) => { action(); });
}
