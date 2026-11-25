import { expect, test } from 'bun:test';
import type { PeriodStore, PeriodsConfig } from '../types';
import { buildStatus } from './build-status';

function setupTest() {
  const endsDay = '2026-11-25T00:00:00.000Z';

  const count = (start: string, resetsAt: string, dollars: number, trippedAt: string | null) => ({
    start,
    resetsAt: start === '2026-11-24' ? endsDay : resetsAt,
    dollars,
    raise: null,
    trippedAt,
  });

  const store: PeriodStore = {
    version: 3,
    lost: false,
    routes: {
      plan: {
        day: count('2026-11-24', '2026-11-25T00:00:00.000Z', 40, '2026-11-24T09:30:00.000Z'),
        month: count('2026-11-01', '2026-12-01T00:00:00.000Z', 211.5, null),
      },
      metered: {
        day: count('2026-11-24', '2026-11-25T00:00:00.000Z', 1, null),
        month: count('2026-11-01', '2026-12-01T00:00:00.000Z', 1, null),
      },
    },
    sandboxes: {},
  };

  const config: PeriodsConfig = {
    zone: 'Europe/London',
    control: { listen: { hostname: '127.0.0.1', port: 1 }, tokenFile: '/token' },
    countBySandbox: false,
    override: null,
  };

  const limits = {
    plan: { day: 40, month: 600, dayCap: 80 },
    metered: { day: 5, month: 50, dayCap: 10 },
  };

  return { status: buildStatus(store, limits, {}, config) };
}

test('#buildStatus nests the count, the limit and the trip of each route', () => {
  const ctx = setupTest();

  expect(ctx.status.routes['plan']).toStrictEqual({
    day: {
      start: '2026-11-24',
      resetsAt: '2026-11-25T00:00:00Z',
      dollars: 40,
      limit: 40,
      cap: 80,
      tripped: true,
      sinceMs: Date.parse('2026-11-24T09:30:00Z'),
    },
    month: {
      start: '2026-11-01',
      resetsAt: '2026-12-01T00:00:00Z',
      dollars: 211.5,
      limit: 600,
      cap: null,
      tripped: false,
      sinceMs: null,
    },
  });
});

test('#buildStatus leaves a route under its limit untripped, and keeps the zone and the lost mark', () => {
  const ctx = setupTest();

  expect([
    ctx.status.routes['metered']?.day.tripped,
    ctx.status.zone,
    ctx.status.lost,
  ]).toStrictEqual([false, 'Europe/London', false]);
});
