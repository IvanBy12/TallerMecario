import { PublicIcon } from './public-icon';

const orders = [
  { code: 'OT-024', vehicle: 'Moto · mantenimiento', state: 'En reparación', style: 'blue' },
  { code: 'OT-025', vehicle: 'Carro · revisión de frenos', state: 'Por autorizar', style: 'orange' },
  { code: 'OT-026', vehicle: 'Moto · cambio de aceite', state: 'Lista para entrega', style: 'neutral' },
];

export function ProductPreview() {
  return (
    <figure className="product-preview">
      <div className="preview-window">
        <div className="preview-browser"><span className="preview-dots" aria-hidden="true">● ● ●</span><span><PublicIcon name="link" /> tallermecario / mi taller</span></div>
        <div className="preview-body">
          <div className="preview-sidebar" aria-hidden="true">
            <span className="preview-monogram">TM<span>.</span></span>
            <span className="preview-sidebar-active"><PublicIcon name="chart" /></span>
            <PublicIcon name="order" /><PublicIcon name="people" /><PublicIcon name="vehicle" /><PublicIcon name="box" />
          </div>
          <div className="preview-content">
            <div className="preview-heading"><div><span className="preview-kicker">MI TALLER</span><h2>Todo bajo control.</h2></div><span className="preview-avatar" aria-hidden="true">TM</span></div>
            <p className="preview-intro">Así se ve un día organizado en tu taller.</p>
            <div className="preview-metrics">
              <div><PublicIcon name="order" /><strong>12</strong><span>Órdenes activas</span></div>
              <div><PublicIcon name="wrench" /><strong>8</strong><span>En reparación</span></div>
              <div><PublicIcon name="check" /><strong>4</strong><span>Para entregar</span></div>
            </div>
            <div className="preview-orders-heading"><strong>Órdenes de trabajo</strong><span>Vista de ejemplo</span></div>
            <ul className="preview-orders">{orders.map((order) => <li key={order.code}><span className="preview-vehicle-icon"><PublicIcon name="vehicle" /></span><div><strong>{order.code}</strong><span>{order.vehicle}</span></div><span className={`preview-state preview-state-${order.style}`}>{order.state}</span></li>)}</ul>
            <div className="preview-progress"><span>De la recepción a la entrega</span><div aria-hidden="true"><i /><i /><i /><i /><i /><i /></div><span>Un solo historial. Cada paso conectado.</span></div>
          </div>
        </div>
      </div>
      <div className="preview-notification"><span className="public-icon-box"><PublicIcon name="check" /></span><div><strong>Autorización registrada</strong><span>El siguiente paso está claro.</span></div><span className="preview-notification-dot" aria-hidden="true" /></div>
      <figcaption>Vista ilustrativa del producto · datos de ejemplo</figcaption>
    </figure>
  );
}
