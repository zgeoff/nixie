import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { z } from 'zod';
import { createPeriodStore } from '../periods/create-period-store';
import { buildReplyEstimate } from '../usage/build-reply-estimate';
import type { CountedReply } from './accounting';
import { makePeriodsAccounting } from './make-periods-accounting';

async function setupTest() {
  const limits = { preview: { day: 0.002, month: 10, dayCap: 1 } };

  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-accounting-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const storePath = join(directory, 'counter.json');

  const store = await createPeriodStore({
    path: storePath,
    zone: 'Europe/London',
    limits,
    now: () => Date.parse('2026-11-13T10:00:00Z'),
    readOverrides: () => Promise.resolve({}),
    log: mock<Logger>(() => {}),
  });

  await store.change((held) => ({
    store: {
      ...held,
      sandboxes: { alpha: { dollars: 0, tokens: 0, limit: null, lastRefusal: null } },
    },
    result: undefined,
  }));

  const log = mock<Logger>(() => {});

  const route = {
    api: 'anthropic-messages',
    upstream: 'http://model.test',
    model: 'model-small',
    providerPin: null,
    prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    maxOutputTokens: null,
    login: null,
    limits: limits.preview,
  } as const;

  return {
    store,
    storePath,
    log,
    route,
    usage: (input: number, output: number) => ({
      uncachedInputTokens: input,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      cacheReadTokens: 0,
      outputTokens: output,
    }),
    reply: (fields: Partial<CountedReply>): CountedReply => ({
      routeID: 'preview',
      route,
      sandbox: 'alpha',
      estimate: null,
      usage: null,
      hasInput: false,
      whole: true,
      spent: true,
      reason: 'no_usage',
      ...fields,
    }),

    // a 1,000-byte request that allows 1,000 output tokens
    estimate: buildReplyEstimate({
      route,
      api: 'anthropic-messages',
      body: { max_tokens: 1000 },
      byteLength: 1000,
    }),
    accounting: makePeriodsAccounting({
      store,
      limits,
      countBySandbox: true,
      now: () => Date.parse('2026-11-13T10:00:00Z'),
      log,
    }),
  };
}

test('it counts the estimate and marks nothing lost when a reply that spent has no usage', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.reply({ estimate: ctx.estimate }));

  const stored = await ctx.store.read();

  // 5,096 input tokens at the highest input rate, $2, and 1,000 output tokens at $5, per million
  expect([stored.lost, stored.routes['preview']?.day, stored.sandboxes['alpha']]).toMatchObject([
    false,
    { dollars: 0.015192 },
    { dollars: 0.015192, tokens: 6096 },
  ]);
});

test('it logs the estimate with its route, sandbox and reason', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.reply({ estimate: ctx.estimate, reason: 'upstream_failed' }));

  expect(ctx.log).toHaveBeenCalledWith(
    'count.estimated',
    {
      route: 'preview',
      sandbox: 'alpha',
      reason: 'upstream_failed',
      dollars: 0.015192,
      tokens: 6096,
    },
    'warn',
  );
});

test('it logs a whole reply with its route, sandbox, usage and charge', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.reply({ estimate: ctx.estimate, usage: ctx.usage(1000, 200) }));

  // 1,000 input tokens at $1 and 200 output tokens at $5, per million
  expect(ctx.log).toHaveBeenCalledWith('count.charged', {
    route: 'preview',
    sandbox: 'alpha',
    uncachedInputTokens: 1000,
    cacheReadTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 200,
    reasoningTokens: null,
    dollars: 0.002,
    tokens: 1200,
  });
});

test('it marks the count lost and refuses every later request when a reply that spent has no usage and no bound', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(
    ctx.reply({ estimate: { kind: 'unbounded', field: 'messages.content.source' } }),
  );

  const refusal = await ctx.accounting.admit('preview', 'alpha');
  const stored = await ctx.store.read();

  expect([refusal?.status, stored.lost]).toStrictEqual([503, true]);

  expect(ctx.log).toHaveBeenCalledWith(
    'count.lost',
    { route: 'preview', sandbox: 'alpha', field: 'messages.content.source' },
    'error',
  );
});

test('it charges a cut stream the larger of its byte bound and the input it reported, with the output bound', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(
    ctx.reply({ estimate: ctx.estimate, usage: ctx.usage(9000, 3), whole: false, reason: 'cut' }),
  );

  const stored = await ctx.store.read();

  // 9,000 input tokens at $2 and 1,000 output tokens at $5, per million
  expect([stored.routes['preview']?.day.dollars, stored.sandboxes['alpha']?.tokens]).toStrictEqual([
    0.023, 10_000,
  ]);
});

test('it charges a cut stream from Anthropic its reported input at the class rates, with the output bound', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(
    ctx.reply({
      route: { ...ctx.route, upstream: 'https://api.anthropic.com' },
      estimate: ctx.estimate,
      usage: { ...ctx.usage(0, 3), cacheReadTokens: 9000 },
      hasInput: true,
      whole: false,
      reason: 'cut',
    }),
  );

  const stored = await ctx.store.read();

  // 9,000 cache read tokens at $0.10 and 1,000 output tokens at $5, per million
  expect([stored.routes['preview']?.day.dollars, stored.sandboxes['alpha']?.tokens]).toStrictEqual([
    0.0059, 10_000,
  ]);
});

test('it charges the byte bound for a cut Anthropic stream that never reported its input classes', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(
    ctx.reply({
      route: { ...ctx.route, upstream: 'https://api.anthropic.com' },
      estimate: ctx.estimate,
      usage: ctx.usage(0, 3),
      hasInput: false,
      whole: false,
      reason: 'cut',
    }),
  );

  const stored = await ctx.store.read();

  // 5,096 byte-bound input tokens (1,000 bytes and the 4,096 allowance) at $2, and 1,000 output
  // tokens at $5, per million
  expect([stored.routes['preview']?.day.dollars, stored.sandboxes['alpha']?.tokens]).toStrictEqual([
    0.015192, 6096,
  ]);
});

test('it charges the output bound for a reply whose usage holds only its input', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(
    ctx.reply({ estimate: ctx.estimate, usage: ctx.usage(900, 0), whole: false }),
  );

  const stored = await ctx.store.read();

  // 5,096 byte-bound input tokens beat the 900 reported, so they are priced at $2, with 1,000
  // output tokens at $5, per million
  expect([stored.routes['preview']?.day.dollars, stored.sandboxes['alpha']?.tokens]).toStrictEqual([
    0.015192, 6096,
  ]);
});

test('it admits a request again once an operator removes the lost mark, with no restart', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.reply({ estimate: { kind: 'unbounded', field: 'container' } }));

  const markedText = await readFile(ctx.storePath, 'utf8');

  const marked: unknown = JSON.parse(markedText);
  const { lost: _, ...cleared } = z.looseObject({ lost: z.literal(true) }).parse(marked);

  await writeFile(ctx.storePath, JSON.stringify(cleared));

  const refusal = await ctx.accounting.admit('preview', 'alpha');

  expect(refusal).toBeNull();
});

test('it adds nothing for a reply with no usage that spent nothing', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.reply({ spent: false }));

  const stored = await ctx.store.read();

  expect([stored.lost, stored.routes['preview']?.day.dollars]).toStrictEqual([false, 0]);
});

test('it logs once that a limit was reached', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.reply({ usage: ctx.usage(600, 500) }));
  await ctx.accounting.count(ctx.reply({ usage: ctx.usage(1, 1) }));

  expect(ctx.log.mock.calls.filter(([event]) => event === 'limit.reached')).toHaveLength(1);
});

test('it refuses a request with the limit 403 once the day reaches its limit', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.reply({ usage: ctx.usage(600, 400) }));

  const refusal = await ctx.accounting.admit('preview', 'alpha');

  expect(refusal?.status).toBe(403);
});

test('it names the counter and the route in the limit 403 and keeps the refusal on the sandbox', async () => {
  const ctx = await setupTest();

  await ctx.accounting.count(ctx.reply({ usage: ctx.usage(600, 400) }));

  const refusal = await ctx.accounting.admit('preview', 'alpha');
  const body: unknown = await refusal?.json();
  const stored = await ctx.store.read();

  expect([body, stored.sandboxes['alpha']?.lastRefusal]).toStrictEqual([
    {
      type: 'error',
      error: {
        type: 'limit_reached',
        counter: 'route_day',
        route: 'preview',
        message: expect.stringContaining('preview'),
      },
    },
    { counter: 'route_day', route: 'preview', atMs: Date.parse('2026-11-13T10:00:00Z') },
  ]);
});
