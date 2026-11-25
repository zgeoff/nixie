import { expect, test } from 'bun:test';
import {
  pauseNixieInTransaction,
  readPause,
  readPauseSince,
  resumeNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { sql } from 'kysely';
import { writeHostSpendRaise } from '../raise/write-host-spend-raise';
import { writeSpendRaiseRecord } from '../raise/write-spend-raise-record';
import { buildMockGatewayStatus, startTestSpend } from '../test-utils';
import { readSpendFacts } from './read-spend-facts';
import { readSpendStopRow } from './read-spend-stop-row';
import { settleSpendStop } from './settle-spend-stop';

async function setupTest() {
  const spend = await startTestSpend({ dayTurns: 3, dayTurnCap: 10, monthTurns: 100 });

  return {
    ...spend,
    settle: async () => {
      const facts = await readSpendFacts(spend.context);

      return settleSpendStop(spend.context, facts);
    },
    trip: async () => {
      for (let turn = 0; turn < 3; turn += 1) {
        await spend.writeTurn();
      }
    },
    raise: (turns: number) =>
      writeSpendRaiseRecord(spend.context, { start: '2026-10-16', turns, by: 'host' }),
    readPaused: () => withWriteTransaction(spend.writer, (tx) => readPause(tx)),
    readKinds: async () => {
      const result =
        await sql`select kind from records where kind like 'spend.%' or kind like 'nixie.%' order by sequence`.execute(
          spend.writer.db,
        );

      return result.rows;
    },
    pauseBy: (cause: 'owner') =>
      withWriteTransaction(spend.writer, (tx) =>
        pauseNixieInTransaction(tx, spend.log, {
          cause,
          recoveryID: null,
          by: 'session-a',
          definitions: spend.context.definitions(),
        }),
      ),
  };
}

test('it trips and pauses nixie with the cause spending when the gateway reports a trip', async () => {
  const ctx = await setupTest();

  await ctx.trip();
  await ctx.settle();

  const paused = await ctx.readPaused();

  expect(paused).toStrictEqual({ cause: 'spending', recoveryID: null });

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({ reason: 'limit', period: 'day' });

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual([{ kind: 'spend.stop_tripped' }, { kind: 'nixie.paused' }]);
});

test('it writes no trip of the stop when the route stops fail to settle', async () => {
  const ctx = await setupTest();

  const definitions = ctx.context.definitions();
  let calls = 0;

  await ctx.trip();

  const facts = await readSpendFacts(ctx.context);

  const settling = settleSpendStop(
    {
      ...ctx.context,
      definitions: () => {
        calls += 1;

        if (calls > 1) {
          throw new Error('the definitions are gone');
        }

        return definitions;
      },
    },
    facts,
  );

  const [settled] = await Promise.allSettled([settling]);

  expect(settled).toMatchObject({
    status: 'rejected',
    reason: new Error('the definitions are gone'),
  });

  const stop = await readSpendStopRow(ctx.writer.db);

  expect(stop).toBeNull();
});

test('it puts back no stop that a raise of turns cleared, when a settle that read the turns before the raise settles after it', async () => {
  const ctx = await setupTest();

  const lateStatus = Promise.withResolvers<Awaited<ReturnType<typeof ctx.gateway.readStatus>>>();

  await ctx.trip();
  await ctx.settle();

  ctx.gateway.readStatus.mockReturnValueOnce(lateStatus.promise);

  const late = ctx.settle();

  await writeHostSpendRaise(ctx.context, { turns: 10 });

  lateStatus.resolve({ kind: 'ok', value: buildMockGatewayStatus() });

  await late;

  const stop = await readSpendStopRow(ctx.writer.db);

  expect(stop).toBeNull();
});

test('it writes one trip when the stop is found twice', async () => {
  const ctx = await setupTest();

  await ctx.trip();
  await ctx.settle();
  await ctx.settle();

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual([{ kind: 'spend.stop_tripped' }, { kind: 'nixie.paused' }]);
});

test('it writes only the trip, and keeps the cause, when nixie is paused by its owner', async () => {
  const ctx = await setupTest();

  await ctx.pauseBy('owner');
  await ctx.trip();
  await ctx.settle();

  const paused = await ctx.readPaused();

  expect(paused).toStrictEqual({ cause: 'owner', recoveryID: null });

  const kinds = await ctx.readKinds();

  expect(kinds).toStrictEqual([{ kind: 'nixie.paused' }, { kind: 'spend.stop_tripped' }]);
});

test('it clears the stop at the reset and resumes a spending pause', async () => {
  const ctx = await setupTest();

  await ctx.trip();
  await ctx.settle();

  ctx.clock.advance(15 * 60 * 60 * 1000);
  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.settle();

  const paused = await ctx.readPaused();

  expect(paused).toBeNull();

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toBeNull();

  const rows = await sql`select payload from records where kind = 'spend.stop_cleared'`.execute(
    ctx.writer.db,
  );

  expect(rows).toMatchObject({
    rows: [{ payload: JSON.stringify({ reason: 'reset' }) }],
  });
});

test('it clears the stop as raised when the day is still running', async () => {
  const ctx = await setupTest();

  await ctx.trip();
  await ctx.settle();
  await ctx.raise(6);
  await ctx.settle();

  const rows = await sql`select payload from records where kind = 'spend.stop_cleared'`.execute(
    ctx.writer.db,
  );

  expect(rows).toMatchObject({
    rows: [{ payload: JSON.stringify({ reason: 'raised' }) }],
  });
});

test('it clears the stop and leaves nixie paused when its owner paused it during the stop', async () => {
  const ctx = await setupTest();

  await ctx.trip();
  await ctx.settle();
  await ctx.pauseBy('owner');
  await ctx.raise(6);
  await ctx.settle();

  const paused = await ctx.readPaused();

  expect(paused).toStrictEqual({ cause: 'owner', recoveryID: null });

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toBeNull();
});

test('it keeps the stop row when a resume of the pause is written by hand', async () => {
  const ctx = await setupTest();

  await ctx.trip();
  await ctx.settle();

  await withWriteTransaction(ctx.writer, (tx) =>
    resumeNixieInTransaction(tx, ctx.log, { by: 'host', definitions: ctx.context.definitions() }),
  );

  const pauseSince = await readPauseSince(ctx.writer.db);

  expect(pauseSince).toBeNull();

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({ reason: 'limit' });
});

test('it clears an unreachable stop when the gateway answers', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'refused' });

  await ctx.settle();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.settle();

  const rows =
    await sql`select kind, payload from records where kind like 'spend.%' order by sequence`.execute(
      ctx.writer.db,
    );

  expect(rows).toMatchObject({
    rows: [
      { kind: 'spend.stop_tripped' },
      { kind: 'spend.stop_cleared', payload: JSON.stringify({ reason: 'reachable' }) },
    ],
  });

  const paused = await ctx.readPaused();

  expect(paused).toBeNull();
});

test('it trips for the lost mark and keeps the stop until the mark is gone', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({
    kind: 'ok',
    value: buildMockGatewayStatus({ lost: true }),
  });

  await ctx.settle();
  await ctx.settle();

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({ reason: 'lost' });

  const paused = await ctx.readPaused();

  expect(paused).toStrictEqual({ cause: 'spending', recoveryID: null });
});

test('it replaces an unreachable stop with a limit trip in two records when the gateway answers with a trip', async () => {
  const ctx = await setupTest();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'unreachable', reason: 'refused' });

  await ctx.settle();

  ctx.gateway.readStatus.mockResolvedValue({ kind: 'ok', value: buildMockGatewayStatus() });

  await ctx.trip();
  await ctx.settle();

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({ reason: 'limit' });

  const paused = await ctx.readPaused();

  expect(paused).toStrictEqual({ cause: 'spending', recoveryID: null });
});

test('it trips by turns from the count of turn records alone', async () => {
  const ctx = await setupTest();

  await ctx.writeTurn('model.turn_ended');
  await ctx.writeTurn('worker.turn_ended');
  await ctx.writeTurn('model.turn_ended');
  await ctx.settle();

  const spendStopRow = await readSpendStopRow(ctx.writer.db);

  expect(spendStopRow).toMatchObject({
    reason: 'limit',
    period: 'day',
    measure: 'turns',
    limit: 3,
    spent: 3,
  });
});
