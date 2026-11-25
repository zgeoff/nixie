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
    dollars: 0,
    raise: null,
    trippedAt: null,
  };

  const emptyMonth = {
    start: '2026-11-01',
    resetsAt: '2026-12-01T00:00:00.000Z',
    dollars: 0,
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

test('it rewrites a version 2 store with every route at zero, keeps its sandboxes and logs the old totals', async () => {
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
        plan: { day: ctx.emptyDay, month: ctx.emptyMonth },
        metered: { day: ctx.emptyDay, month: ctx.emptyMonth },
      },
      sandboxes: { alpha: { dollars: 1, tokens: 2, limit: null, lastRefusal: null } },
    },
    [
      'store.moved',
      { dayDollars: 7, dayTokens: 70, monthDollars: 9, monthTokens: 90, lost: false },
      'warn',
    ],
  ]);
});

test('it adds a spend to the route it names and to no other', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend('plan', null, { dollars: 3, tokens: 30 });

  const stored = await ctx.store.read();

  expect([
    stored.routes['plan']?.day.dollars,
    stored.routes['plan']?.month.dollars,
    stored.routes['metered']?.day.dollars,
  ]).toStrictEqual([3, 3, 0]);
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

  expect([stored.routes['plan']?.day.dollars, stored.routes['extra']?.day]).toStrictEqual([
    3,
    ctx.emptyDay,
  ]);
});

test('it keeps the last refusal on a sandbox the store holds, and on no other', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.change((held) => ({
    store: {
      ...held,
      sandboxes: { alpha: { dollars: 0, tokens: 0, limit: null, lastRefusal: null } },
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
