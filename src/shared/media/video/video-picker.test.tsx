import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/shared/api/http-client';
import * as media from '../media-client';
import * as upload from '../media-upload';
import { VideoPicker } from './video-picker';
import { useVideoSelection } from './video-selection';
import { createVideoMetadataResource } from './video-metadata';
import type { VideoSelection } from './video-types';

// MIME/filenames/limits here are synthetic fixtures, not product defaults.
const video = (name = 'walk-around.fixture', type = 'video/example') => new File(['demo'], name, { type });
const createUrl = vi.fn<(file: Blob) => string>();
const revokeUrl = vi.fn<(url: string) => void>();
let decoders: HTMLVideoElement[] = [];
function spyOnMedia() {
  return {
    add: vi.spyOn(HTMLMediaElement.prototype, 'addEventListener'),
    remove: vi.spyOn(HTMLMediaElement.prototype, 'removeEventListener'),
    load: vi.spyOn(HTMLMediaElement.prototype, 'load'),
  };
}
let mediaDouble: ReturnType<typeof spyOnMedia>;
const input = (label = 'Seleccionar video') => {
  const element = screen.getByLabelText(label);
  if (!(element instanceof HTMLInputElement)) throw new Error('fixture input missing');
  return element;
};
const acknowledge = () => { fireEvent.click(screen.getByLabelText('He leído este aviso')); };
const choose = (file: File | null, label = 'Seleccionar video') => {
  fireEvent.change(input(label), { target: { files: file ? [file] : [] } });
};
const decoder = (index = decoders.length - 1) => {
  const element = decoders[index];
  if (!element) throw new Error('fixture decoder missing');
  return element;
};
const preview = () => screen.getByLabelText('Vista previa del video seleccionado');
const previewUrl = () => preview().getAttribute('src');
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const duration = async (seconds = 12, element = decoder()) => {
  Object.defineProperty(element, 'duration', { configurable: true, value: seconds });
  fireEvent.loadedMetadata(element);
  await flush();
};
const savedListener = (element: HTMLVideoElement, type: string) => {
  const index = mediaDouble.add.mock.calls.findIndex((call, i) => mediaDouble.add.mock.contexts[i] === element && call[0] === type);
  const listener = mediaDouble.add.mock.calls[index]?.[1];
  if (!listener) throw new Error('fixture listener missing');
  return () => {
    const event = new Event(type);
    if (typeof listener === 'function') listener.call(element, event);
    else listener.handleEvent(event);
  };
};
const expectedOwnership = (created: number) => {
  expect(createUrl).toHaveBeenCalledTimes(created);
  expect(revokeUrl.mock.calls.map(call => call[0]).sort()).toEqual(
    Array.from({ length: created }, (_, index) => `blob:video-fixture-${String(index + 1)}`).sort(),
  );
};

beforeEach(() => {
  decoders = [];
  let serial = 0;
  createUrl.mockReset().mockImplementation(() => `blob:video-fixture-${String(++serial)}`);
  revokeUrl.mockReset();
  mediaDouble = spyOnMedia();
  mediaDouble.load.mockReset().mockImplementation(function (this: HTMLMediaElement) {
    if (this instanceof HTMLVideoElement && this.hasAttribute('src') && !this.isConnected) decoders.push(this);
  });
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('VideoPicker local capture/selection', () => {
  it('gates both controls behind the local privacy notice', () => {
    render(<VideoPicker />);
    expect(screen.getByText(/Evita capturar rostros/)).toBeDefined();
    expect(input().disabled).toBe(true);
    expect(input('Grabar video').disabled).toBe(true);
    choose(video()); expect(createUrl).not.toHaveBeenCalled();
    acknowledge();
    expect(input().disabled).toBe(false);
    expect(input('Grabar video').disabled).toBe(false);
    expect(input().getAttribute('aria-describedby')).toContain('notice');
  });
  it('offers separate single-file capture hint and normal selection fallback', () => {
    render(<VideoPicker />); acknowledge();
    const capture = input('Grabar video');
    expect(capture.type).toBe('file');
    expect(capture.accept).toBe('video/*');
    expect(capture.getAttribute('capture')).toBe('environment');
    expect(capture.multiple).toBe(false);
    expect(input().accept).toBe('video/*');
    expect(input().multiple).toBe(false);
    expect(input().hasAttribute('capture')).toBe(false);
    expect(screen.getByText(/cámara depende del dispositivo/)).toBeDefined();
  });
  it.each(['Grabar video', 'Seleccionar video'])('preserves original File and publishes duration only after metadata (%s)', async label => {
    const changed = vi.fn<(selection: VideoSelection | null) => void>();
    render(<VideoPicker onSelectionChange={changed} />); acknowledge();
    const original = video();
    choose(original, label);
    expect(createUrl.mock.calls).toEqual([[original]]);
    expect(decoder().preload).toBe('metadata');
    expect(screen.getByText(/Obteniendo y validando/)).toBeDefined();
    expect(changed.mock.calls).toEqual([[null]]);
    expect(screen.queryByLabelText('Vista previa del video seleccionado')).toBeNull();
    await duration(12.5);
    const selected = changed.mock.calls.at(-1)?.[0];
    expect(selected?.file).toBe(original);
    expect(selected?.durationSeconds).toBe(12.5);
    expect(Object.keys(selected ?? {})).toEqual(['id', 'file', 'durationSeconds']);
    expect(previewUrl()).toBe('blob:video-fixture-1');
    expect(preview().hasAttribute('controls')).toBe(true);
    expect(preview().getAttribute('preload')).toBe('metadata');
    expect(preview().hasAttribute('autoplay')).toBe(false);
    expect(decoder().hasAttribute('src')).toBe(false);
    expect(mediaDouble.remove.mock.calls.filter(call => ['loadedmetadata', 'error'].includes(call[0]))).toHaveLength(2);
    expect(revokeUrl).not.toHaveBeenCalled();
  });
  it('keeps stable identity and URL on ordinary rerender', async () => {
    const changed = vi.fn<(selection: VideoSelection | null) => void>();
    const view = render(<VideoPicker onSelectionChange={changed} />); acknowledge();
    choose(video()); await duration();
    const selected = changed.mock.calls.at(-1)?.[0];
    const url = previewUrl();
    view.rerender(<VideoPicker onSelectionChange={changed} />);
    expect(changed.mock.calls.at(-1)?.[0]).toBe(selected);
    expect(previewUrl()).toBe(url);
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).not.toHaveBeenCalled();
  });
  it('supports inline parent callbacks in Strict Mode without loops or URL recreation', async () => {
    function Parent() {
      const [selected, setSelected] = useState<VideoSelection | null>(null);
      return <><p>Parent duration: {selected?.durationSeconds ?? 0}</p><VideoPicker onSelectionChange={next => { setSelected(next); }} /></>;
    }
    const view = render(<StrictMode><Parent /></StrictMode>); acknowledge();
    choose(video()); await duration();
    expect(screen.getByText('Parent duration: 12')).toBeDefined();
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).not.toHaveBeenCalled();
    view.unmount(); expectedOwnership(1);
  });
  it('unmount releases both ready and pending resources exactly once', async () => {
    const view = render(<VideoPicker />); acknowledge();
    choose(video()); await duration();
    choose(video());
    const pending = decoder();
    view.unmount();
    expectedOwnership(2);
    expect(pending.hasAttribute('src')).toBe(false);
  });
  it('removal releases ready resource after DOM removal and restores gallery focus', async () => {
    const view = render(<VideoPicker />); acknowledge(); choose(video()); await duration();
    revokeUrl.mockImplementation(url => { expect(document.querySelector(`video[src="${url}"]`)).toBeNull(); });
    const button = screen.getByRole('button', { name: 'Quitar video' });
    button.focus(); fireEvent.click(button);
    expect(button.isConnected).toBe(false);
    expect(document.activeElement).toBe(input());
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1']]);
    view.unmount(); expectedOwnership(1);
  });
  it('removal returns focus to acknowledgement if gallery is gated again', async () => {
    render(<VideoPicker />); acknowledge(); choose(video()); await duration(); acknowledge();
    const button = screen.getByRole('button', { name: 'Quitar video' });
    button.focus(); fireEvent.click(button);
    expect(document.activeElement).toBe(screen.getByLabelText('He leído este aviso'));
  });
  it('removal does not steal unrelated focus or move it on later rerender', async () => {
    const view = render(<VideoPicker />); acknowledge(); choose(video()); await duration();
    input('Grabar video').focus();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar video' }));
    expect(document.activeElement).toBe(input('Grabar video'));
    view.rerender(<VideoPicker />);
    expect(document.activeElement).toBe(input('Grabar video'));
  });
  it('same filename and re-selection of the identical File produce new IDs without copying File', async () => {
    const changed = vi.fn<(selection: VideoSelection | null) => void>();
    const view = render(<VideoPicker onSelectionChange={changed} />); acknowledge();
    const a = video(), b = video();
    choose(a); await duration(); const first = changed.mock.calls.at(-1)?.[0];
    choose(b); await duration(); const second = changed.mock.calls.at(-1)?.[0];
    choose(b); await duration(); const third = changed.mock.calls.at(-1)?.[0];
    expect(first?.id).not.toBe(second?.id);
    expect(second?.id).not.toBe(third?.id);
    expect(second?.file).toBe(b); expect(third?.file).toBe(b);
    expect(createUrl.mock.calls).toEqual([[a], [b], [b]]);
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1'], ['blob:video-fixture-2']]);
    view.unmount(); expectedOwnership(3);
  });
  it.each(['Grabar video', 'Seleccionar video'])('resets native input value for repeated selection (%s)', async label => {
    render(<VideoPicker />); acknowledge();
    const setter = vi.fn();
    Object.defineProperty(input(label), 'value', { configurable: true, get: () => '', set: setter });
    const original = video();
    choose(original, label); await duration();
    choose(original, label); await duration();
    expect(setter.mock.calls).toEqual([[''], ['']]);
    expect(createUrl.mock.calls).toEqual([[original], [original]]);
  });
  it('accepts empty MIME through metadata with no default policy', async () => {
    render(<VideoPicker />); acknowledge(); choose(video('unknown', '')); await duration(800000);
    expect(previewUrl()).toBe('blob:video-fixture-1');
    expect(screen.getByText(/Video seleccionado y listo/)).toBeDefined();
  });
  it.each([{ maxBytes: 3 }, { allowedMimeTypes: ['video/other'] }, { maxBytes: -1 }, { allowedMimeTypes: [] }])(
    'announces local structural/policy rejection without allocating URL (%#)', policy => {
      render(<VideoPicker policy={policy} />); acknowledge(); choose(video('blob:private /secret/path'));
      expect(createUrl).not.toHaveBeenCalled();
      expect(screen.getByText(/configura/).closest('[aria-live]')).not.toBeNull();
      expect(document.body.textContent).not.toMatch(/blob:private|secret|stack/);
    },
  );
  it('applies configured duration maximum before readiness (inclusive boundary)', async () => {
    const changed = vi.fn<(selection: VideoSelection | null) => void>();
    render(<VideoPicker policy={{ maxDurationSeconds: 12 }} onSelectionChange={changed} />); acknowledge();
    choose(video());
    expect(changed.mock.calls).toEqual([[null]]);
    await duration(12);
    expect(changed.mock.calls.at(-1)?.[0]?.durationSeconds).toBe(12);
  });
  it('too-long initial selection is rejected and releases its exact URL', async () => {
    const changed = vi.fn();
    render(<VideoPicker policy={{ maxDurationSeconds: 12 }} onSelectionChange={changed} />); acknowledge();
    choose(video()); await duration(12.1);
    expect(screen.getByText(/supera la duración/)).toBeDefined();
    expect(screen.queryByLabelText('Vista previa del video seleccionado')).toBeNull();
    expect(changed.mock.calls).toEqual([[null]]);
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1']]);
  });
  it.each([NaN, Infinity, -Infinity, 0, -1])('invalid duration %s safely rejects and revokes owned URL', async seconds => {
    render(<VideoPicker />); acknowledge(); choose(video()); await duration(seconds);
    expect(screen.getByText(/duración del video no es válida/)).toBeDefined();
    expect(screen.queryByLabelText('Vista previa del video seleccionado')).toBeNull();
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1']]);
  });
  it('media error safely rejects, detaches listeners and releases URL', async () => {
    render(<VideoPicker />); acknowledge(); choose(video('private-path'));
    const element = decoder(); fireEvent.error(element); await flush();
    expect(screen.getByText(/No se pudo obtener/)).toBeDefined();
    expect(element.hasAttribute('src')).toBe(false);
    expect(document.body.textContent).not.toContain('private-path');
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1']]);
    await duration(12, element);
    expect(screen.queryByLabelText('Vista previa del video seleccionado')).toBeNull();
  });
  it('object URL allocation failure shows only static feedback and preserves A', async () => {
    const view = render(<VideoPicker />); acknowledge(); choose(video()); await duration();
    createUrl.mockImplementationOnce(() => { throw new Error('blob:secret /private/path stack'); });
    choose(video());
    expect(screen.getByText(/No se pudo obtener/)).toBeDefined();
    expect(previewUrl()).toBe('blob:video-fixture-1');
    expect(document.body.textContent).not.toMatch(/blob:secret|private|stack/);
    expect(revokeUrl).not.toHaveBeenCalled();
    view.unmount(); expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1']]);
  });
  it('preview playback error has an accessible fallback and reset by valid replacement', async () => {
    render(<VideoPicker />); acknowledge(); choose(video()); await duration();
    fireEvent.error(preview());
    expect(screen.getByText(/Vista previa no disponible/).getAttribute('role')).toBe('status');
    expect(revokeUrl).not.toHaveBeenCalled();
    choose(video()); await duration();
    expect(previewUrl()).toBe('blob:video-fixture-2');
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1']]);
  });
  it('cancelled file chooser leaves A and its resources intact', async () => {
    render(<VideoPicker />); acknowledge(); choose(video()); await duration();
    choose(null);
    expect(previewUrl()).toBe('blob:video-fixture-1');
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).not.toHaveBeenCalled();
  });
  it('disabled controls ignore synthetic selection and keep the existing preview', async () => {
    const view = render(<VideoPicker />); acknowledge(); choose(video()); await duration();
    view.rerender(<VideoPicker disabled />);
    choose(video());
    expect(input().disabled).toBe(true);
    expect(screen.getByText('La selección de video está deshabilitada.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Quitar video' }).hasAttribute('disabled')).toBe(true);
    expect(previewUrl()).toBe('blob:video-fixture-1');
    expect(createUrl).toHaveBeenCalledTimes(1);
  });
  it('key reset releases old resources and resets notice acknowledgement', async () => {
    const view = render(<VideoPicker key="a" />); acknowledge(); choose(video()); await duration();
    view.rerender(<VideoPicker key="b" />);
    expect(input().disabled).toBe(true);
    expect(screen.queryByLabelText('Vista previa del video seleccionado')).toBeNull();
    expectedOwnership(1);
  });
  it('multiple instances have isolated IDs, previews, resources and focus restoration', async () => {
    const firstChanged = vi.fn<(selection: VideoSelection | null) => void>();
    const secondChanged = vi.fn<(selection: VideoSelection | null) => void>();
    const view = render(<><VideoPicker onSelectionChange={firstChanged} /><VideoPicker onSelectionChange={secondChanged} /></>);
    const pickers = screen.getAllByRole('region', { name: 'Selección local de video' });
    const [first, second] = pickers;
    if (!first || !second) throw new Error('fixture picker missing');
    for (const picker of pickers) {
      fireEvent.click(within(picker).getByLabelText('He leído este aviso'));
      fireEvent.change(within(picker).getByLabelText('Seleccionar video'), { target: { files: [video()] } });
      await duration();
    }
    expect(firstChanged.mock.calls.at(-1)?.[0]?.id).not.toBe(secondChanged.mock.calls.at(-1)?.[0]?.id);
    expect(within(first).getByLabelText('Seleccionar video').id).not.toBe(within(second).getByLabelText('Seleccionar video').id);
    const button = within(second).getByRole('button', { name: 'Quitar video' });
    button.focus(); fireEvent.click(button);
    expect(document.activeElement).toBe(within(second).getByLabelText('Seleccionar video'));
    expect(within(first).getByLabelText('Vista previa del video seleccionado').getAttribute('src')).toBe('blob:video-fixture-1');
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-2']]);
    view.unmount(); expectedOwnership(2);
  });
  it('selection/metadata/removal never invokes network/API/media/upload or whole-file reads', async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const apiSpy = vi.spyOn(api, 'createApiClient');
    const mediaSpy = vi.spyOn(media, 'createMediaClient');
    const putSpy = vi.spyOn(upload, 'putMedia');
    const readerSpy = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
    const dataSpy = vi.spyOn(FileReader.prototype, 'readAsDataURL');
    const view = render(<VideoPicker />); acknowledge();
    const original = video();
    const read = vi.fn(() => { throw new Error('whole-file reading forbidden'); });
    Object.defineProperty(original, 'arrayBuffer', { value: read });
    Object.defineProperty(original, 'text', { value: read });
    choose(original); await duration();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar video' }));
    view.unmount(); await flush();
    for (const spy of [fetchSpy, xhr, apiSpy, mediaSpy, putSpy, readerSpy, dataSpy, read]) expect(spy).not.toHaveBeenCalled();
    for (const spy of [xhr, apiSpy, mediaSpy, putSpy, readerSpy, dataSpy]) spy.mockRestore();
  });
});

describe('metadata races and atomic replacement', () => {
  it('A pending → B ready → late saved metadata callback A cannot overwrite B', async () => {
    const changed = vi.fn<(selection: VideoSelection | null) => void>();
    const view = render(<StrictMode><VideoPicker onSelectionChange={changed} /></StrictMode>); acknowledge();
    const a = video(), b = video();
    choose(a); const old = decoder(); const late = savedListener(old, 'loadedmetadata');
    choose(b);
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1']]);
    expect(old.hasAttribute('src')).toBe(false);
    await duration(15);
    expect(changed.mock.calls.at(-1)?.[0]?.file).toBe(b);
    Object.defineProperty(old, 'duration', { value: 25 });
    late(); fireEvent.loadedMetadata(old); await flush();
    expect(changed.mock.calls.at(-1)?.[0]?.file).toBe(b);
    expect(changed.mock.calls.filter(call => call[0] !== null)).toHaveLength(1);
    expect(previewUrl()).toBe('blob:video-fixture-2');
    view.unmount(); expectedOwnership(2);
  });
  it('resolved A promise waiting in queue cannot overwrite a newer B attempt', async () => {
    const changed = vi.fn<(selection: VideoSelection | null) => void>();
    render(<VideoPicker onSelectionChange={changed} />); acknowledge();
    choose(video()); const a = decoder(); Object.defineProperty(a, 'duration', { value: 12 });
    fireEvent.loadedMetadata(a);
    const b = video(); choose(b); await flush();
    expect(changed.mock.calls).toEqual([[null]]);
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1']]);
    await duration(18);
    expect(changed.mock.calls.at(-1)?.[0]?.file).toBe(b);
    expect(previewUrl()).toBe('blob:video-fixture-2');
  });
  it('unmount while A pending then late saved events causes no callbacks, errors or leaks', async () => {
    const changed = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const view = render(<StrictMode><VideoPicker onSelectionChange={changed} /></StrictMode>); acknowledge();
    choose(video()); const old = decoder();
    const late = savedListener(old, 'loadedmetadata');
    const lateError = savedListener(old, 'error');
    const before = changed.mock.calls.length;
    view.unmount();
    Object.defineProperty(old, 'duration', { value: 12 });
    late(); lateError(); await flush();
    expect(changed).toHaveBeenCalledTimes(before);
    expect(error).not.toHaveBeenCalled();
    expect(old.hasAttribute('src')).toBe(false);
    expectedOwnership(1);
    error.mockRestore();
  });
  it('resolved metadata followed immediately by unmount cannot publish selection', async () => {
    const changed = vi.fn();
    const view = render(<VideoPicker onSelectionChange={changed} />); acknowledge();
    choose(video()); Object.defineProperty(decoder(), 'duration', { value: 12 });
    fireEvent.loadedMetadata(decoder()); view.unmount(); await flush();
    expect(changed.mock.calls).toEqual([[null]]);
    expectedOwnership(1);
  });
  it.each(['type', 'duration', 'error'])('invalid B (%s) preserves ready A, its ID, File and usable preview', async reason => {
    const changed = vi.fn<(selection: VideoSelection | null) => void>();
    const view = render(<VideoPicker policy={{ maxDurationSeconds: 20 }} onSelectionChange={changed} />); acknowledge();
    choose(video()); await duration(12);
    const a = changed.mock.calls.at(-1)?.[0];
    choose(video('other', reason === 'type' ? 'text/plain' : 'video/example'));
    expect(previewUrl()).toBe('blob:video-fixture-1');
    if (reason === 'duration') await duration(21);
    if (reason === 'error') { fireEvent.error(decoder()); await flush(); }
    expect(changed.mock.calls.at(-1)?.[0]).toBe(a);
    expect(previewUrl()).toBe('blob:video-fixture-1');
    expect(screen.getByRole('button', { name: 'Quitar video' })).toBeDefined();
    expect(revokeUrl.mock.calls).toEqual(reason === 'type' ? [] : [['blob:video-fixture-2']]);
    view.unmount(); expectedOwnership(reason === 'type' ? 1 : 2);
  });
  it('valid B keeps A pending then atomically replaces and revokes only A after DOM change', async () => {
    const changed = vi.fn<(selection: VideoSelection | null) => void>();
    const view = render(<VideoPicker onSelectionChange={changed} />); acknowledge();
    const a = video(), b = video();
    choose(a); await duration(); choose(b);
    expect(previewUrl()).toBe('blob:video-fixture-1');
    expect(changed.mock.calls.at(-1)?.[0]?.file).toBe(a);
    expect(revokeUrl).not.toHaveBeenCalled();
    input().focus();
    revokeUrl.mockImplementation(url => { expect(document.querySelector(`video[src="${url}"]`)).toBeNull(); });
    await duration(17);
    expect(previewUrl()).toBe('blob:video-fixture-2');
    expect(changed.mock.calls.at(-1)?.[0]?.file).toBe(b);
    expect(document.activeElement).toBe(input());
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1']]);
    view.unmount(); expectedOwnership(2);
  });
  it('remove with A ready/B pending revokes both and late B cannot restore selection', async () => {
    const changed = vi.fn();
    const view = render(<VideoPicker onSelectionChange={changed} />); acknowledge();
    choose(video()); await duration(); choose(video());
    const b = decoder(); const late = savedListener(b, 'loadedmetadata');
    const remove = screen.getByRole('button', { name: 'Quitar video' }); remove.focus(); fireEvent.click(remove);
    expect(document.activeElement).toBe(input());
    expectedOwnership(2);
    Object.defineProperty(b, 'duration', { value: 12 }); late(); await flush();
    expect(changed.mock.calls.at(-1)?.[0]).toBeNull();
    expect(screen.queryByLabelText('Vista previa del video seleccionado')).toBeNull();
    view.unmount(); expectedOwnership(2);
  });
  it('remove pending-only A clears the attempt, releases URL and returns useful focus', async () => {
    render(<VideoPicker />); acknowledge(); choose(video());
    const remove = screen.getByRole('button', { name: 'Quitar video' }); remove.focus(); fireEvent.click(remove); await flush();
    expect(document.activeElement).toBe(input());
    expect(screen.queryByText(/Obteniendo y validando/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Quitar video' })).toBeNull();
    expectedOwnership(1);
  });
  it('policy changes apply to subsequent attempts and never mutate a pending policy snapshot', async () => {
    const mime = ['video/example'];
    const changed = vi.fn<(selection: VideoSelection | null) => void>();
    const view = render(<VideoPicker policy={{ maxDurationSeconds: 20, allowedMimeTypes: mime }} onSelectionChange={changed} />); acknowledge();
    choose(video());
    mime.length = 0;
    view.rerender(<VideoPicker policy={{ maxDurationSeconds: 5, allowedMimeTypes: mime }} onSelectionChange={changed} />);
    await duration(15);
    expect(changed.mock.calls.at(-1)?.[0]?.durationSeconds).toBe(15);
    choose(video());
    expect(previewUrl()).toBe('blob:video-fixture-1');
    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(revokeUrl).not.toHaveBeenCalled();
  });
});

describe('metadata resource ownership', () => {
  it('dispose settles cancelled metadata and detaches exact listeners once', async () => {
    const resource = createVideoMetadataResource(video());
    const element = decoder();
    resource.dispose(); resource.dispose();
    expect(await resource.result).toBeNull();
    expect(element.hasAttribute('src')).toBe(false);
    for (const type of ['loadedmetadata', 'error']) {
      const i = mediaDouble.add.mock.calls.findIndex((call, index) => mediaDouble.add.mock.contexts[index] === element && call[0] === type);
      expect(mediaDouble.remove.mock.calls).toContainEqual([type, mediaDouble.add.mock.calls[i]?.[1]]);
    }
    expectedOwnership(1);
  });
  it('a browser load exception gives a safe result and leaves disposal owned by caller', async () => {
    mediaDouble.load.mockImplementationOnce(() => { throw new Error('private-browser-error'); });
    const resource = createVideoMetadataResource(video());
    expect(await resource.result).toEqual({ ok: false });
    expect(revokeUrl).not.toHaveBeenCalled();
    resource.dispose(); expectedOwnership(1);
  });
});

describe('resource ownership across batched commits', () => {
  it('synchronous native metadata delivery preserves the promoted URL through effects', async () => {
    mediaDouble.load.mockImplementation(function (this: HTMLMediaElement) {
      if (!this.isConnected && this.hasAttribute('src')) {
        Object.defineProperty(this, 'duration', { configurable: true, value: 12 });
        this.dispatchEvent(new Event('loadedmetadata'));
      }
    });
    const view = render(<StrictMode><VideoPicker /></StrictMode>); acknowledge();
    choose(video()); await flush();
    expect(previewUrl()).toBe('blob:video-fixture-1');
    expect(revokeUrl).not.toHaveBeenCalled();
    view.unmount(); expectedOwnership(1);
  });
  it('metadata promotion followed by clear before commit still releases the exact URL', async () => {
    const view = renderHook(() => useVideoSelection(), { wrapper: StrictMode });
    await act(async () => {
      view.result.current.select(video());
      Object.defineProperty(decoder(), 'duration', { value: 12 });
      decoder().dispatchEvent(new Event('loadedmetadata'));
      await Promise.resolve();
      view.result.current.clear();
    });
    expect(view.result.current.video).toBeNull();
    expect(view.result.current.status).toBe('idle');
    expect(view.result.current.previewUrl).toBeNull();
    expectedOwnership(1);
    view.unmount(); expectedOwnership(1);
  });
  it('two promotions in one batch release an uncommitted A and preserve ready B', async () => {
    const a = video(), b = video();
    const view = renderHook(() => useVideoSelection(), { wrapper: StrictMode });
    await act(async () => {
      view.result.current.select(a);
      Object.defineProperty(decoder(), 'duration', { value: 12 });
      decoder().dispatchEvent(new Event('loadedmetadata'));
      await Promise.resolve();
      view.result.current.select(b);
      Object.defineProperty(decoder(), 'duration', { value: 17 });
      decoder().dispatchEvent(new Event('loadedmetadata'));
      await Promise.resolve();
    });
    expect(view.result.current.video?.file).toBe(b);
    expect(view.result.current.video?.durationSeconds).toBe(17);
    expect(view.result.current.status).toBe('ready');
    expect(view.result.current.previewUrl).toBe('blob:video-fixture-2');
    expect(revokeUrl.mock.calls).toEqual([['blob:video-fixture-1']]);
    view.unmount(); expectedOwnership(2);
  });
});
