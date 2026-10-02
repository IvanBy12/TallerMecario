import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Brand } from './brand';
import { PUBLIC_SECTIONS, TRIAL_PATH } from './public-links';

export function PublicNavbar() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  return (
    <header className="public-header">
      <div className="public-container public-header-inner">
        <Brand />
        <button ref={toggleRef} type="button" className="public-menu-toggle" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={open} aria-controls="public-navigation" onClick={() => { setOpen(!open); }}>
          <span aria-hidden="true">{open ? '✕' : '☰'}</span>
        </button>
        <nav id="public-navigation" className={`public-navigation${open ? ' is-open' : ''}`} aria-label="Navegación pública" onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            toggleRef.current?.focus();
          }
        }}>
          {PUBLIC_SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`} onClick={() => { setOpen(false); }}>{section.label}</a>)}
          <Link to="/login" className="public-login-link" onClick={() => { setOpen(false); }}>Iniciar sesión</Link>
          <Link to={TRIAL_PATH} className="public-button public-button-primary" onClick={() => { setOpen(false); }}>Probar gratis <span aria-hidden="true">↗</span></Link>
        </nav>
      </div>
    </header>
  );
}
