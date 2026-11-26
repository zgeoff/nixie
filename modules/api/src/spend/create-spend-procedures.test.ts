import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { spendCountSetCodec, spendLimitRaisedCodec } from '@heynixie/spend';
import {
  buildMockGatewayStatus,
  buildProviderTrippedGatewayStatus,
  buildTrippedGatewayStatus,
} from '@heynixie/spend/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

interface TestOptions {
  readonly isSpendOn: boolean;
}

async function setupTest(options: TestOptions) {
  // the stub gateway counts the day of 13 Nov 2026
  const api = await startTestAPI(undefined, {
    ...options,
    writerClock: createFakeClock({ startMs: Date.parse('2026-11-13T09:00:00Z') }),
  });

  const laptop = await createDeviceSession(api.context, 'laptop');

  return {
    ...api,
    laptop,
    client: buildTestClient(api.url, laptop.token),
    writeTurns: (count: number) =>
      withWriteTransaction(api.writer, (tx) =>
        writeRecordsInTransaction(
          tx,
          api.context.log,
          Array.from({ length: count }, () => ({
            kind: 'model.turn_ended' as const,
            definitions: api.context.definitions(),
            thread: 'task-a',
            payload: {},
          })),
        ),
      ),
  };
}

test('#spend.read gives clear with no route and calls no gateway when the config sets no spendStop', async () => {
  const ctx = await setupTest({ isSpendOn: false });
  const read = await ctx.client.spend.read({});

  expect([read, ctx.spendGateway.readStatus.mock.calls]).toStrictEqual([
    { state: 'clear', routes: [], providers: [] },
    [],
  ]);
});

test('#spend.counts gives no route and no display, and calls no gateway when the config sets no spendStop', async () => {
  const ctx = await setupTest({ isSpendOn: false });
  const counts = await ctx.client.spend.counts({});

  expect([counts, ctx.spendGateway.readStatus.mock.calls]).toStrictEqual([
    { providers: [], routes: [], display: null },
    [],
  ]);
});

test('#spend.counts gives each route its day and month count in US dollars, with the display rate', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const counts = await ctx.client.spend.counts({});

  expect(counts).toStrictEqual({
    providers: [
      {
        provider: 'main',
        day: { start: '2026-11-13', dollars: 0, limit: 100, tripped: false },
        month: { start: '2026-11-01', dollars: 0, limit: 1000, tripped: false },
      },
    ],
    routes: [
      {
        route: 'plan',
        provider: 'main',
        day: { start: '2026-11-13', dollars: 41.2, limit: 40, tripped: true },
        month: { start: '2026-11-01', dollars: 0, limit: 600, tripped: false },
      },
      {
        route: 'metered',
        provider: 'main',
        day: { start: '2026-11-13', dollars: 0, limit: 5, tripped: false },
        month: { start: '2026-11-01', dollars: 0, limit: 600, tripped: false },
      },
    ],
    display: { currency: 'AUD', rate: 1.52 },
  });
});

test('#spend.counts refuses a caller with no session', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  const counts = buildTestClient(ctx.url).spend.counts({});

  await Promise.allSettled([counts]);

  expect(counts).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#spend.read refuses a caller with no session', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  const read = buildTestClient(ctx.url).spend.read({});

  await Promise.allSettled([read]);

  expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#spend.read lists the route at its day limit and leaves nixie clear', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const read = await ctx.client.spend.read({});

  expect(read).toStrictEqual({
    state: 'clear',
    providers: [],
    routes: [
      {
        route: 'plan',
        period: 'day',
        start: '2026-11-13',
        limit: 40,
        spent: 41.2,
        at: new Date('2026-11-13T08:42:07Z'),
        resetsAt: new Date('2026-11-14T00:00:00Z'),
        canRaise: true,
        cap: 80,
      },
    ],
  });
});

test('#spend.read gives the trip of the turn count with its limit, its count and its cap', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  await ctx.writeTurns(3);

  const read = await ctx.client.spend.read({});

  expect(read).toMatchObject({
    state: 'tripped',
    period: 'day',
    measure: 'turns',
    limit: 3,
    spent: 3,
    canRaise: true,
    cap: 5,
    routes: [],
    providers: [],
  });
});

test('#spend.read gives unreachable when the gateway does not answer', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const read = await ctx.client.spend.read({});

  expect(read).toStrictEqual({ state: 'unreachable', routes: [], providers: [] });
});

test('#spend.raise lifts a route with one call, and writes the session as the actor', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });
  ctx.spendGateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const raised = await ctx.client.spend.raise({ start: '2026-11-13', route: 'plan', dollars: 60 });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['spend.limit_raised'],
  });

  expect(raised).toStrictEqual({ state: 'clear' });

  expect(ctx.spendGateway.postRaise.mock.calls).toStrictEqual([
    [{ target: { kind: 'route', id: 'plan' }, start: '2026-11-13', dollars: 60 }],
  ]);

  expect(records.map((entry) => spendLimitRaisedCodec.decode(entry.record.payload))).toStrictEqual([
    { start: '2026-11-13', route: 'plan', dollars: 60, by: ctx.laptop.caller.identityID },
  ]);
});

test('#spend.raise answers above_cap with the route and its cap, and writes nothing', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const raised = await ctx.client.spend.raise({ start: '2026-11-13', route: 'plan', dollars: 90 });

  expect([raised, ctx.spendGateway.postRaise.mock.calls]).toStrictEqual([
    { error: 'above_cap', measure: 'dollars', route: 'plan', provider: null, cap: 80 },
    [],
  ]);
});

test('#spend.raise answers unknown_route for a route the gateway does not hold', async () => {
  const ctx = await setupTest({ isSpendOn: true });
  const raised = await ctx.client.spend.raise({ start: '2026-11-13', route: 'ghost', dollars: 5 });

  expect(raised).toStrictEqual({ error: 'unknown_route' });
});

test('#spend.read lists the provider at its day limit with its routes and leaves nixie clear', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildProviderTrippedGatewayStatus(),
  });

  const read = await ctx.client.spend.read({});

  expect(read).toStrictEqual({
    state: 'clear',
    routes: [],
    providers: [
      {
        provider: 'main',
        routes: ['plan', 'metered'],
        period: 'day',
        start: '2026-11-13',
        limit: 100,
        spent: 101.5,
        at: new Date('2026-11-13T08:42:07Z'),
        resetsAt: new Date('2026-11-14T00:00:00Z'),
        canRaise: true,
        cap: 200,
      },
    ],
  });
});

test('#spend.raise lifts a provider with one call, and writes the provider on the record', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildProviderTrippedGatewayStatus(),
  });

  ctx.spendGateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const raised = await ctx.client.spend.raise({
    start: '2026-11-13',
    provider: 'main',
    dollars: 150,
  });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['spend.limit_raised'],
  });

  expect(raised).toStrictEqual({ state: 'clear' });

  expect(records.map((entry) => spendLimitRaisedCodec.decode(entry.record.payload))).toStrictEqual([
    { start: '2026-11-13', provider: 'main', dollars: 150, by: ctx.laptop.caller.identityID },
  ]);
});

test('#spend.raise refuses a raise that names both a route and a provider', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  const raised = ctx.client.spend.raise({
    start: '2026-11-13',
    route: 'plan',
    provider: 'main',
    dollars: 60,
  });

  await Promise.allSettled([raised]);

  expect(raised).rejects.toBeDefined();
});

test('#spend.setCount resets a count, records it with the session as the actor and clears the stop', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildProviderTrippedGatewayStatus(),
  });

  ctx.spendGateway.postCount.mockImplementation(() => {
    ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

    return Promise.resolve({ kind: 'ok' });
  });

  const set = await ctx.client.spend.setCount({
    provider: 'main',
    period: 'day',
    start: '2026-11-13',
    dollars: 0,
  });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['spend.count_set'],
  });

  expect(set).toStrictEqual({ state: 'clear' });

  expect(records.map((entry) => spendCountSetCodec.decode(entry.record.payload))).toStrictEqual([
    {
      provider: 'main',
      period: 'day',
      start: '2026-11-13',
      from: 101.5,
      to: 0,
      by: ctx.laptop.caller.identityID,
    },
  ]);
});

test('#spend.setCount gives clear and calls no gateway when the config sets no spendStop', async () => {
  const ctx = await setupTest({ isSpendOn: false });

  const set = await ctx.client.spend.setCount({
    route: 'plan',
    period: 'day',
    start: '2026-11-13',
    dollars: 0,
  });

  expect([set, ctx.spendGateway.postCount.mock.calls]).toStrictEqual([{ state: 'clear' }, []]);
});

test('#spend.setCount refuses a change that names neither a route nor a provider', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  const set = ctx.client.spend.setCount({ period: 'day', start: '2026-11-13', dollars: 0 });

  await Promise.allSettled([set]);

  expect(set).rejects.toBeDefined();
});

test('#spend.raise gives clear and calls no gateway when the config sets no spendStop', async () => {
  const ctx = await setupTest({ isSpendOn: false });
  const raised = await ctx.client.spend.raise({ start: '2026-11-13', route: 'plan', dollars: 60 });

  expect([raised, ctx.spendGateway.postRaise.mock.calls]).toStrictEqual([{ state: 'clear' }, []]);
});

test('#nixie.resume is refused while the stop stands, with the way it clears', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  await ctx.writeTurns(3);

  const resume = ctx.client.nixie.resume({
    clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
  });

  await Promise.allSettled([resume]);

  expect(resume).rejects.toMatchObject({
    code: 'SPEND_STOP_STANDS',
    message: expect.stringContaining("raise today's limit"),
  });
});

test('#nixie.resume resumes when the stop does not stand', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  const resumed = await ctx.client.nixie.resume({
    clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
  });

  expect(resumed).toStrictEqual({ paused: null });
});

test('#tasks.resume is refused while the stop stands', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const resume = ctx.client.tasks.resume({
    clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f',
    taskID: 'task-a',
  });

  await Promise.allSettled([resume]);

  expect(resume).rejects.toMatchObject({ code: 'SPEND_STOP_STANDS' });
});
