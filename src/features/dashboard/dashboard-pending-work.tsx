import { PENDING_COPY } from './dashboard-copy';
import type { DashboardPendingItem } from './dashboard-types';

/**
 * Trabajo que requiere atención. Ninguna fila enlaza todavía: las órdenes de trabajo no tienen
 * pantalla propia, así que no se ofrece navegación inexistente.
 */
export function DashboardPendingWork({ items }: { readonly items: readonly DashboardPendingItem[] }) {
  return (
    <section className="dash-panel" aria-labelledby="dash-pending-title">
      <h2 className="dash-panel__title" id="dash-pending-title">
        Requiere atención
      </h2>
      <ul className="dash-pending">
        {items.map((item) => (
          <li className="dash-pending__item" key={item.id} data-empty={item.count === 0}>
            <span className="dash-pending__count">{item.count}</span>
            <div>
              <p className="dash-pending__title">{PENDING_COPY[item.id].title}</p>
              <p className="dash-pending__hint">{PENDING_COPY[item.id].hint}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
