import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { Brand } from './brand';
import { ProductPreview } from './product-preview';
import { PublicIcon, type PublicIconName } from './public-icon';
import { PUBLIC_SECTIONS, TRIAL_PATH } from './public-links';
import { PublicNavbar } from './public-navbar';

const steps = [
  ['Recepción', 'Registra el vehículo y su estado de ingreso.'],
  ['Diagnóstico', 'Documenta lo que necesita y por qué.'],
  ['Cotización', 'Presenta trabajos y repuestos con claridad.'],
  ['Autorización', 'Deja constancia de la decisión del cliente.'],
  ['Reparación', 'Sigue el avance del trabajo en el taller.'],
  ['Entrega', 'Cierra el servicio con un historial completo.'],
] as const;

const modules: readonly { name: string; text: string; icon: PublicIconName }[] = [
  { name: 'Recepciones', text: 'Cada ingreso, con sus detalles y evidencias.', icon: 'camera' },
  { name: 'Clientes', text: 'La información que tu equipo necesita a mano.', icon: 'people' },
  { name: 'Vehículos', text: 'Motos y carros con su propio registro.', icon: 'vehicle' },
  { name: 'Órdenes', text: 'El trabajo y su avance en un mismo lugar.', icon: 'order' },
  { name: 'Inventario', text: 'Visibilidad de los repuestos de tu taller.', icon: 'box' },
  { name: 'Historial', text: 'Cada servicio conectado al vehículo.', icon: 'history' },
  { name: 'Indicadores', text: 'Una vista clara de la operación.', icon: 'chart' },
];

export function LandingPage() {
  useEffect(() => { document.title = 'TallerMecario | Tu taller, en un solo lugar'; }, []);

  return (
    <div className="public-page">
      <a className="public-skip-link" href="#contenido">Saltar al contenido</a>
      <PublicNavbar />
      <main id="contenido" tabIndex={-1}>
        <section className="public-hero public-container" aria-labelledby="hero-title">
          <div className="public-hero-copy">
            <p className="public-eyebrow"><span /> MENOS CAOS. MÁS TALLER.</p>
            <h1 id="hero-title">La operación completa de tu taller, <span>en un solo lugar.</span></h1>
            <p className="public-lead">Recepción, evidencias, diagnósticos, cotizaciones, autorizaciones y seguimiento sin depender de papeles y chats desordenados.</p>
            <div className="public-actions"><Link className="public-button public-button-primary" to={TRIAL_PATH}>Probar gratis 7 días <PublicIcon name="arrow" /></Link><a className="public-button public-button-secondary" href="#como-funciona"><span className="public-play" aria-hidden="true">▷</span> Ver cómo funciona</a></div>
            <p className="public-hero-note"><PublicIcon name="check" /> Para talleres de motos y carros <span aria-hidden="true">·</span> Desde cualquier pantalla</p>
          </div>
          <ProductPreview />
        </section>
        <div className="public-benefit-strip"><div className="public-container"><span><PublicIcon name="order" /> Tu operación conectada</span><span><PublicIcon name="camera" /> Evidencias organizadas</span><span><PublicIcon name="message" /> Clientes al tanto</span><span><PublicIcon name="vehicle" /> Motos y carros</span></div></div>
        <section className="public-section public-container public-problem" aria-labelledby="problem-title">
          <div><p className="public-eyebrow">EL TALLER CRECE. EL DESORDEN NO TIENE QUE CRECER.</p><h2 id="problem-title">Que tu tiempo se vaya en el taller.<br /><span className="public-muted">No en buscar información.</span></h2><p>Cuando todo está repartido entre papeles y conversaciones, hasta el trabajo más sencillo se vuelve difícil de seguir.</p></div>
          <ul className="public-problem-list">{['Fotos perdidas en chats', 'Órdenes de trabajo en papel', 'Cotizaciones sin seguimiento', 'Autorizaciones verbales', 'Historial disperso'].map((problem, index) => <li key={problem}><span className="public-problem-number">0{index + 1}</span>{problem}<span className="public-problem-cross" aria-hidden="true">×</span></li>)}</ul>
        </section>
        <section id="como-funciona" className="public-section public-workflow" aria-labelledby="workflow-title" tabIndex={-1}>
          <div className="public-container"><div className="public-section-heading"><p className="public-eyebrow">UN FLUJO CLARO, DE PRINCIPIO A FIN</p><h2 id="workflow-title">Cada paso tiene su lugar.</h2><p>Tu equipo sabe qué sigue. Tú sabes en qué va cada vehículo.</p></div>
            <ol className="public-steps">{steps.map(([title, text], index) => <li key={title}><span className="public-step-number">0{index + 1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
            <div className="public-workflow-note"><PublicIcon name="link" /><span>Una orden. Un historial. Toda la operación conectada.</span></div>
          </div>
        </section>
        <section id="para-talleres" className="public-section public-container public-client" aria-labelledby="client-title" tabIndex={-1}>
          <div className="public-client-demo">
            <div className="public-message-card"><span className="public-message-avatar"><PublicIcon name="message" /></span><div><strong>Una actualización de tu taller</strong><p>Tu cotización está lista. Puedes revisarla desde este enlace.</p><span className="public-message-link">Ver cotización <PublicIcon name="arrow" /></span></div></div>
            <div className="public-client-browser"><div className="public-client-address"><PublicIcon name="link" /> TallerMecario · enlace web</div><span className="public-eyebrow">TU VEHÍCULO, AL DÍA</span><h3>Todo claro antes de continuar.</h3><p>Revisión de frenos</p><div className="public-client-line"><span>Diagnóstico y trabajos</span><PublicIcon name="check" /></div><div className="public-client-line"><span>Repuestos y cotización</span><PublicIcon name="check" /></div><div className="public-client-status"><PublicIcon name="order" /> Pendiente de tu autorización</div><small>Vista ilustrativa para el cliente</small></div>
          </div>
          <div><p className="public-eyebrow">MENOS FRICCIÓN. MEJOR COMUNICACIÓN.</p><h2 id="client-title">Tu cliente no necesita instalar otra aplicación.</h2><p>Puede revisar cotizaciones, autorizaciones y actualizaciones mediante enlaces web y WhatsApp. Una experiencia sencilla para él, con la información organizada para tu taller.</p><ul className="public-check-list"><li><PublicIcon name="check" /> Abre el enlace desde su celular.</li><li><PublicIcon name="check" /> Revisa la información del servicio.</li><li><PublicIcon name="check" /> Sigue el avance sin descargar una app.</li></ul></div>
        </section>
        <section id="producto" className="public-section public-modules" aria-labelledby="modules-title" tabIndex={-1}><div className="public-container"><div className="public-section-heading"><p className="public-eyebrow">EL TALLER COMPLETO, CONECTADO</p><h2 id="modules-title">Menos herramientas sueltas.<br />Más control de tu operación.</h2><p>Un espacio de trabajo pensado para el día a día del taller.</p></div><div className="public-module-grid">{modules.map((module) => <article className="public-module" key={module.name}><span className="public-icon-box"><PublicIcon name={module.icon} /></span><h3>{module.name}</h3><p>{module.text}</p></article>)}<div className="public-module public-module-outro"><span className="public-module-monogram" aria-hidden="true">TM.</span><p>Todo suma.<br /><strong>Todo en TallerMecario.</strong></p></div></div></div></section>
        <section id="precios" className="public-section public-container public-pricing" aria-labelledby="pricing-title" tabIndex={-1}><div><p className="public-eyebrow">CONOCE UNA FORMA MÁS SIMPLE DE TRABAJAR</p><h2 id="pricing-title">Dale 7 días a un taller más organizado.</h2><p>Prueba TallerMecario durante 7 días y conoce cómo encaja en tu operación.</p><p className="public-pricing-note">Los precios de suscripción estarán disponibles próximamente.</p></div><div className="public-trial-card"><span className="public-eyebrow">PRUEBA TALLERMECARIO</span><p><strong>7</strong> días</p><span>Para conocer tu próximo espacio de trabajo.</span><Link to={TRIAL_PATH} className="public-button public-button-primary">Probar gratis <PublicIcon name="arrow" /></Link></div></section>
        <section className="public-final-cta" aria-labelledby="cta-title"><div className="public-container"><div><p className="public-eyebrow">TU PRÓXIMO PASO EMPIEZA AQUÍ</p><h2 id="cta-title">Empieza a organizar tu taller hoy</h2><p>Prueba TallerMecario durante 7 días.</p></div><Link to={TRIAL_PATH} className="public-button public-button-white">Crear mi taller <PublicIcon name="arrow" /></Link></div></section>
      </main>
      <footer className="public-footer public-container"><div className="public-footer-top"><div><Brand /><p>El trabajo bien hecho empieza<br />con un taller bien organizado.</p></div><nav aria-label="Navegación del pie de página">{PUBLIC_SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`}>{section.label}</a>)}<Link to="/login">Iniciar sesión</Link></nav></div><div className="public-footer-bottom"><span>© {new Date().getFullYear()} TallerMecario</span><span>Hecho para el ritmo de tu taller.</span></div></footer>
    </div>
  );
}
