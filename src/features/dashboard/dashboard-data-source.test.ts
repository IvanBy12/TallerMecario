import { describe, expect, it } from 'vitest';

import { createMockDashboardDataSource } from './dashboard-data-source';
import { formatRelativeTime } from './dashboard-format';
import { isSnapshotEmpty } from './dashboard-types';

const NOW = new Date('2026-10-02T15:00:00Z');

describe('MockDashboardDataSource', () => {
  it('devuelve un snapshot coherente con la hora inyectada', async () => {
    const snapshot = await createMockDashboardDataSource({ delayMs: 0, now: () => NOW }).load(new AbortController().signal);

    expect(isSnapshotEmpty(snapshot)).toBe(false);
    expect(snapshot.kpis.map((kpi) => kpi.id)).toEqual([
      'receptions_today',
      'in_diagnosis',
      'in_repair',
      'awaiting_authorization',
      'ready_for_delivery',
    ]);
    expect(snapshot.activity.every((item) => new Date(item.occurredAt) <= NOW)).toBe(true);
  });

  it('rechaza con AbortError si se cancela', async () => {
    const controller = new AbortController();
    const pending = createMockDashboardDataSource({ delayMs: 10_000 }).load(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('formatRelativeTime', () => {
  const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

  it('usa minutos, horas y luego fecha', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe('ahora');
    expect(formatRelativeTime(ago(6), NOW)).toBe('hace 6 min');
    expect(formatRelativeTime(ago(140), NOW)).toBe('hace 2 h');
    expect(formatRelativeTime(ago(3000), NOW)).not.toMatch(/^hace/);
  });

  it('devuelve vacío ante una fecha inválida', () => {
    expect(formatRelativeTime('no-es-fecha', NOW)).toBe('');
  });
});
