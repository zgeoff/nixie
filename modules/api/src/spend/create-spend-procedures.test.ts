import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { buildMockGatewayStatus, buildTrippedGatewayStatus } from '@heynixie/spend/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { sql } from 'kysely';
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
    { state: 'clear', routes: [] },
    [],
  ]);
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
  });
});

test('#spend.read gives unreachable when the gateway does not answer', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const read = await ctx.client.spend.read({});

  expect(read).toStrictEqual({ state: 'unreachable', routes: [] });
});

test('#spend.raise lifts a route with one call, and writes the session as the actor', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });
  ctx.spendGateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const raised = await ctx.client.spend.raise({ start: '2026-11-13', route: 'plan', dollars: 60 });

  const result =
    await sql`select kind, payload from records where kind = 'spend.limit_raised'`.execute(
      ctx.writer.db,
    );

  expect(raised).toStrictEqual({ state: 'clear' });

  expect(ctx.spendGateway.postRaise.mock.calls).toStrictEqual([
    [{ route: 'plan', start: '2026-11-13', dollars: 60 }],
  ]);

  expect(result.rows).toStrictEqual([
    {
      kind: 'spend.limit_raised',
      payload: JSON.stringify({
        start: '2026-11-13',
        route: 'plan',
        dollars: 60,
        by: ctx.laptop.caller.identityID,
      }),
    },
  ]);
});

test('#spend.raise answers above_cap with the route and its cap, and writes nothing', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const raised = await ctx.client.spend.raise({ start: '2026-11-13', route: 'plan', dollars: 90 });

  expect([raised, ctx.spendGateway.postRaise.mock.calls]).toStrictEqual([
    { error: 'above_cap', measure: 'dollars', route: 'plan', cap: 80 },
    [],
  ]);
});

test('#spend.raise answers unknown_route for a route the gateway does not hold', async () => {
  const ctx = await setupTest({ isSpendOn: true });
  const raised = await ctx.client.spend.raise({ start: '2026-11-13', route: 'ghost', dollars: 5 });

  expect(raised).toStrictEqual({ error: 'unknown_route' });
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
