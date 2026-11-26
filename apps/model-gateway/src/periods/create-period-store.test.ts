import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { createPeriodStore } from './create-period-store';
import type { LimitTable } from './limit-table';

async function setupTest(startAt: string) {
  const limits: LimitTable = {
    routes: {
      plan: { day: 40, month: 600, dayCap: 80 },
      metered: { day: 5, month: 50, dayCap: 10 },
    },
    providers: { main: { day: 100, month: 1000, dayCap: 200 } },
    providerOf: { plan: 'main', metered: 'main' },
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

  const start = (held: LimitTable) =>
    createPeriodStore({
      path,
      zone: 'Europe/London',
      limits: held,
      now: () => current,
      readOverrides: () => Promise.resolve({ routes: {}, providers: {} }),
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
    plan: { route: 'plan', provider: 'main' },
    metered: { route: 'metered', provider: 'main' },
    moveTo: (instant: string) => {
      current = Date.parse(instant);
    },
    readFile: (): Promise<unknown> => Bun.file(path).json(),
    readMoves: () => log.mock.calls.filter(([event]) => event === 'store.moved'),
  };
}

test('it starts a store with every route at zero in the day and month in force', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');
  const stored = await ctx.store.read();

  expect(stored).toStrictEqual({
    version: 4,
    lost: false,
    providers: { main: { day: ctx.emptyDay, month: ctx.emptyMonth } },
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

  expect([await ctx.readFile(), ctx.readMoves()]).toStrictEqual([
    {
      version: 4,
      lost: true,
      providers: { main: { day: ctx.emptyDay, month: ctx.emptyMonth } },
      routes: {
        plan: { day: ctx.emptyDay, month: ctx.emptyMonth },
        metered: { day: ctx.emptyDay, month: ctx.emptyMonth },
      },
      sandboxes: {},
    },
    [
      ['store.moved', { dollars: 1, tokens: 2, lost: true }, 'warn'],
      ['store.moved', { version: 3, lost: true }, 'warn'],
    ],
  ]);
});

test('it gives every route the whole count of a version 2 store, starts each provider at zero, keeps its sandboxes and logs the old totals', async () => {
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

  expect([await ctx.readFile(), ctx.readMoves()]).toStrictEqual([
    {
      version: 4,
      providers: { main: { day: ctx.emptyDay, month: ctx.emptyMonth } },
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
      sandboxes: {
        alpha: { micros: 1_000_000, tokens: 2, limit: null, lastRefusal: null, limitRevision: 0 },
      },
    },
    [
      [
        'store.moved',
        { dayDollars: 7, dayTokens: 70, monthDollars: 9, monthTokens: 90, lost: false },
        'warn',
      ],
      ['store.moved', { version: 3, lost: false }, 'warn'],
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

  await ctx.start({
    routes: { plan: { day: 40, month: 600, dayCap: 80 } },
    providers: { main: { day: 100, month: 1000, dayCap: 200 } },
    providerOf: { plan: 'main' },
  });

  const stored = await ctx.readFile();

  expect(stored).toStrictEqual({
    version: 4,
    providers: { main: { day: ctx.emptyDay, month: ctx.emptyMonth } },
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

test('it gives a route no count from a version 2 period that ended before the current one', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await writeFile(
    ctx.path,
    JSON.stringify({
      version: 2,
      periods: {
        day: {
          start: '2026-11-12',
          dollars: 40,
          tokens: 70,
          limit: null,
          raise: null,
          trippedAt: null,
        },
        month: {
          start: '2026-11-01',
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

  await ctx.start(ctx.limits);

  const counted = { day: ctx.emptyDay, month: { ...ctx.emptyMonth, micros: 500_000_000 } };

  expect([await ctx.readFile(), ctx.readMoves().map(([, fields]) => fields)]).toStrictEqual([
    {
      version: 4,
      providers: { main: { day: ctx.emptyDay, month: ctx.emptyMonth } },
      routes: { plan: counted, metered: counted },
      sandboxes: {},
    },
    [
      { dayDollars: 40, dayTokens: 70, monthDollars: 500, monthTokens: 90, lost: false },
      { version: 3, lost: false },
    ],
  ]);
});

test('it adds up replies that each cost less than half a micro', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend(ctx.plan, null, { dollars: 1e-7, tokens: 1 });
  await ctx.store.addSpend(ctx.plan, null, { dollars: 1e-7, tokens: 1 });

  const stored = await ctx.store.read();

  expect(stored.routes['plan']?.day.micros).toBe(2);
});

test('it adds a spend to the route it names and to no other', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend(ctx.plan, null, { dollars: 3, tokens: 30 });

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

  await ctx.store.addSpend(ctx.plan, null, { dollars: 1e-6, tokens: 1 });

  const stored = await ctx.store.read();

  expect(stored.routes['plan']?.day.micros).toBe(8_600_000_000_000_001);
});

test('it adds a spend to the provider of the route as well, and to no other provider', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  const wider = await ctx.start({
    ...ctx.limits,
    providers: { ...ctx.limits.providers, side: { day: 1, month: 2, dayCap: 2 } },
  });

  await wider.addSpend(ctx.plan, null, { dollars: 3, tokens: 30 });
  await wider.addSpend(ctx.metered, null, { dollars: 2, tokens: 20 });

  const stored = await wider.read();

  expect([
    stored.providers['main']?.day.micros,
    stored.providers['main']?.month.micros,
    stored.providers['side']?.day.micros,
  ]).toStrictEqual([5_000_000, 5_000_000, 0]);
});

test('it stamps the instant a provider first reaches its day limit, and only that provider', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend(ctx.metered, null, { dollars: 100, tokens: 1 });

  ctx.moveTo('2026-11-13T11:00:00Z');

  const stored = await ctx.store.read();

  expect([
    stored.providers['main']?.day.trippedAt,
    stored.routes['plan']?.day.trippedAt,
  ]).toStrictEqual(['2026-11-13T10:00:00.000Z', null]);
});

test('it resets every provider at midnight in the zone and clears the stamp', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend(ctx.metered, null, { dollars: 100, tokens: 1 });

  ctx.moveTo('2026-11-14T00:00:01Z');

  const stored = await ctx.store.read();

  expect(stored.providers['main']?.day).toStrictEqual({
    ...ctx.emptyDay,
    start: '2026-11-14',
    resetsAt: '2026-11-15T00:00:00.000Z',
  });
});

test('it starts a provider that the config gained at zero', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend(ctx.plan, null, { dollars: 3, tokens: 30 });

  const wider = await ctx.start({
    ...ctx.limits,
    providers: { ...ctx.limits.providers, side: { day: 1, month: 2, dayCap: 2 } },
  });

  const stored = await wider.read();

  expect([stored.providers['main']?.day.micros, stored.providers['side']?.day]).toStrictEqual([
    3_000_000,
    ctx.emptyDay,
  ]);
});

test('it moves a version 3 store to version 4 with every provider at zero and the route counts kept', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  const spent = (day: number, month: number) => ({
    day: { ...ctx.emptyDay, micros: day },
    month: { ...ctx.emptyMonth, micros: month },
  });

  await writeFile(
    ctx.path,
    JSON.stringify({
      version: 3,
      lost: true,
      routes: { plan: spent(7_000_000, 9_000_000), metered: spent(7_000_000, 9_000_000) },
      sandboxes: {
        alpha: {
          micros: 5,
          tokens: 1,
          limit: { dollars: 2 },
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
    }),
  );

  await ctx.start(ctx.limits);

  expect([await ctx.readFile(), ctx.readMoves()]).toStrictEqual([
    {
      version: 4,
      lost: true,
      providers: { main: { day: ctx.emptyDay, month: ctx.emptyMonth } },
      routes: { plan: spent(7_000_000, 9_000_000), metered: spent(7_000_000, 9_000_000) },
      sandboxes: {
        alpha: {
          micros: 5,
          tokens: 1,
          limit: { dollars: 2 },
          lastRefusal: { counter: 'route_day', route: 'plan', provider: 'main', atMs: 3 },
          limitRevision: 2,
        },
        beta: { micros: 0, tokens: 0, limit: null, lastRefusal: null, limitRevision: 1 },
      },
      lastLimitRevision: 9,
    },
    [['store.moved', { version: 3, lost: true }, 'warn']],
  ]);
});

test('it stamps the instant a route first reaches its day limit, and only that route', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend(ctx.metered, null, { dollars: 5, tokens: 1 });

  ctx.moveTo('2026-11-13T11:00:00Z');

  const stored = await ctx.store.read();

  expect([
    stored.routes['metered']?.day.trippedAt,
    stored.routes['plan']?.day.trippedAt,
  ]).toStrictEqual(['2026-11-13T10:00:00.000Z', null]);
});

test('it resets every route at midnight in the zone and clears the stamp', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend(ctx.metered, null, { dollars: 5, tokens: 1 });

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

  await ctx.store.addSpend(ctx.plan, null, { dollars: 3, tokens: 30 });

  const wider = await ctx.start({
    ...ctx.limits,
    routes: { ...ctx.limits.routes, extra: { day: 1, month: 2, dayCap: 2 } },
  });

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
      sandboxes: {
        alpha: { micros: 0, tokens: 0, limit: null, lastRefusal: null, limitRevision: 0 },
      },
    },
    result: undefined,
  }));

  await ctx.store.writeRefusal('alpha', {
    counter: 'route_day',
    route: 'plan',
    provider: 'main',
    atMs: 5,
  });

  await ctx.store.writeRefusal('ghost', {
    counter: 'route_day',
    route: 'plan',
    provider: 'main',
    atMs: 6,
  });

  const stored = await ctx.store.read();

  expect(Object.keys(stored.sandboxes)).toStrictEqual(['alpha']);

  expect(stored.sandboxes['alpha']?.lastRefusal).toStrictEqual({
    counter: 'route_day',
    route: 'plan',
    provider: 'main',
    atMs: 5,
  });
});

test('it loads a sandbox stored with no limit revision at revision 0', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await writeFile(
    ctx.path,
    JSON.stringify({
      version: 4,
      providers: { main: { day: ctx.emptyDay, month: ctx.emptyMonth } },
      routes: {
        plan: { day: ctx.emptyDay, month: ctx.emptyMonth },
        metered: { day: ctx.emptyDay, month: ctx.emptyMonth },
      },
      sandboxes: { alpha: { micros: 5, tokens: 1, limit: { dollars: 2 }, lastRefusal: null } },
    }),
  );

  const store = await ctx.start(ctx.limits);
  const held = await store.read();

  expect(held.sandboxes['alpha']).toStrictEqual({
    micros: 5,
    tokens: 1,
    limit: { dollars: 2 },
    lastRefusal: null,
    limitRevision: 0,
  });
});

test('it marks the count as lost', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.markLost();

  const stored = await ctx.store.read();

  expect(stored.lost).toBe(true);
});
