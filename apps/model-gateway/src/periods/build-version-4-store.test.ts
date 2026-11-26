import { expect, test } from 'bun:test';
import { buildMockLimitTable } from '../test-utils/build-mock-limit-table';
import { buildVersion4Store } from './build-version-4-store';
import type { Version3Store } from './types';

function setupTest() {
  const spent = {
    day: {
      start: '2026-11-13',
      resetsAt: '2026-11-14T00:00:00.000Z',
      micros: 7_000_000,
      raise: null,
      trippedAt: null,
    },
    month: {
      start: '2026-11-01',
      resetsAt: '2026-12-01T00:00:00.000Z',
      micros: 9_000_000,
      raise: null,
      trippedAt: null,
    },
  };

  return {
    spent,
    emptyProvider: {
      day: { ...spent.day, micros: 0 },
      month: { ...spent.month, micros: 0 },
    },
    table: buildMockLimitTable({ plan: null }),
    nowMs: Date.parse('2026-11-13T10:00:00Z'),
  };
}

test('#buildVersion4Store starts each provider at zero and keeps the route counts', () => {
  const ctx = setupTest();
  const earlier: Version3Store = { version: 3, routes: { plan: ctx.spent }, sandboxes: {} };
  const store = buildVersion4Store(earlier, ctx.nowMs, 'Europe/London', ctx.table);

  expect(store).toStrictEqual({
    version: 4,
    lost: false,
    providers: { test: ctx.emptyProvider },
    routes: { plan: ctx.spent },
    sandboxes: {},
  });
});

test('#buildVersion4Store names the provider in a refusal and drops the refusal of a route the config lacks', () => {
  const ctx = setupTest();

  const earlier: Version3Store = {
    version: 3,
    lost: true,
    routes: { plan: ctx.spent },
    sandboxes: {
      alpha: {
        micros: 0,
        tokens: 0,
        limit: null,
        lastRefusal: { counter: 'route_day', route: 'plan', atMs: 3 },
        limitRevision: 2,
      },
      beta: {
        micros: 0,
        tokens: 0,
        limit: null,
        lastRefusal: { counter: 'route_month', route: 'retired', atMs: 4 },
        limitRevision: 1,
      },
    },
    lastLimitRevision: 9,
  };

  const store = buildVersion4Store(earlier, ctx.nowMs, 'Europe/London', ctx.table);

  expect([store.lost, store.lastLimitRevision, store.sandboxes]).toStrictEqual([
    true,
    9,
    {
      alpha: {
        micros: 0,
        tokens: 0,
        limit: null,
        lastRefusal: { counter: 'route_day', route: 'plan', provider: 'test', atMs: 3 },
        limitRevision: 2,
      },
      beta: { micros: 0, tokens: 0, limit: null, lastRefusal: null, limitRevision: 1 },
    },
  ]);
});
