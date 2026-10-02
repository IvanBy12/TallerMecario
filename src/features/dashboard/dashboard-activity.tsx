import { EVENT_COPY } from './dashboard-copy';
import { formatAbsoluteTime, formatRelativeTime } from './dashboard-format';
import type { DashboardActivityItem } from './dashboard-types';

export interface DashboardActivityProps {
  readonly items: readonly DashboardActivityItem[];
  readonly now: Date;
}

/** Lista vertical de eventos recientes (sin tabla: se lee igual en 320 px y en escritorio). */
export function DashboardActivity({ items, now }: DashboardActivityProps) {
  return (
    <section className="dash-panel" aria-labelledby="dash-activity-title">
      <h2 className="dash-panel__title" id="dash-activity-title">
        Actividad reciente
      </h2>
      {items.length === 0 ? (
        <p className="dash-panel__empty">Todavía no hay actividad registrada hoy.</p>
      ) : (
        <ol className="dash-activity">
          {items.map((item) => (
            <li className="dash-activity__item" key={item.id}>
              <div className="dash-activity__main">
                <span className="dash-activity__plate">{item.plate}</span>
                <span className="dash-activity__vehicle">{item.vehicle}</span>
              </div>
              <p className="dash-activity__event">{EVENT_COPY[item.event].event}</p>
              <p className="dash-activity__customer">{item.customer}</p>
              <span className="dash-activity__status">{EVENT_COPY[item.event].status}</span>
              <time className="dash-activity__time" dateTime={item.occurredAt} title={formatAbsoluteTime(item.occurredAt)}>
                {formatRelativeTime(item.occurredAt, now)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
