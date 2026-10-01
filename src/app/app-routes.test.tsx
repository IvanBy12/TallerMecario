import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { renderWithAuth, signedInSnapshot } from '@/test/render-with-auth';

import { AppRoutes } from './app-routes';
import { NAVIGATION_ITEMS } from './navigation';
import type { ShellContextStatus } from './shell-status';

interface RenderRoutesOptions {
  readonly initialEntries: readonly string[];
  readonly shellStatus?: ShellContextStatus;
  readonly onSignOut?: () => void;
}

function renderRoutes(options: RenderRoutesOptions) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[...options.initialEntries]}>
      <AppRoutes
        shellStatus={options.shellStatus ?? 'context_pending'}
        onSignOut={options.onSignOut ?? (() => undefined)}
      />
    </MemoryRouter>,
    { snapshot: signedInSnapshot() },
  );
}

const mainHeading = (name: string) => screen.getByRole('heading', { level: 1, name });

describe('rutas de la aplicación', () => {
  it('la raíz redirige al panel', () => {
    renderRoutes({ initialEntries: ['/'] });
    expect(mainHeading('Panel')).toBeDefined();
  });

  it('cada sección declarada tiene su propia página', () => {
    for (const item of NAVIGATION_ITEMS) {
      const view = renderRoutes({ initialEntries: [item.path] });
      expect(mainHeading(item.label)).toBeDefined();
      view.unmount();
    }
  });

  it('navegar con la barra lateral cambia de sección y marca la entrada activa', () => {
    renderRoutes({ initialEntries: ['/panel'] });
    expect(screen.getByRole('link', { name: 'Recepciones' }).getAttribute('aria-current')).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Recepciones' }));

    expect(mainHeading('Recepciones')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Recepciones' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Panel' }).getAttribute('aria-current')).toBeNull();
  });

  it('una ruta desconocida muestra el 404 dentro del shell y permite volver', () => {
    renderRoutes({ initialEntries: ['/ruta-inexistente'] });

    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeDefined();
    expect(mainHeading('Página no encontrada')).toBeDefined();
    expect(screen.getByText(/Ninguna sección responde a la ruta \/ruta-inexistente\./)).toBeDefined();

    const back = screen.getByRole('link', { name: 'Volver al panel' });
    expect(back.getAttribute('href')).toBe('/panel');
    fireEvent.click(back);
    expect(mainHeading('Panel')).toBeDefined();
  });

  it('el menú móvil se abre, se cierra con Escape y se cierra al navegar', () => {
    // jsdom no evalúa las media queries: se comprueba el estado de la interacción (aria + clase),
    // que es lo que dispara el cambio de disposición en el navegador.
    renderRoutes({ initialEntries: ['/panel'] });

    const toggle = () => screen.getByRole('button', { name: 'Menú' });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    const navigationId = toggle().getAttribute('aria-controls');
    expect(navigationId).not.toBeNull();
    expect(document.getElementById(navigationId ?? '')).not.toBeNull();

    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.shell--nav-open')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar el menú de navegación' })).toBeDefined();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.shell--nav-open')).toBeNull();

    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('link', { name: 'Clientes' }));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(mainHeading('Clientes')).toBeDefined();

    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el menú de navegación' }));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('Escape devuelve el foco desde un enlace del menú móvil al botón Menú', () => {
    renderRoutes({ initialEntries: ['/panel'] });
    const toggle = screen.getByRole('button', { name: 'Menú' });
    fireEvent.click(toggle);
    const link = screen.getByRole('link', { name: 'Clientes' });
    link.focus();
    expect(document.activeElement).toBe(link);

    fireEvent.keyDown(link, { key: 'Escape' });

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.shell--nav-open')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    expect(mainHeading('Panel')).toBeDefined();
  });

  it('activar un enlace del menú móvil cambia de ruta y enfoca el contenido principal', () => {
    renderRoutes({ initialEntries: ['/panel'] });
    const toggle = screen.getByRole('button', { name: 'Menú' });
    fireEvent.click(toggle);
    const link = screen.getByRole('link', { name: 'Clientes' });
    link.focus();
    expect(document.activeElement).toBe(link);

    fireEvent.click(link);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.shell--nav-open')).toBeNull();
    expect(link.getAttribute('aria-current')).toBe('page');
    const main = screen.getByRole('main');
    expect(main.contains(mainHeading('Clientes'))).toBe(true);
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(main);
  });
  it('avisa del contexto de taller pendiente sólo cuando el contexto no está listo', () => {
    const pending = renderRoutes({ initialEntries: ['/panel'], shellStatus: 'context_pending' });
    expect(screen.getByText('Contexto de taller pendiente')).toBeDefined();
    expect(screen.getByText(/el acceso a talleres todavía no está integrado/)).toBeDefined();
    pending.unmount();

    renderRoutes({ initialEntries: ['/panel'], shellStatus: 'context_ready' });
    expect(screen.queryByText('Contexto de taller pendiente')).toBeNull();
  });

  it('el encabezado cierra la sesión con la acción recibida', () => {
    const onSignOut = vi.fn();
    renderRoutes({ initialEntries: ['/panel'], onSignOut });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
