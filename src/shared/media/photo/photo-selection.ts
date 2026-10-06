import { useId, useReducer, useRef } from 'react';
import type { PhotoIssue, PhotoSelection, PhotoSelectionState, PhotoValidationPolicy } from './photo-types';
import { validatePhoto } from './photo-validation';

interface Candidate { readonly id: string; readonly value: unknown }
type Action = { readonly type: 'add' | 'replace'; readonly candidates: readonly Candidate[]; readonly policy: PhotoValidationPolicy } |
  { readonly type: 'remove'; readonly id: string } | { readonly type: 'clear' };
const empty: PhotoSelectionState = { photos: [], issues: [] };

function reduceSelection(state: PhotoSelectionState, action: Action): PhotoSelectionState {
  if (action.type === 'clear') return empty;
  if (action.type === 'remove') return { ...state, photos: state.photos.filter(photo => photo.id !== action.id) };
  const photos: PhotoSelection[] = action.type === 'replace' ? [] : [...state.photos];
  const issues: PhotoIssue[] = [];
  action.candidates.forEach(({ id, value }, index) => {
    const result = validatePhoto(value, action.policy);
    if (!result.ok) issues.push({ position: index + 1, code: result.code });
    else if (action.policy.maxFiles !== undefined && photos.length >= action.policy.maxFiles) {
      issues.push({ position: index + 1, code: 'too_many' });
    } else photos.push({ id, file: result.file });
  });
  return { photos, issues };
}

/** One selection source of truth. The reducer is pure under Strict Mode; IDs
 * are allocated only for explicit interactions, never during render/updaters.
 * Policy changes apply to subsequent batches, preserving existing selections.
 */
export function usePhotoSelection(policy: PhotoValidationPolicy = {}) {
  const prefix = useId();
  const serial = useRef(0);
  const [state, dispatch] = useReducer(reduceSelection, empty);
  const select = (type: 'add' | 'replace', values: readonly unknown[]) => {
    const candidates = values.map(value => ({ id: `${prefix}-photo-${String(++serial.current)}`, value }));
    dispatch({ type, candidates, policy });
  };
  return {
    ...state,
    add: (values: readonly unknown[]) => { select('add', values); },
    replace: (values: readonly unknown[]) => { select('replace', values); },
    remove: (id: string) => { dispatch({ type: 'remove', id }); },
    clear: () => { dispatch({ type: 'clear' }); },
  };
}
