import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { usePhotoSelection } from './photo-selection';
import type { PhotoValidationPolicy } from './photo-types';
const file = () => new File(['demo'], 'same.jpg', { type: 'image/example' });
const wrapper = ({ children }: { readonly children: ReactNode }) => <StrictMode>{children}</StrictMode>;

describe('local selection state', () => {
  it('appends batches in order, retains original Files and IDs across rerender', () => {
    const a = file(), b = file(), c = file();
    const { result, rerender } = renderHook(() => usePhotoSelection(), { wrapper });
    act(() => { result.current.add([a, b]); result.current.add([c]); });
    const ids = result.current.photos.map(photo => photo.id);
    expect(new Set(ids).size).toBe(3);
    expect(result.current.photos.map(photo => photo.file)).toEqual([a, b, c]);
    expect(result.current.photos[0]?.file).toBe(a);
    rerender(); expect(result.current.photos.map(photo => photo.id)).toEqual(ids);
  });
  it('deliberately accepts the exact same File repeatedly as distinct selections', () => {
    const a = file(); const { result } = renderHook(() => usePhotoSelection());
    act(() => { result.current.add([a, a]); result.current.add([a]); });
    expect(result.current.photos.map(photo => photo.file)).toEqual([a, a, a]);
    expect(new Set(result.current.photos.map(photo => photo.id)).size).toBe(3);
  });
  it('keeps existing and valid batch entries when another is rejected', () => {
    const a = file(), b = file(); const { result } = renderHook(() => usePhotoSelection());
    act(() => { result.current.add([a]); result.current.add([null, b]); });
    expect(result.current.photos.map(photo => photo.file)).toEqual([a, b]);
    expect(result.current.issues).toEqual([{ position: 1, code: 'invalid_file' }]);
  });
  it('counts accepted entries and existing photos against the injected maxFiles', () => {
    const a = file(), b = file(), c = file(); const { result } = renderHook(() => usePhotoSelection({ maxFiles: 2 }));
    act(() => { result.current.add([a]); result.current.add([null, b, c]); });
    expect(result.current.photos.map(photo => photo.file)).toEqual([a, b]);
    expect(result.current.issues).toEqual([{ position: 1, code: 'invalid_file' }, { position: 3, code: 'too_many' }]);
  });
  it('removes only the given ID, naturally closes the gap and tolerates stale IDs', () => {
    const a = file(), b = file(), c = file(); const { result } = renderHook(() => usePhotoSelection());
    act(() => { result.current.add([a, b, c]); });
    const id = result.current.photos[1]?.id;
    if (id === undefined) throw new Error('fixture missing');
    act(() => { result.current.remove(id); result.current.remove(id); });
    expect(result.current.photos.map(photo => photo.file)).toEqual([a, c]);
  });
  it('explicit replacement and clearing discard the old collection and feedback', () => {
    const a = file(), b = file(); const { result } = renderHook(() => usePhotoSelection());
    act(() => { result.current.add([a, null]); result.current.replace([b]); });
    expect(result.current.photos.map(photo => photo.file)).toEqual([b]); expect(result.current.issues).toEqual([]);
    act(() => { result.current.clear(); }); expect(result.current.photos).toEqual([]); expect(result.current.issues).toEqual([]);
  });
  it('policy updates apply to new batches without erasing previous photos', () => {
    const { result, rerender } = renderHook(({ policy }: { readonly policy: PhotoValidationPolicy }) => usePhotoSelection(policy), { initialProps: { policy: {} } });
    const a = file(); act(() => { result.current.add([a]); });
    rerender({ policy: { maxFiles: 0 } }); act(() => { result.current.add([file()]); });
    expect(result.current.photos.map(photo => photo.file)).toEqual([a]); expect(result.current.issues[0]?.code).toBe('too_many');
  });
});
