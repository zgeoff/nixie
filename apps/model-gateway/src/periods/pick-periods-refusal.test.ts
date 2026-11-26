import { expect, test } from 'bun:test';
import type { Overrides, PeriodStore } from '../types';
import type { LimitTable } from './limit-table';
import { pickPeriodsRefusal } from './pick-periods-refusal';

interface Spend {
  readonly day?: number;
  readonly month?: number;
  readonly raise?: number;
}

interface StoreParts {
  readonly lost?: boolean;
  readonly plan?: Spend;
  readonly metered?: Spend;
  readonly bare?: Spend;
  readonly main?: Spend;
  readonly side?: Spend;
  readonly sandboxes?: PeriodStore['sandboxes'];
}

function setupTest() {
  const limits: LimitTable = {
    routes: {
      plan: { day: 40, month: 600, dayCap: 80 },
      metered: { day: 5, month: 50, dayCap: 10 },
      bare: null,
    },
    providers: {
      main: { day: 100, month: 1000, dayCap: 200 },
      side: { day: 3, month: 30, dayCap: 6 },
    },
    providerOf: { plan: 'main', metered: 'main', bare: 'side' },
  };

  const resetsAt = '2026-12-01T00:00:00.000Z';

  const count = (start: string, dollars: number, raise: number | null) => ({
    start,
    resetsAt,
    micros: Math.round(dollars * 1_000_000),
    raise,
    trippedAt: null,
  });

  const periods = (spend: Spend | undefined) => ({
    day: count('2026-11-13', spend?.day ?? 0, spend?.raise ?? null),
    month: count('2026-11-01', spend?.month ?? 0, null),
  });

  const buildStore = (parts: StoreParts): PeriodStore => ({
    version: 4,
    lost: parts.lost ?? false,
    providers: { main: periods(parts.main), side: periods(parts.side) },
    routes: {
      plan: periods(parts.plan),
      metered: periods(parts.metered),
      bare: periods(parts.bare),
    },
    sandboxes: parts.sandboxes ?? {},
  });

  const ask = (
    store: PeriodStore,
    route: string,
    sandbox: string | null = null,
    overrides: Partial<Overrides> = {},
  ) =>
    pickPeriodsRefusal({
      store,
      limits,
      overrides: { routes: {}, providers: {}, ...overrides },
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
    provider: 'main',
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
      routes: { plan: { start: '2026-11-13', dollars: 100 } },
    }),
  ]).toStrictEqual([null, null]);
});

test('it ignores an override for another day', () => {
  const ctx = setupTest();

  expect(
    ctx.ask(ctx.buildStore({ plan: { day: 45 } }), 'plan', null, {
      routes: { plan: { start: '2026-11-12', dollars: 100 } },
    }),
  ).toMatchObject({ counter: 'route_day' });
});

test('it refuses a route that has room when its provider is at its day limit', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({ main: { day: 100 }, plan: { day: 1 } }), 'plan')).toMatchObject({
    status: 403,
    type: 'limit_reached',
    counter: 'provider_day',
    route: 'plan',
    provider: 'main',
  });
});

test('it refuses a route at its provider month limit', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({ main: { month: 1000 } }), 'metered')).toMatchObject({
    counter: 'provider_month',
    provider: 'main',
  });
});

test('it holds a route with no limits of its own by its provider alone', () => {
  const ctx = setupTest();

  expect([
    ctx.ask(ctx.buildStore({ bare: { day: 500 } }), 'bare'),
    ctx.ask(ctx.buildStore({ side: { day: 3 } }), 'bare'),
  ]).toStrictEqual([null, expect.objectContaining({ counter: 'provider_day', provider: 'side' })]);
});

test('it goes on with a route of another provider while one provider is at its limit', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({ side: { day: 3 } }), 'plan')).toBeNull();
});

test('it names the route when the route and its provider are both at a limit', () => {
  const ctx = setupTest();

  expect(ctx.ask(ctx.buildStore({ plan: { day: 40 }, main: { day: 100 } }), 'plan')).toMatchObject({
    counter: 'route_day',
  });
});

test('it names the provider before the sandbox when both are at a limit', () => {
  const ctx = setupTest();

  const store = ctx.buildStore({
    main: { day: 100 },
    sandboxes: {
      alpha: {
        micros: 2_000_000,
        tokens: 0,
        limit: { dollars: 2 },
        lastRefusal: null,
        limitRevision: 1,
      },
    },
  });

  expect(ctx.ask(store, 'plan', 'alpha')).toMatchObject({ counter: 'provider_day' });
});

test('it lets the provider day go on under a raise, and under an override for the day', () => {
  const ctx = setupTest();

  expect([
    ctx.ask(ctx.buildStore({ main: { day: 150, raise: 160 } }), 'plan'),
    ctx.ask(ctx.buildStore({ main: { day: 150 } }), 'plan', null, {
      providers: { main: { start: '2026-11-13', dollars: 300 } },
    }),
  ]).toStrictEqual([null, null]);
});

test('it takes a route override for a route and never for a provider of the same ID', () => {
  const ctx = setupTest();

  expect(
    ctx.ask(ctx.buildStore({ main: { day: 100 } }), 'plan', null, {
      routes: { main: { start: '2026-11-13', dollars: 300 } },
    }),
  ).toMatchObject({ counter: 'provider_day' });
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
        limitRevision: 1,
      },
    },
  });

  expect(ctx.ask(store, 'metered', 'alpha')).toMatchObject({
    status: 403,
    type: 'limit_reached',
    counter: 'sandbox',
    route: 'metered',
    provider: 'main',
  });
});

test('it refuses a sandbox the store lacks when it counts by sandbox', () => {
  const ctx = setupTest();

  const refusal = pickPeriodsRefusal({
    store: ctx.buildStore({}),
    limits: ctx.limits,
    overrides: { routes: {}, providers: {} },
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
