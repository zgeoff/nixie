import { expect, test } from 'bun:test';
import type { Overrides, PeriodStore } from '../types';
import { pickPeriodsRefusal } from './pick-periods-refusal';

interface StoreParts {
  readonly lost?: boolean;
  readonly plan?: { readonly day?: number; readonly month?: number; readonly raise?: number };
  readonly metered?: { readonly day?: number };
  readonly sandboxes?: PeriodStore['sandboxes'];
}

function setupTest() {
  const limits = {
    plan: { day: 40, month: 600, dayCap: 80 },
    metered: { day: 5, month: 50, dayCap: 10 },
    bare: null,
  };

  const resetsAt = '2026-12-01T00:00:00.000Z';

  const count = (start: string, dollars: number, raise: number | null) => ({
    start,
    resetsAt,
    micros: Math.round(dollars * 1_000_000),
    raise,
    trippedAt: null,
  });

  const buildStore = (parts: StoreParts): PeriodStore => ({
    version: 3,
    lost: parts.lost ?? false,
    routes: {
      plan: {
        day: count('2026-11-13', parts.plan?.day ?? 0, parts.plan?.raise ?? null),
        month: count('2026-11-01', parts.plan?.month ?? 0, null),
      },
      metered: {
        day: count('2026-11-13', parts.metered?.day ?? 0, null),
        month: count('2026-11-01', 0, null),
      },
      bare: { day: count('2026-11-13', 0, null), month: count('2026-11-01', 0, null) },
    },
    sandboxes: parts.sandboxes ?? {},
  });

  const ask = (
    store: PeriodStore,
    route: string,
    sandbox: string | null = null,
    overrides: Overrides = {},
  ) =>
    pickPeriodsRefusal({
      store,
      limits,
      overrides,
      route,
      sandbox,
      countBySandbox: false,
    });

  return { buildStore, ask, limits };
}

test('it lets a request through while the route is under its limits', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({ plan: { day: 39.99 } }), 'plan')).toBeNull();
});

test('it refuses the route at its day limit and names the counter and the route', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({ plan: { day: 40 } }), 'plan')).toMatchObject({
    status: 403,
    type: 'limit_reached',
    counter: 'route_day',
    route: 'plan',
  });
});

test('it goes on with another route while one route is at its day limit', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({ plan: { day: 40 } }), 'metered')).toBeNull();
});

test('it refuses the route at its month limit', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({ plan: { month: 600 } }), 'plan')).toMatchObject({
    counter: 'route_month',
    route: 'plan',
  });
});

test('it lets the day go on under a raise, and under an override for the day', () => {
  const ctx = setupTest();
  const store = ctx.buildStore({ plan: { day: 45, raise: 60 } });

  expect([
    ctx.ask(store, 'plan'),
    ctx.ask(ctx.buildStore({ plan: { day: 90 } }), 'plan', null, {
      plan: { start: '2026-11-13', dollars: 100 },
    }),
  ]).toStrictEqual([null, null]);
});

test('it ignores an override for another day', () => {
  const ctx = setupTest();

  expect(
    ctx.ask(ctx.buildStore({ plan: { day: 45 } }), 'plan', null, {
      plan: { start: '2026-11-12', dollars: 100 },
    }),
  ).toMatchObject({ counter: 'route_day' });
});

test('it refuses with a 503 for a route with no limit', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({}), 'bare')).toMatchObject({ status: 503, type: 'api_error' });
});

test('it refuses with a 503 while the lost mark stands', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({ lost: true }), 'plan')).toMatchObject({ status: 503 });
});

test('it refuses a sandbox past its own limit, on the route it asked for', () => {
  const ctx = setupTest();

  const store = ctx.buildStore({
    sandboxes: {
      alpha: {
        micros: 2_000_000,
        tokens: 0,
        limit: { dollars: 2, tokens: 100 },
        lastRefusal: null,
      },
    },
  });

  expect(ctx.ask(store, 'metered', 'alpha')).toMatchObject({
    status: 403,
    type: 'limit_reached',
    counter: 'sandbox',
    route: 'metered',
  });
});

test('it refuses a sandbox the store lacks when it counts by sandbox', () => {
  const ctx = setupTest();

  const refusal = pickPeriodsRefusal({
    store: ctx.buildStore({}),
    limits: ctx.limits,
    overrides: {},
    route: 'plan',
    sandbox: 'ghost',
    countBySandbox: true,
  });

  expect(refusal).toMatchObject({ status: 403, type: 'permission_error' });
});

test('it names no dollar figure in a limit message', () => {
  const ctx = setupTest();
  const refusal = ctx.ask(ctx.buildStore({ plan: { day: 40.1234 } }), 'plan');

  expect(refusal?.message).not.toMatch(/\$|\d/u);
});

test('it refuses a route whose floating-point sum falls a hair under its day limit', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({ plan: { day: 40 - 1e-9 } }), 'plan')).toMatchObject({
    status: 403,
    type: 'limit_reached',
    counter: 'route_day',
    route: 'plan',
  });
});
