import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Brand } from './brand';
import { PublicIcon } from './public-icon';

export function LoginLayout({ children }: { readonly children: ReactNode }) {
  useEffect(() => { document.title = 'Iniciar sesión | TallerMecario'; }, []);

  return (
    <div className="public-page public-login">
      <a className="public-skip-link" href="#login-content">Saltar al inicio de sesión</a>
      <aside className="public-login-brand" aria-label="TallerMecario">
        <Brand />
        <div className="public-login-story"><p className="public-eyebrow">MÁS ORDEN. MÁS TRANQUILIDAD.</p><h2>Tu taller avanza.<br />Tú tienes el control.</h2><p>Todo lo que pasa en tu taller, conectado en un solo lugar.</p><ul><li><PublicIcon name="order" /><div><strong>Una operación organizada</strong><span>De la recepción a la entrega.</span></div></li><li><PublicIcon name="camera" /><div><strong>Cada detalle, a mano</strong><span>Evidencias e historial en su lugar.</span></div></li><li><PublicIcon name="message" /><div><strong>Clientes al tanto</strong><span>Información clara, sin otra aplicación.</span></div></li></ul><div className="public-login-journey" aria-hidden="true"><span>Recepción</span><i /><span>Entrega <PublicIcon name="check" /></span></div></div>
        <p className="public-login-brand-footer">Para talleres de motos y carros.</p>
      </aside>
      <main id="login-content" className="public-login-content" tabIndex={-1}>
        <div className="public-login-mobile-brand"><Brand /></div>
        <Link to="/" className="public-back-link"><span aria-hidden="true">←</span> Volver al inicio</Link>
        <div className="public-login-form"><p className="public-eyebrow">TU ESPACIO DE TRABAJO</p><h1>Bienvenido a tu taller.</h1><p>Inicia sesión y continúa con tu operación.</p><div className="public-auth-panel">{children}</div></div>
        <p className="public-login-footer">TallerMecario · Todo en un solo lugar.</p>
      </main>
    </div>
  );
}
