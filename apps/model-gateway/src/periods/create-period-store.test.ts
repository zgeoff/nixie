import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import type { RouteLimits } from '../types';
import { createPeriodStore } from './create-period-store';

async function setupTest(startAt: string) {
  const limits: Record<string, RouteLimits> = {
    plan: { day: 40, month: 600, dayCap: 80 },
    metered: { day: 5, month: 50, dayCap: 10 },
  };

  const emptyDay = {
    start: '2026-11-13',
    resetsAt: '2026-11-14T00:00:00.000Z',
    micros: 0,
    raise: null,
    trippedAt: null,
  };

  const emptyMonth = {
    start: '2026-11-01',
    resetsAt: '2026-12-01T00:00:00.000Z',
    micros: 0,
    raise: null,
    trippedAt: null,
  };

  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-periods-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const path = join(directory, 'counter.json');
  let current = Date.parse(startAt);
  const log = mock<Logger>(() => {});

  const start = (held: Record<string, RouteLimits>) =>
    createPeriodStore({
      path,
      zone: 'Europe/London',
      limits: held,
      now: () => current,
      readOverrides: () => Promise.resolve({}),
      log,
    });

  return {
    path,
    log,
    start,
    store: await start(limits),
    limits,
    emptyDay,
    emptyMonth,
    moveTo: (instant: string) => {
      current = Date.parse(instant);
    },
    readFile: (): Promise<unknown> => Bun.file(path).json(),
  };
}

test('it starts a store with every route at zero in the day and month in force', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');
  const stored = await ctx.store.read();

  expect(stored).toStrictEqual({
    version: 3,
    lost: false,
    routes: {
      plan: { day: ctx.emptyDay, month: ctx.emptyMonth },
      metered: { day: ctx.emptyDay, month: ctx.emptyMonth },
    },
    sandboxes: {},
  });
});

test('it rewrites a limits count file with every route at zero and logs the old totals', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await writeFile(ctx.path, '{"dollars":1,"tokens":2,"lost":true}');

  await ctx.start(ctx.limits);

  expect([await ctx.readFile(), ctx.log.mock.calls.at(-1)]).toStrictEqual([
    {
      version: 3,
      lost: true,
      routes: {
        plan: { day: ctx.emptyDay, month: ctx.emptyMonth },
        metered: { day: ctx.emptyDay, month: ctx.emptyMonth },
      },
      sandboxes: {},
    },
    ['store.moved', { dollars: 1, tokens: 2, lost: true }, 'warn'],
  ]);
});

test('it gives every route the whole count of a version 2 store, keeps its sandboxes and logs the old totals', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  const count = { dollars: 7, tokens: 70 };

  await writeFile(
    ctx.path,
    JSON.stringify({
      version: 2,
      periods: {
        day: { start: '2026-11-13', ...count, limit: null, raise: null, trippedAt: null },
        month: {
          start: '2026-11-01',
          dollars: 9,
          tokens: 90,
          limit: null,
          raise: null,
          trippedAt: null,
        },
      },
      sandboxes: { alpha: { dollars: 1, tokens: 2, limit: null } },
    }),
  );

  await ctx.start(ctx.limits);

  expect([await ctx.readFile(), ctx.log.mock.calls.at(-1)]).toStrictEqual([
    {
      version: 3,
      routes: {
        plan: {
          day: { ...ctx.emptyDay, micros: 7_000_000 },
          month: { ...ctx.emptyMonth, micros: 9_000_000 },
        },
        metered: {
          day: { ...ctx.emptyDay, micros: 7_000_000 },
          month: { ...ctx.emptyMonth, micros: 9_000_000 },
        },
      },
      sandboxes: { alpha: { micros: 1_000_000, tokens: 2, limit: null, lastRefusal: null } },
    },
    [
      'store.moved',
      { dayDollars: 7, dayTokens: 70, monthDollars: 9, monthTokens: 90, lost: false },
      'warn',
    ],
  ]);
});

test('it carries a version 2 store into the one route of a single-route gateway, so a restart keeps its counts', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await writeFile(
    ctx.path,
    JSON.stringify({
      version: 2,
      periods: {
        day: {
          start: '2026-11-13',
          dollars: 40,
          tokens: 70,
          limit: null,
          raise: { dollars: 45, tokens: 80 },
          trippedAt: '2026-11-13T09:00:00.000Z',
        },
        month: {
          start: '2026-10-01',
          dollars: 500,
          tokens: 90,
          limit: null,
          raise: null,
          trippedAt: null,
        },
      },
      sandboxes: {},
    }),
  );

  await ctx.start({ plan: { day: 40, month: 600, dayCap: 80 } });

  const stored = await ctx.readFile();

  expect(stored).toStrictEqual({
    version: 3,
    routes: {
      plan: {
        day: {
          ...ctx.emptyDay,
          micros: 40_000_000,
          raise: 45,
          trippedAt: '2026-11-13T09:00:00.000Z',
        },
        month: ctx.emptyMonth,
      },
    },
    sandboxes: {},
  });
});

test('it adds up replies that each cost less than half a micro', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend('plan', null, { dollars: 1e-7, tokens: 1 });
  await ctx.store.addSpend('plan', null, { dollars: 1e-7, tokens: 1 });

  const stored = await ctx.store.read();

  expect(stored.routes['plan']?.day.micros).toBe(2);
});

test('it adds a spend to the route it names and to no other', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend('plan', null, { dollars: 3, tokens: 30 });

  const stored = await ctx.store.read();

  expect([
    stored.routes['plan']?.day.micros,
    stored.routes['plan']?.month.micros,
    stored.routes['metered']?.day.micros,
  ]).toStrictEqual([3_000_000, 3_000_000, 0]);
});

test('it adds one micro to a count of 8.6 billion dollars as exactly one micro', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.change((held) => {
    const plan = held.routes['plan'];

    return {
      store:
        plan === undefined
          ? null
          : {
              ...held,
              routes: {
                ...held.routes,
                plan: { ...plan, day: { ...plan.day, micros: 8_600_000_000_000_000 } },
              },
            },
      result: undefined,
    };
  });

  await ctx.store.addSpend('plan', null, { dollars: 1e-6, tokens: 1 });

  const stored = await ctx.store.read();

  expect(stored.routes['plan']?.day.micros).toBe(8_600_000_000_000_001);
});

test('it stamps the instant a route first reaches its day limit, and only that route', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend('metered', null, { dollars: 5, tokens: 1 });

  ctx.moveTo('2026-11-13T11:00:00Z');

  const stored = await ctx.store.read();

  expect([
    stored.routes['metered']?.day.trippedAt,
    stored.routes['plan']?.day.trippedAt,
  ]).toStrictEqual(['2026-11-13T10:00:00.000Z', null]);
});

test('it resets every route at midnight in the zone and clears the stamp', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend('metered', null, { dollars: 5, tokens: 1 });

  ctx.moveTo('2026-11-14T00:00:01Z');

  const stored = await ctx.store.read();

  expect(stored.routes['metered']?.day).toStrictEqual({
    ...ctx.emptyDay,
    start: '2026-11-14',
    resetsAt: '2026-11-15T00:00:00.000Z',
  });
});

test('it starts a route that the config gained at zero', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend('plan', null, { dollars: 3, tokens: 30 });

  const wider = await ctx.start({ ...ctx.limits, extra: { day: 1, month: 2, dayCap: 2 } });
  const stored = await wider.read();

  expect([stored.routes['plan']?.day.micros, stored.routes['extra']?.day]).toStrictEqual([
    3_000_000,
    ctx.emptyDay,
  ]);
});

test('it keeps the last refusal on a sandbox the store holds, and on no other', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.change((held) => ({
    store: {
      ...held,
      sandboxes: { alpha: { micros: 0, tokens: 0, limit: null, lastRefusal: null } },
    },
    result: undefined,
  }));

  await ctx.store.writeRefusal('alpha', { counter: 'route_day', route: 'plan', atMs: 5 });
  await ctx.store.writeRefusal('ghost', { counter: 'route_day', route: 'plan', atMs: 6 });

  const stored = await ctx.store.read();

  expect(Object.keys(stored.sandboxes)).toStrictEqual(['alpha']);

  expect(stored.sandboxes['alpha']?.lastRefusal).toStrictEqual({
    counter: 'route_day',
    route: 'plan',
    atMs: 5,
  });
});

test('it marks the count as lost', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.markLost();

  const stored = await ctx.store.read();

  expect(stored.lost).toBe(true);
});
