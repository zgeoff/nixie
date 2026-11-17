import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { z } from 'zod';
import { createPeriodStore } from '../periods/create-period-store';
import { makePeriodsAccounting } from './make-periods-accounting';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-accounting-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const storePath = join(directory, 'counter.json');

  const store = await createPeriodStore({
    path: storePath,
    zone: 'Europe/London',
    now: () => Date.parse('2026-11-13T10:00:00Z'),
    readOverride: () => Promise.resolve(null),
    log: mock<Logger>(() => {}),
  });

  await store.change((held) => ({
    store: {
      ...held,
      periods: {
        day: { ...held.periods.day, limit: { dollars: 60, tokens: 1000 } },
        month: { ...held.periods.month, limit: { dollars: 600, tokens: 10_000 } },
      },
      sandboxes: { alpha: { dollars: 0, tokens: 0, limit: null } },
    },
    result: undefined,
  }));

  const log = mock<Logger>(() => {});

  return {
    store,
    storePath,
    log,
    route: {
      api: 'anthropic-messages',
      upstream: 'http://model.test',
      model: 'model-small',
      providerPin: null,
      prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    } as const,
    usage: (input: number, output: number) => ({
      uncachedInputTokens: input,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      cacheReadTokens: 0,
      outputTokens: output,
    }),
    accounting: makePeriodsAccounting({
      store,
      countBySandbox: true,
      log,
    }),
  };
}

test('it marks the count lost and refuses every later request when a reply that spent has no usage', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.route, 'alpha', null, true);

  const refusal = await ctx.accounting.admit('alpha');
  const stored = await ctx.store.read();

  expect(refusal?.status).toBe(503);
  expect(stored.lost).toBeTrue();
});

test('it admits a request again once an operator removes the lost mark, with no restart', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.route, 'alpha', null, true);

  const markedText = await readFile(ctx.storePath, 'utf8');

  const marked: unknown = JSON.parse(markedText);
  const { lost: _, ...cleared } = z.looseObject({ lost: z.literal(true) }).parse(marked);

  await writeFile(ctx.storePath, JSON.stringify(cleared));

  const refusal = await ctx.accounting.admit('alpha');

  expect(refusal).toBeNull();
});

test('it adds nothing for a reply with no usage that spent nothing', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.route, 'alpha', null, false);

  const stored = await ctx.store.read();

  expect([stored.lost, stored.periods.day.tokens]).toStrictEqual([false, 0]);
});

test('it logs once that a limit was reached', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.route, 'alpha', ctx.usage(600, 500), true);
  await ctx.accounting.count(ctx.route, 'alpha', ctx.usage(1, 1), true);

  expect(ctx.log.mock.calls.filter(([event]) => event === 'limit.reached')).toHaveLength(1);
});

test('it refuses a request with the limit 403 once the day reaches its limit', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.route, 'alpha', ctx.usage(600, 400), true);

  const refusal = await ctx.accounting.admit('alpha');

  expect(refusal?.status).toBe(403);
});
