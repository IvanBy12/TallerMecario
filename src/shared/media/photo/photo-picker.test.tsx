import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/shared/api/http-client';
import * as media from '../media-client';
import * as upload from '../media-upload';
import { PhotoPicker } from './photo-picker';
import { PhotoPreviewList } from './photo-preview-list';
import { usePhotoSelection } from './photo-selection';
import type { PhotoSelection } from './photo-types';

const photo = (name = 'demo.jpg', type = 'image/example') => new File(['demo'], name, { type });
const createUrl = vi.fn<(file: Blob) => string>();
const revokeUrl = vi.fn<(url: string) => void>();
const input = (label = 'Seleccionar fotos') => {
  const element = screen.getByLabelText(label);
  if (!(element instanceof HTMLInputElement)) throw new Error('fixture input missing');
  return element;
};
const acknowledge = () => { fireEvent.click(screen.getByLabelText('He leído este aviso')); };
const choose = (files: readonly File[], label = 'Seleccionar fotos') => { fireEvent.change(input(label), { target: { files } }); };
const urls = () => screen.getAllByRole('img').map(img => img.getAttribute('src'));

beforeEach(() => {
  let sequence = 0;
  createUrl.mockReset().mockImplementation(() => `blob:local-demo-${String(++sequence)}`);
  revokeUrl.mockReset();
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PhotoPicker local-only behavior', () => {
  it('shows privacy guidance before native capture/gallery controls are usable', () => {
    render(<PhotoPicker />);
    expect(screen.getByText(/Evita capturar rostros/)).toBeDefined();
    expect(input('Tomar foto').disabled).toBe(true); expect(input().disabled).toBe(true);
    choose([photo()]); expect(createUrl).not.toHaveBeenCalled();
    acknowledge(); expect(input('Tomar foto').disabled).toBe(false); expect(input().disabled).toBe(false);
    expect(input().getAttribute('aria-describedby')).toContain('notice');
  });
  it('exposes one native environment capture and a separate multiple gallery', () => {
    render(<PhotoPicker />); acknowledge();
    expect(input('Tomar foto').type).toBe('file'); expect(input('Tomar foto').getAttribute('capture')).toBe('environment');
    expect(input('Tomar foto').multiple).toBe(false); expect(input('Tomar foto').accept).toBe('image/*');
    expect(input().multiple).toBe(true); expect(input().accept).toBe('image/*'); expect(input().hasAttribute('capture')).toBe(false);
  });
  it('captures repeatedly, appends gallery batches and exports original Files without URLs', () => {
    const changed = vi.fn<(photos: readonly PhotoSelection[]) => void>();
    render(<PhotoPicker onSelectionChange={changed} />); acknowledge();
    const a = photo(), b = photo(), c = photo(); choose([a], 'Tomar foto'); choose([b, c]);
    const selections = changed.mock.calls.at(-1)?.[0];
    expect(selections?.map(item => item.file)).toEqual([a, b, c]); expect(selections?.[0]?.file).toBe(a);
    expect(selections?.map(item => Object.keys(item))).toEqual([['id', 'file'], ['id', 'file'], ['id', 'file']]);
    expect(screen.getAllByRole('img').map(img => img.getAttribute('alt'))).toEqual(['Vista previa de la foto 1', 'Vista previa de la foto 2', 'Vista previa de la foto 3']);
  });
  it('a parent inline callback can retain selection state without an effect/render loop', () => {
    function Parent() {
      const [photos, setPhotos] = useState<readonly PhotoSelection[]>([]);
      return <><p>Parent count: {photos.length}</p><PhotoPicker onSelectionChange={next => { setPhotos([...next]); }} /></>;
    }
    render(<StrictMode><Parent /></StrictMode>); acknowledge(); choose([photo()]);
    expect(screen.getByText('Parent count: 1')).toBeDefined();
    expect(createUrl).toHaveBeenCalledTimes(2);
  });
  it('rerenders without new URLs or new local IDs', () => {
    const changed = vi.fn<(photos: readonly PhotoSelection[]) => void>();
    const view = render(<PhotoPicker onSelectionChange={changed} />); acknowledge(); choose([photo(), photo()]);
    const before = changed.mock.calls.at(-1)?.[0]; const beforeUrls = urls();
    view.rerender(<PhotoPicker onSelectionChange={changed} />);
    expect(changed.mock.calls.at(-1)?.[0]).toBe(before); expect(urls()).toEqual(beforeUrls); expect(createUrl).toHaveBeenCalledTimes(2);
  });
  it('accepts same filename and repeated File with independent preview ownership', () => {
    render(<PhotoPicker />); acknowledge(); const a = photo(); choose([a, photo()]); choose([a]);
    expect(new Set(urls()).size).toBe(3); expect(createUrl.mock.calls.map(call => call[0])).toEqual([a, expect.any(File), a]);
  });
  it('removes exactly one photo and revokes only its URL once after DOM removal', () => {
    const view = render(<PhotoPicker />); acknowledge(); choose([photo(), photo(), photo()]);
    revokeUrl.mockImplementation(url => { expect(document.querySelector(`img[src="${url}"]`)).toBeNull(); });
    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto 2' }));
    expect(urls()).toEqual(['blob:local-demo-1', 'blob:local-demo-3']);
    expect(revokeUrl.mock.calls).toEqual([['blob:local-demo-2']]);
    view.unmount(); expect(revokeUrl.mock.calls).toEqual([['blob:local-demo-2'], ['blob:local-demo-1'], ['blob:local-demo-3']]);
  });
  it('clears all previews and never revokes them twice on unmount', () => {
    const view = render(<PhotoPicker />); acknowledge(); choose([photo(), photo()]);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar todas las fotos' }));
    expect(screen.queryByRole('img')).toBeNull(); expect(revokeUrl.mock.calls).toEqual([['blob:local-demo-1'], ['blob:local-demo-2']]);
    view.unmount(); expect(revokeUrl).toHaveBeenCalledTimes(2);
  });
  it('unmount releases all remaining previews', () => {
    const view = render(<PhotoPicker />); acknowledge(); choose([photo(), photo()]); view.unmount();
    expect(revokeUrl.mock.calls).toEqual([['blob:local-demo-1'], ['blob:local-demo-2']]);
  });
  it('Strict Mode balances every probe/real URL and leaves active previews valid', () => {
    const view = render(<StrictMode><PhotoPicker /></StrictMode>); acknowledge(); choose([photo(), photo()]);
    const active = urls();
    active.forEach(url => { expect(revokeUrl.mock.calls.flat()).not.toContain(url); });
    expect(createUrl).toHaveBeenCalledTimes(4); expect(revokeUrl).toHaveBeenCalledTimes(2);
    view.rerender(<StrictMode><PhotoPicker /></StrictMode>); expect(createUrl).toHaveBeenCalledTimes(4);
    view.unmount();
    expect(revokeUrl).toHaveBeenCalledTimes(4); expect(new Set(revokeUrl.mock.calls.flat()).size).toBe(4);
    expect(revokeUrl.mock.calls.flat().sort()).toEqual(createUrl.mock.results.map(result => { const value: unknown = result.value; return value; }).sort());
  });
  it('key reset releases old previews and requires the notice again', () => {
    const view = render(<PhotoPicker key="a" />); acknowledge(); choose([photo()]);
    view.rerender(<PhotoPicker key="b" />);
    expect(revokeUrl.mock.calls).toEqual([['blob:local-demo-1']]); expect(input().disabled).toBe(true); expect(screen.queryByRole('img')).toBeNull();
  });
  it('replacement releases only superseded URLs', () => {
    const a = photo(), b = photo();
    function Harness() {
      const selection = usePhotoSelection();
      return <><button onClick={() => { selection.add([a]); }}>Add</button><button onClick={() => { selection.replace([b]); }}>Replace</button>
        <PhotoPreviewList photos={selection.photos} onRemove={selection.remove} /></>;
    }
    const view = render(<Harness />); fireEvent.click(screen.getByText('Add')); fireEvent.click(screen.getByText('Replace'));
    expect(createUrl.mock.calls.map(call => call[0])).toEqual([a, b]); expect(revokeUrl.mock.calls).toEqual([['blob:local-demo-1']]);
    expect(urls()).toEqual(['blob:local-demo-2']); view.unmount(); expect(revokeUrl.mock.calls).toEqual([['blob:local-demo-1'], ['blob:local-demo-2']]);
  });
  it('rejects a later invalid file without erasing a valid photo', () => {
    render(<PhotoPicker />); acknowledge(); choose([photo()]); choose([photo('demo.jpg', 'text/plain')]);
    expect(urls()).toEqual(['blob:local-demo-1']); expect(screen.getByRole('list', { name: 'Problemas de selección' }).textContent).toContain('Archivo 1:');
  });
  it.each([{ maxBytes: 3 }, { allowedMimeTypes: ['image/other'] }, { maxFiles: 0 }])('surfaces configurable policy rejection (%#)', policy => {
    render(<PhotoPicker policy={policy} />); acknowledge(); choose([photo()]);
    expect(screen.getByRole('list', { name: 'Problemas de selección' })).toBeDefined(); expect(createUrl).not.toHaveBeenCalled();
  });
  it('resets both native inputs after each selection to allow repeat interactions', () => {
    render(<PhotoPicker />); acknowledge(); const a = photo();
    for (const label of ['Tomar foto', 'Seleccionar fotos']) {
      const setter = vi.fn(); Object.defineProperty(input(label), 'value', { configurable: true, get: () => '', set: setter });
      choose([a], label); choose([a], label); expect(setter.mock.calls).toEqual([[''], ['']]);
    }
    expect(screen.getAllByRole('img')).toHaveLength(4);
  });
  it('missing MIME is retained and decoder failure has safe, accessible feedback', () => {
    render(<PhotoPicker />); acknowledge(); choose([photo('demo', '')]);
    fireEvent.error(screen.getByRole('img')); expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/Vista previa no disponible/).getAttribute('role')).toBe('status');
    expect(screen.getByRole('button', { name: 'Quitar foto 1' })).toBeDefined();
  });
  it('object URL failure never exposes private metadata/raw browser errors', () => {
    createUrl.mockImplementationOnce(() => { throw new Error('blob:secret /private/path stack-trace'); });
    render(<PhotoPicker />); acknowledge(); choose([photo('/private/filename')]);
    expect(screen.getByText(/Vista previa no disponible/)).toBeDefined();
    expect(document.body.textContent).not.toMatch(/blob:secret|private|stack-trace/);
    expect(screen.getByText('1 foto seleccionada')).toBeDefined(); expect(revokeUrl).not.toHaveBeenCalled();
  });
  it('validation uses a live region and never renders filenames/URLs/raw details', () => {
    render(<PhotoPicker policy={{ maxBytes: 1 }} />); acknowledge(); choose([photo('blob:secret /private/path')]);
    const feedback = screen.getByRole('list', { name: 'Problemas de selección' });
    expect(feedback.parentElement?.getAttribute('aria-live')).toBe('polite');
    expect(document.body.textContent).not.toMatch(/blob:secret|private/);
  });
  it('disabled controls explain their state and ignore synthetic selection changes', () => {
    const view = render(<PhotoPicker />); acknowledge(); choose([photo()]); view.rerender(<PhotoPicker disabled />);
    expect(input().disabled).toBe(true); expect(screen.getByText('La selección de fotos está deshabilitada.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Quitar foto 1' }).hasAttribute('disabled')).toBe(true);
    choose([photo()]); expect(createUrl).toHaveBeenCalledTimes(1);
  });
  it('cancelling the picker keeps existing selections', () => {
    render(<PhotoPicker />); acknowledge(); choose([photo()]); choose([]); expect(urls()).toEqual(['blob:local-demo-1']);
  });
  it('selection/removal invokes no fetch, ApiClient factory, media client or PUT transport', async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    const apiSpy = vi.spyOn(api, 'createApiClient'); const mediaSpy = vi.spyOn(media, 'createMediaClient'); const putSpy = vi.spyOn(upload, 'putMedia');
    const view = render(<PhotoPicker />); acknowledge(); choose([photo(), photo()]);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar foto 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar todas las fotos' })); view.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(fetchSpy).not.toHaveBeenCalled(); expect(apiSpy).not.toHaveBeenCalled(); expect(mediaSpy).not.toHaveBeenCalled(); expect(putSpy).not.toHaveBeenCalled();
  });
});


describe('PhotoPicker focus after explicit removal', () => {
  it('removes the middle button and focuses the next photo at the same position', () => {
    render(<PhotoPicker />); acknowledge(); choose([photo(), photo(), photo()]);
    const removed = screen.getByRole('button', { name: 'Quitar foto 2' });
    const next = screen.getByRole('button', { name: 'Quitar foto 3' });
    removed.focus(); fireEvent.click(removed);
    expect(removed.isConnected).toBe(false);
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute('aria-label')).toBe('Quitar foto 2');
  });
  it('removes the final photo and focuses the previous remaining remove button', () => {
    render(<PhotoPicker />); acknowledge(); choose([photo(), photo(), photo()]);
    const previous = screen.getByRole('button', { name: 'Quitar foto 2' });
    const removed = screen.getByRole('button', { name: 'Quitar foto 3' });
    removed.focus(); fireEvent.click(removed);
    expect(removed.isConnected).toBe(false);
    expect(document.activeElement).toBe(previous);
  });
  it('removes the only photo and focuses the gallery control', () => {
    render(<PhotoPicker />); acknowledge(); choose([photo()]);
    const removed = screen.getByRole('button', { name: 'Quitar foto 1' });
    removed.focus(); fireEvent.click(removed);
    expect(removed.isConnected).toBe(false);
    expect(document.activeElement).toBe(input());
  });
  it('clears all photos and focuses the gallery after the clear control becomes disabled', () => {
    render(<PhotoPicker />); acknowledge(); choose([photo(), photo()]);
    const clear = screen.getByRole('button', { name: 'Quitar todas las fotos' });
    clear.focus(); fireEvent.click(clear);
    expect(screen.queryByRole('button', { name: 'Quitar foto 1' })).toBeNull();
    expect(clear.hasAttribute('disabled')).toBe(true);
    expect(document.activeElement).toBe(input());
  });
  it('focuses the notice control if the gallery is disabled after the notice is unchecked', () => {
    render(<PhotoPicker />); acknowledge(); choose([photo()]); acknowledge();
    expect(input().disabled).toBe(true);
    const removed = screen.getByRole('button', { name: 'Quitar foto 1' });
    removed.focus(); fireEvent.click(removed);
    expect(removed.isConnected).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText('He leído este aviso'));
  });
  it('mouse down does not move focus before removal completes', () => {
    render(<PhotoPicker />); acknowledge(); choose([photo(), photo()]);
    const removed = screen.getByRole('button', { name: 'Quitar foto 1' });
    const next = screen.getByRole('button', { name: 'Quitar foto 2' });
    removed.focus(); fireEvent.mouseDown(removed);
    expect(removed.isConnected).toBe(true);
    expect(document.activeElement).toBe(removed);
    fireEvent.mouseUp(removed); fireEvent.click(removed);
    expect(removed.isConnected).toBe(false);
    expect(document.activeElement).toBe(next);
  });
  it.each(['Quitar foto 1', 'Quitar todas las fotos'])('keeps unrelated focus when %s was not focused', name => {
    render(<PhotoPicker />); acknowledge(); choose([photo(), photo()]);
    const capture = input('Tomar foto'); capture.focus();
    fireEvent.click(screen.getByRole('button', { name }));
    expect(document.activeElement).toBe(capture);
  });
  it('does not move focus on ordinary rerenders after restoring it', () => {
    const view = render(<StrictMode><PhotoPicker /></StrictMode>); acknowledge(); choose([photo(), photo()]);
    const removed = screen.getByRole('button', { name: 'Quitar foto 1' });
    removed.focus(); fireEvent.click(removed);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Quitar foto 1' }));
    const capture = input('Tomar foto'); capture.focus();
    view.rerender(<StrictMode><PhotoPicker /></StrictMode>);
    choose([photo()]);
    expect(document.activeElement).toBe(capture);
  });
  it.each(['remove', 'clear'])('keeps %s focus restoration inside the active picker instance', action => {
    render(<><PhotoPicker /><PhotoPicker /></>);
    const pickers = screen.getAllByRole('region', { name: 'Selección local de fotos' });
    const [first, second] = pickers;
    if (!first || !second) throw new Error('fixture pickers missing');
    for (const picker of pickers) {
      fireEvent.click(within(picker).getByLabelText('He leído este aviso'));
      fireEvent.change(within(picker).getByLabelText('Seleccionar fotos'), { target: { files: [photo()] } });
    }
    const control = within(second).getByRole('button', { name: action === 'remove' ? 'Quitar foto 1' : 'Quitar todas las fotos' });
    control.focus(); fireEvent.click(control);
    expect(document.activeElement).toBe(within(second).getByLabelText('Seleccionar fotos'));
    expect(within(first).getByRole('button', { name: 'Quitar foto 1' }).isConnected).toBe(true);
    expect(within(first).getByLabelText('Seleccionar fotos').id).not.toBe(within(second).getByLabelText('Seleccionar fotos').id);
  });
  it('waits for DOM removal when the preview list consumer defers its update', () => {
    const photos: readonly PhotoSelection[] = [{ id: 'a', file: photo() }, { id: 'b', file: photo() }];
    const remove = vi.fn();
    const view = render(<PhotoPreviewList photos={photos} onRemove={remove} />);
    const removed = screen.getByRole('button', { name: 'Quitar foto 1' });
    const next = screen.getByRole('button', { name: 'Quitar foto 2' });
    removed.focus(); fireEvent.click(removed);
    expect(remove).toHaveBeenCalledWith('a');
    expect(removed.isConnected).toBe(true);
    expect(document.activeElement).toBe(removed);
    view.rerender(<PhotoPreviewList photos={photos.slice(1)} onRemove={remove} />);
    expect(removed.isConnected).toBe(false);
    expect(document.activeElement).toBe(next);
  });
});

describe('orchestration selection boundary', () => {
  it('locks selection independently of the consumer action and preserves the original File', () => {
    const original = photo(), action = vi.fn();
    const slot = (selection: PhotoSelection) => <button type="button" onClick={() => { action(selection.file); }}>Acción de carga</button>;
    const view = render(<PhotoPicker renderPhoto={slot}/>); acknowledge(); choose([original]);
    view.rerender(<PhotoPicker disabled renderPhoto={slot}/>);
    expect(input().disabled).toBe(true); fireEvent.click(screen.getByRole('button', { name: 'Quitar foto 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Acción de carga' })); expect(action).toHaveBeenCalledWith(original);
    expect(screen.getByRole('img')).toBeDefined(); expect(revokeUrl).not.toHaveBeenCalled();
    expect(screen.queryByText(/No se han subido ni guardado/)).toBeNull();
  });
});
