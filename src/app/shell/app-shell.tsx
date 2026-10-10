import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { useVoluntaryExit } from '@/shared/navigation/voluntary-exit';

import { StatusBanner } from '@/shared/ui/status-banner';

import {
  DASHBOARD_PATH,
  NAVIGATION_SECTIONS,
  visibleSections,
  type GrantedPermissions,
} from '../navigation';
import type { ShellContextStatus } from '../shell-status';
import { NavIcon } from './nav-icon';

export interface AppShellProps {
  readonly status: ShellContextStatus;
  readonly workshopName?: string;
  readonly onChangeWorkshop?: () => void;
  readonly onSignOut: () => void;
  /**
   * Permisos efectivos para filtrar la navegación. Por defecto `null` (G5 pendiente): no se
   * filtra nada porque el backend todavía no entrega catálogo, y no se simula ninguno.
   */
  readonly grantedPermissions?: GrantedPermissions;
}

/**
 * Layout principal autenticado: cabecera, barra lateral en escritorio, menú desplegable en móvil
 * y área de contenido. Sólo se monta desde `AuthenticatedRoot`, con un estado ya validado.
 */
export function AppShell({ status, onSignOut, grantedPermissions = null, workshopName, onChangeWorkshop }: AppShellProps) {
  const runExit = useVoluntaryExit();
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const navigationId = useId();
  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const focusMainOnCloseRef = useRef(false);
  const sections = visibleSections(NAVIGATION_SECTIONS, grantedPermissions);

  useLayoutEffect(() => {
    const header = headerRef.current;
    const shell = shellRef.current;
    if (header === null || shell === null) return;
    const measure = () => {
      shell.style.setProperty('--shell-header-height', `${String(header.getBoundingClientRect().height)}px`);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => { observer.disconnect(); };
  }, []);

  useEffect(() => {
    if (!isNavigationOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNavigationOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNavigationOpen]);

  useEffect(() => {
    if (!isNavigationOpen && focusMainOnCloseRef.current) {
      focusMainOnCloseRef.current = false;
      mainRef.current?.focus();
    }
  }, [isNavigationOpen]);

  const closeNavigation = () => {
    setIsNavigationOpen(false);
  };

  return (
    <div ref={shellRef} className={`shell${isNavigationOpen ? ' shell--nav-open' : ''}`}>
      <a className="shell__skip-link" href="#contenido-principal">
        Saltar al contenido principal
      </a>

      <header ref={headerRef} className="shell__header">
        <button
          type="button"
          ref={menuButtonRef}
          className="shell__nav-toggle"
          aria-expanded={isNavigationOpen}
          aria-controls={navigationId}
          onClick={() => {
            setIsNavigationOpen((open) => !open);
          }}
        >
          <span className="shell__nav-toggle-icon" aria-hidden="true" />
          <span className="shell__nav-toggle-label">Menú</span>
        </button>

        <Link className="shell__brand" to={DASHBOARD_PATH}>
          <span className="shell__brand-mark" aria-hidden="true">
            TM
          </span>
          <span className="shell__brand-text">
            <span className="shell__brand-name">TallerMecario</span>
            <span className="shell__brand-tagline">{workshopName ?? 'Operación de taller'}</span>
          </span>
        </Link>

        <div className="shell__header-actions">
          {onChangeWorkshop === undefined ? null : <button type="button" className="ui-button ui-button--ghost" onClick={() => { runExit(onChangeWorkshop); }}>Cambiar taller</button>}
          <button type="button" className="ui-button ui-button--ghost" onClick={() => { runExit(onSignOut); }}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="shell__body">
        <aside className="shell__sidebar" id={navigationId}>
          <nav className="nav" aria-label="Navegación principal">
            {sections.map((section) => (
              <div className="nav__section" key={section.id}>
                <h2 className="nav__section-title">{section.label}</h2>
                <ul className="nav__list">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <NavLink
                        to={item.path}
                        onClick={() => {
                          focusMainOnCloseRef.current = isNavigationOpen;
                          closeNavigation();
                        }}
                        className={({ isActive }) =>
                          `nav__link${isActive ? ' nav__link--active' : ''}`
                        }
                      >
                        <NavIcon name={item.icon} />
                        <span className="nav__label">{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {isNavigationOpen ? (
          <button
            type="button"
            className="shell__scrim"
            aria-label="Cerrar el menú de navegación"
            onClick={closeNavigation}
          />
        ) : null}

        <main ref={mainRef} className="shell__main" id="contenido-principal" tabIndex={-1}>
          <div className="shell__content">
            {status === 'context_pending' ? (
              <StatusBanner tone="warning" title="Contexto de taller pendiente">
                <p>
                  Tu sesión está iniciada, pero el acceso a talleres todavía no está integrado. Las
                  secciones se muestran sin datos del taller.
                </p>
              </StatusBanner>
            ) : null}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
