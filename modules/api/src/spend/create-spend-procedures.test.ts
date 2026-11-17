import { expect, test } from 'bun:test';
import { buildMockGatewayStatus, buildTrippedGatewayStatus } from '@heynixie/spend/test-utils';
import { sql } from 'kysely';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

interface TestOptions {
  readonly isSpendOn: boolean;
}

async function setupTest(options: TestOptions) {
  const api = await startTestAPI(undefined, options);
  const laptop = await createDeviceSession(api.context, 'laptop');

  return { ...api, laptop, client: buildTestClient(api.url, laptop.token) };
}

test('#spend.read gives clear and calls no gateway when the config sets no spendStop', async () => {
  const ctx = await setupTest({ isSpendOn: false });
  const read = await ctx.client.spend.read({});

  expect([read, ctx.spendGateway.readStatus.mock.calls]).toStrictEqual([{ state: 'clear' }, []]);
});

test('#spend.read refuses a caller with no session', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  const read = buildTestClient(ctx.url).spend.read({});

  await Promise.allSettled([read]);

  expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#spend.read gives the trip of the day with its measures and its times', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const read = await ctx.client.spend.read({});

  expect(read).toStrictEqual({
    state: 'tripped',
    period: 'day',
    start: '2026-10-16',
    measure: 'dollars',
    limit: 60,
    spent: 61.2,
    at: new Date('2026-10-16T08:42:07Z'),
    resetsAt: new Date('2026-10-17T00:00:00Z'),
    canRaise: true,
    limits: { dollars: 60, tokens: 80_000_000, turns: 3 },
    used: { dollars: 61.2, tokens: 51_200_000, turns: 0 },
    cap: { dollars: 120, tokens: 160_000_000, turns: 5 },
  });
});

test('#spend.read gives unreachable when the gateway does not answer', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const read = await ctx.client.spend.read({});

  expect(read).toStrictEqual({ state: 'unreachable' });
});

test('#spend.raise lifts a day trip with one call, and writes the session as the actor', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });
  ctx.spendGateway.postRaise.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  const raised = await ctx.client.spend.raise({
    start: '2026-10-16',
    dollars: 90,
    tokens: 120_000_000,
    turns: 4,
  });

  const result =
    await sql`select kind, payload from records where kind = 'spend.limit_raised'`.execute(
      ctx.writer.db,
    );

  const rows = result.rows;

  expect(raised).toStrictEqual({ state: 'clear' });

  expect(rows).toStrictEqual([
    {
      kind: 'spend.limit_raised',
      payload: JSON.stringify({
        start: '2026-10-16',
        dollars: 90,
        tokens: 120_000_000,
        turns: 4,
        by: ctx.laptop.caller.identityID,
      }),
    },
  ]);
});

test('#spend.raise answers above_cap with the cap, and writes nothing', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

  const raised = await ctx.client.spend.raise({
    start: '2026-10-16',
    dollars: 130,
    tokens: 120_000_000,
    turns: 4,
  });

  expect([raised, ctx.spendGateway.postRaise.mock.calls]).toStrictEqual([
    { error: 'above_cap', cap: { dollars: 120, tokens: 160_000_000, turns: 5 } },
    [],
  ]);
});

test('#spend.raise gives clear and calls no gateway when the config sets no spendStop', async () => {
  const ctx = await setupTest({ isSpendOn: false });

  const raised = await ctx.client.spend.raise({
    start: '2026-10-16',
    dollars: 90,
    tokens: 120_000_000,
    turns: 4,
  });

  expect([raised, ctx.spendGateway.postRaise.mock.calls]).toStrictEqual([{ state: 'clear' }, []]);
});

test('#nixie.resume is refused while the stop stands, with the way it clears', async () => {
  const ctx = await setupTest({ isSpendOn: true });

  ctx.spendGateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildTrippedGatewayStatus() });

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
