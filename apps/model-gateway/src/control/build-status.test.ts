import { expect, test } from 'bun:test';
import type { LimitTable } from '../periods/limit-table';
import type { PeriodStore, PeriodsConfig } from '../types';
import { buildStatus } from './build-status';

function setupTest() {
  const endsDay = '2026-11-25T00:00:00.000Z';

  const count = (start: string, resetsAt: string, micros: number, trippedAt: string | null) => ({
    start,
    resetsAt: start === '2026-11-24' ? endsDay : resetsAt,
    micros,
    raise: null,
    trippedAt,
  });

  const store: PeriodStore = {
    version: 4,
    lost: false,
    providers: {
      main: {
        day: count('2026-11-24', '2026-11-25T00:00:00.000Z', 41_000_000, null),
        month: count('2026-11-01', '2026-12-01T00:00:00.000Z', 212_500_000, null),
      },
    },
    routes: {
      plan: {
        day: count(
          '2026-11-24',
          '2026-11-25T00:00:00.000Z',
          40_000_000,
          '2026-11-24T09:30:00.000Z',
        ),
        month: count('2026-11-01', '2026-12-01T00:00:00.000Z', 211_500_000, null),
      },
      metered: {
        day: count('2026-11-24', '2026-11-25T00:00:00.000Z', 1_000_000, null),
        month: count('2026-11-01', '2026-12-01T00:00:00.000Z', 1_000_000, null),
      },
      bare: {
        day: count('2026-11-24', '2026-11-25T00:00:00.000Z', 3_000_000, null),
        month: count('2026-11-01', '2026-12-01T00:00:00.000Z', 3_000_000, null),
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

  const limits: LimitTable = {
    routes: {
      plan: { day: 40, month: 600, dayCap: 80 },
      metered: { day: 5, month: 50, dayCap: 10 },
      bare: null,
    },
    providers: { main: { day: 100, month: 1000, dayCap: 200 } },
    providerOf: { plan: 'main', metered: 'main', bare: 'main' },
  };

  return { status: buildStatus(store, limits, { routes: {}, providers: {} }, config) };
}

test('#buildStatus nests the count, the limit and the trip of each route', () => {
  const ctx = setupTest();

  expect(ctx.status.routes['plan']).toStrictEqual({
    provider: 'main',
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

test('#buildStatus leaves out a route and a provider that the store still counts but the config no longer names', () => {
  const day = {
    start: '2026-11-24',
    resetsAt: '2026-11-25T00:00:00.000Z',
    micros: 2_000_000,
    raise: null,
    trippedAt: null,
  };

  const month = {
    start: '2026-11-01',
    resetsAt: '2026-12-01T00:00:00.000Z',
    micros: 9_000_000,
    raise: null,
    trippedAt: null,
  };

  const store: PeriodStore = {
    version: 4,
    lost: false,
    providers: { main: { day, month }, retired: { day, month } },
    routes: { plan: { day, month }, retired: { day, month } },
    sandboxes: {},
  };

  const config: PeriodsConfig = {
    zone: 'UTC',
    control: { listen: { hostname: '127.0.0.1', port: 1 }, tokenFile: '/token' },
    countBySandbox: false,
    override: null,
  };

  const status = buildStatus(
    store,
    {
      routes: { plan: { day: 40, month: 600, dayCap: 80 } },
      providers: { main: { day: 100, month: 1000, dayCap: 200 } },
      providerOf: { plan: 'main' },
    },
    { routes: {}, providers: {} },
    config,
  );

  expect([Object.keys(status.routes), Object.keys(status.providers)]).toStrictEqual([
    ['plan'],
    ['main'],
  ]);
});

test('#buildStatus nests the count, the limit and the trip of each provider', () => {
  const ctx = setupTest();

  expect(ctx.status.providers['main']).toStrictEqual({
    day: {
      start: '2026-11-24',
      resetsAt: '2026-11-25T00:00:00Z',
      dollars: 41,
      limit: 100,
      cap: 200,
      tripped: false,
      sinceMs: null,
    },
    month: {
      start: '2026-11-01',
      resetsAt: '2026-12-01T00:00:00Z',
      dollars: 212.5,
      limit: 1000,
      cap: null,
      tripped: false,
      sinceMs: null,
    },
  });
});

test('#buildStatus shows a route with no limit of its own with a null limit and cap, never tripped', () => {
  const ctx = setupTest();

  expect(ctx.status.routes['bare']?.day).toStrictEqual({
    start: '2026-11-24',
    resetsAt: '2026-11-25T00:00:00Z',
    dollars: 3,
    limit: null,
    cap: null,
    tripped: false,
    sinceMs: null,
  });
});
