import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('AppShell: altura dinámica y controles con menú abierto', () => {
  it.each([320, 390, 768, 1440])('observa el header a %i px y conserva los controles accionables', (width) => {
    let height = width < 400 ? 99 : 56;
    let resized: () => void = () => { throw new Error('observer no inicializado'); };
    const disconnect = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, width, height));
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    const onChangeWorkshop = vi.fn(); const onSignOut = vi.fn();
    const rendered = render(<MemoryRouter><AppShell status="context_ready" grantedPermissions={new Set(['dashboard.operational.read'])} workshopName="Taller demo" onChangeWorkshop={onChangeWorkshop} onSignOut={onSignOut} /></MemoryRouter>);
    const shell = rendered.container.querySelector<HTMLElement>('.shell');
    expect(shell?.style.getPropertyValue('--shell-header-height')).toBe(`${String(height)}px`);
    fireEvent.click(screen.getByRole('button', { name: 'Menú' }));
    expect(screen.getByRole('button', { name: 'Menú' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Cambiar taller' }).closest('header')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar taller' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(onChangeWorkshop).toHaveBeenCalledTimes(1); expect(onSignOut).toHaveBeenCalledTimes(1);
    height += 40;
    act(() => { resized(); });
    expect(shell?.style.getPropertyValue('--shell-header-height')).toBe(`${String(height)}px`);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Menú' }).getAttribute('aria-expanded')).toBe('false');
    rendered.unmount(); expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
