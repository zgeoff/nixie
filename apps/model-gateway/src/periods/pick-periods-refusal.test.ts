import { expect, test } from 'bun:test';
import type { Measures, Override, PeriodStore } from '../types';
import { pickPeriodsRefusal } from './pick-periods-refusal';

interface StoreParts {
  readonly lost?: boolean;
  readonly day?: { spent?: Partial<Measures>; limit?: Measures | null; raise?: Measures | null };
  readonly month?: { spent?: Partial<Measures>; limit?: Measures | null };
  readonly sandboxes?: PeriodStore['sandboxes'];
}

function setupTest() {
  const fallback = { dollars: 60, tokens: 1000 };

  const buildStore = (parts: StoreParts): PeriodStore => ({
    version: 2,
    lost: parts.lost ?? false,
    periods: {
      day: {
        start: '2026-11-13',
        dollars: parts.day?.spent?.dollars ?? 0,
        tokens: parts.day?.spent?.tokens ?? 0,
        limit: parts.day?.limit === undefined ? fallback : parts.day.limit,
        raise: parts.day?.raise ?? null,
      },
      month: {
        start: '2026-11-01',
        dollars: parts.month?.spent?.dollars ?? 0,
        tokens: parts.month?.spent?.tokens ?? 0,
        limit:
          parts.month?.limit === undefined ? { dollars: 600, tokens: 10_000 } : parts.month.limit,
        raise: null,
      },
    },
    sandboxes: parts.sandboxes ?? {},
  });

  return { buildStore };
}

test('it lets a request through while every count is under its limit', () => {
  const ctx = setupTest();
  const store = ctx.buildStore({ sandboxes: { alpha: { dollars: 0, tokens: 0, limit: null } } });

  expect(pickPeriodsRefusal(store, null, 'alpha', true)).toBeNull();
});

test('it refuses with a 503 while the lost mark stands', () => {
  const ctx = setupTest();

  expect(pickPeriodsRefusal(ctx.buildStore({ lost: true }), null, null, false)).toMatchObject({
    status: 503,
  });
});

test('it refuses with a 503 while the day has no limit', () => {
  const ctx = setupTest();

  expect(
    pickPeriodsRefusal(ctx.buildStore({ day: { limit: null } }), null, null, false),
  ).toMatchObject({
    status: 503,
  });
});

test('it refuses with a 503 while the month has no limit', () => {
  const ctx = setupTest();

  expect(
    pickPeriodsRefusal(ctx.buildStore({ month: { limit: null } }), null, null, false),
  ).toMatchObject({ status: 503 });
});

test('it refuses a 503 for a null limit even when an override names the period', () => {
  const ctx = setupTest();

  const override: Override = {
    period: 'day',
    start: '2026-11-13',
    limit: { dollars: 500, tokens: 500_000 },
  };

  expect(
    pickPeriodsRefusal(ctx.buildStore({ day: { limit: null } }), override, null, false),
  ).toMatchObject({ status: 503 });
});

test.each([
  ['the day dollars', { day: { spent: { dollars: 60 } } }],
  ['the day tokens', { day: { spent: { tokens: 1000 } } }],
  ['the month dollars', { month: { spent: { dollars: 600 } } }],
  ['the month tokens', { month: { spent: { tokens: 10_000 } } }],
] as const)('it refuses with the limit 403 once %s reach their limit', (_name, parts) => {
  const ctx = setupTest();

  expect(pickPeriodsRefusal(ctx.buildStore(parts), null, null, false)).toMatchObject({
    status: 403,
    type: 'permission_error',
  });
});

test('it lets a request through while the count is one under the limit', () => {
  const ctx = setupTest();
  const store = ctx.buildStore({ day: { spent: { dollars: 59.99, tokens: 999 } } });

  expect(pickPeriodsRefusal(store, null, null, false)).toBeNull();
});

test('it lets a request through once a raise lifts the day above its count', () => {
  const ctx = setupTest();

  const store = ctx.buildStore({
    day: { spent: { dollars: 61 }, raise: { dollars: 90, tokens: 2000 } },
  });

  expect(pickPeriodsRefusal(store, null, null, false)).toBeNull();
});

test('it refuses at the raise once the count reaches it', () => {
  const ctx = setupTest();

  const store = ctx.buildStore({
    day: { spent: { dollars: 90 }, raise: { dollars: 90, tokens: 2000 } },
  });

  expect(pickPeriodsRefusal(store, null, null, false)).toMatchObject({ status: 403 });
});

test('it takes the base limit when a raise is lower than it', () => {
  const ctx = setupTest();

  const store = ctx.buildStore({
    day: { spent: { dollars: 70 }, raise: { dollars: 50, tokens: 500 } },
  });

  expect(pickPeriodsRefusal(store, null, null, false)).toMatchObject({ status: 403 });
});

test('it lets a request through when an override for the day in force lifts the limit past the cap', () => {
  const ctx = setupTest();
  const store = ctx.buildStore({ day: { spent: { dollars: 130, tokens: 5000 } } });

  const override: Override = {
    period: 'day',
    start: '2026-11-13',
    limit: { dollars: 200, tokens: 250_000 },
  };

  expect(pickPeriodsRefusal(store, override, null, false)).toBeNull();
});

test('it ignores an override for a day that has ended', () => {
  const ctx = setupTest();
  const store = ctx.buildStore({ day: { spent: { dollars: 61 } } });

  const override: Override = {
    period: 'day',
    start: '2026-11-12',
    limit: { dollars: 200, tokens: 250_000 },
  };

  expect(pickPeriodsRefusal(store, override, null, false)).toMatchObject({ status: 403 });
});

test('it ignores an override for the month when the day is the one at its limit', () => {
  const ctx = setupTest();
  const store = ctx.buildStore({ day: { spent: { dollars: 61 } } });

  const override: Override = {
    period: 'month',
    start: '2026-11-01',
    limit: { dollars: 2000, tokens: 2_000_000 },
  };

  expect(pickPeriodsRefusal(store, override, null, false)).toMatchObject({ status: 403 });
});

test('it refuses with a 403 a sandbox the store lacks when it counts by sandbox', () => {
  const ctx = setupTest();

  expect(pickPeriodsRefusal(ctx.buildStore({}), null, 'ghost', true)).toMatchObject({
    status: 403,
  });
});

test('it refuses a sandbox that names an object property when the store lacks it', () => {
  const ctx = setupTest();

  expect(pickPeriodsRefusal(ctx.buildStore({}), null, 'constructor', true)).toMatchObject({
    status: 403,
  });
});

test('it lets any sandbox through when it counts by sandbox with none', () => {
  const ctx = setupTest();

  expect(pickPeriodsRefusal(ctx.buildStore({}), null, null, false)).toBeNull();
});

test('it refuses with the limit 403 a sandbox past its own limit', () => {
  const ctx = setupTest();

  const store = ctx.buildStore({
    sandboxes: { alpha: { dollars: 2, tokens: 5, limit: { dollars: 2, tokens: 2000 } } },
  });

  expect(pickPeriodsRefusal(store, null, 'alpha', true)).toMatchObject({
    status: 403,
    type: 'permission_error',
  });
});

test('it lets a sandbox with no limit of its own count past any amount below the period limits', () => {
  const ctx = setupTest();

  const store = ctx.buildStore({
    sandboxes: { alpha: { dollars: 50, tokens: 900, limit: null } },
  });

  expect(pickPeriodsRefusal(store, null, 'alpha', true)).toBeNull();
});
