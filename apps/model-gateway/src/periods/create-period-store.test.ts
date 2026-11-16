import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PeriodStore } from '../types';
import { createPeriodStore } from './create-period-store';

async function setupTest(startAt: string) {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-periods-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const path = join(directory, 'counter.json');
  let current = Date.parse(startAt);

  const store = await createPeriodStore({ path, zone: 'Europe/London', now: () => current });

  return {
    store,
    path,
    directory,
    moveTo: (instant: string) => {
      current = Date.parse(instant);
    },
    readFile: (): Promise<unknown> => Bun.file(path).json(),
    setLimits: () =>
      store.change((held) => ({
        store: {
          ...held,
          periods: {
            day: {
              ...held.periods.day,
              limit: { dollars: 60, tokens: 80_000_000 },
              raise: { dollars: 90, tokens: 120_000_000 },
            },
            month: { ...held.periods.month, limit: { dollars: 600, tokens: 600_000_000 } },
          },
          sandboxes: { alpha: { dollars: 0, tokens: 0, limit: null } },
        },
        result: undefined,
      })),
  };
}

test('it starts a store with no limit, a zero count and the day and month in force', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  const expected: PeriodStore = {
    version: 2,
    lost: false,
    periods: {
      day: { start: '2026-11-13', dollars: 0, tokens: 0, limit: null, raise: null },
      month: { start: '2026-11-01', dollars: 0, tokens: 0, limit: null, raise: null },
    },
    sandboxes: {},
  };

  const stored = await ctx.store.read();

  expect(stored).toStrictEqual(expected);
});

test('it refuses to start on a file in the shape of a limits count', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await writeFile(ctx.path, '{"dollars":1,"tokens":2}');

  await expect(
    createPeriodStore({ path: ctx.path, zone: 'Europe/London', now: () => 0 }),
  ).rejects.toThrow();
});

test('it adds a reply to the day, the month and the sandbox in one write', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.setLimits();
  await ctx.store.addSpend('alpha', { dollars: 0.5, tokens: 100 });

  const stored = await ctx.readFile();

  expect(stored).toMatchObject({
    periods: { day: { dollars: 0.5, tokens: 100 }, month: { dollars: 0.5, tokens: 100 } },
    sandboxes: { alpha: { dollars: 0.5, tokens: 100 } },
  });
});

test('it counts a reply from a sandbox the store lacks on the day and the month only', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');
  const after = await ctx.store.addSpend('ghost', { dollars: 1, tokens: 10 });

  expect(after).toMatchObject({
    periods: { day: { dollars: 1 }, month: { dollars: 1 } },
    sandboxes: {},
  });
});

test('it counts each of 20 replies that end together exactly once', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.setLimits();

  await Promise.all(
    Array.from({ length: 20 }, () => ctx.store.addSpend('alpha', { dollars: 1, tokens: 5 })),
  );

  const stored = await ctx.store.read();

  expect([
    stored.periods.day.dollars,
    stored.periods.month.tokens,
    stored.sandboxes['alpha']?.dollars,
  ]).toStrictEqual([20, 100, 20]);
});

test('it resets the day at local midnight in the zone and keeps its limit, drops its raise, and leaves the month', async () => {
  const ctx = await setupTest('2026-06-13T10:00:00Z');

  await ctx.setLimits();
  await ctx.store.addSpend('alpha', { dollars: 7, tokens: 70 });

  // 23:00Z is midnight in London in summer
  ctx.moveTo('2026-06-13T22:59:59Z');

  const before = await ctx.store.read();

  ctx.moveTo('2026-06-13T23:00:00Z');

  const after = await ctx.store.read();

  expect(before.periods.day).toMatchObject({ start: '2026-06-13', dollars: 7 });

  expect(after).toMatchObject({
    periods: {
      day: {
        start: '2026-06-14',
        dollars: 0,
        tokens: 0,
        limit: { dollars: 60, tokens: 80_000_000 },
        raise: null,
      },
      month: { start: '2026-06-01', dollars: 7 },
    },
    sandboxes: { alpha: { dollars: 7 } },
  });
});

test('it resets a day that is an hour longer at the next local midnight when the clocks go back', async () => {
  const ctx = await setupTest('2026-10-25T00:30:00Z');

  await ctx.store.addSpend(null, { dollars: 1, tokens: 1 });

  // 00:00Z on 26 October is midnight in London once the clocks are back; 23:00Z on the 25th is not
  ctx.moveTo('2026-10-25T23:30:00Z');

  const beforeMidnight = await ctx.store.read();

  ctx.moveTo('2026-10-26T00:00:00Z');

  const afterMidnight = await ctx.store.read();

  expect(beforeMidnight.periods.day).toMatchObject({ start: '2026-10-25', dollars: 1 });
  expect(afterMidnight.periods.day).toMatchObject({ start: '2026-10-26', dollars: 0 });
});

test('it resets the month at the first local midnight of the next month', async () => {
  const ctx = await setupTest('2026-11-30T12:00:00Z');

  await ctx.store.addSpend(null, { dollars: 3, tokens: 30 });

  ctx.moveTo('2026-11-30T23:59:59Z');

  const before = await ctx.store.read();

  ctx.moveTo('2026-12-01T00:00:00Z');

  const after = await ctx.store.read();

  expect(before.periods.month).toMatchObject({ start: '2026-11-01', dollars: 3 });
  expect(after.periods.month).toMatchObject({ start: '2026-12-01', dollars: 0, tokens: 0 });
});

test('it resets a period on a read that no model request caused, and writes the reset', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend(null, { dollars: 4, tokens: 40 });

  ctx.moveTo('2026-11-14T10:00:00Z');

  await ctx.store.read();

  const stored = await ctx.readFile();

  expect(stored).toMatchObject({
    periods: { day: { start: '2026-11-14', dollars: 0 }, month: { dollars: 4 } },
  });
});

test('it counts a reply after midnight in the new day and in the month once', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend(null, { dollars: 1, tokens: 10 });

  ctx.moveTo('2026-11-14T00:00:01Z');

  const after = await ctx.store.addSpend(null, { dollars: 2, tokens: 20 });

  expect([after.periods.day.dollars, after.periods.month.dollars]).toStrictEqual([2, 3]);
});

test('it keeps the lost mark through a reset and writes the field only while it stands', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.markLost();

  const marked = await ctx.readFile();

  ctx.moveTo('2026-11-14T10:00:00Z');

  const after = await ctx.store.read();

  expect(after.lost).toBe(true);
  expect(marked).toMatchObject({ lost: true });
});

test('it does not reset a period when the clock moves back', async () => {
  const ctx = await setupTest('2026-11-13T10:00:00Z');

  await ctx.store.addSpend(null, { dollars: 1, tokens: 10 });

  ctx.moveTo('2026-11-12T10:00:00Z');

  const after = await ctx.store.read();

  expect(after.periods.day).toMatchObject({ start: '2026-11-13', dollars: 1 });
});
