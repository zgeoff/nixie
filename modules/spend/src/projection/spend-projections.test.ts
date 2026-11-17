import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import { spendLimitRaisedCodec } from '../record/spend-limit-raised-codec';
import { spendStopClearedCodec } from '../record/spend-stop-cleared-codec';
import { spendStopTrippedCodec } from '../record/spend-stop-tripped-codec';
import { startTestSpend } from '../test-utils';
import { spendProjections } from './spend-projections';

async function setupTest() {
  const spend = await startTestSpend();

  const definitions = { snapshotHash: 'sha256:aa11' };

  return {
    ...spend,
    writeRecord: (input: Parameters<typeof writeRecordsInTransaction>[2][number]) =>
      withWriteTransaction(spend.writer, (tx) => writeRecordsInTransaction(tx, spend.log, [input])),
    definitions,
    readRows: async (table: string) => {
      const result = await sql`select * from ${sql.table(table)} order by 1`.execute(
        spend.writer.db,
      );

      return result.rows;
    },
  };
}

test('it lists the 3 projections by their tables', () => {
  expect(spendProjections.map((projection) => projection.table)).toStrictEqual([
    'spend_stop',
    'spend_raises',
    'spend_turns',
  ]);
});

test('it folds a trip by a limit into the one stop row', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({
    kind: 'spend.stop_tripped',
    definitions: ctx.definitions,
    payload: spendStopTrippedCodec.encode({
      reason: 'limit',
      period: 'day',
      measure: 'dollars',
      limit: 60,
      spent: 61.2,
      at: 1000,
      resetsAt: 2000,
    }),
  });

  const rows = await ctx.readRows('spend_stop');

  expect(rows).toMatchObject([
    {
      id: 1,
      reason: 'limit',
      period: 'day',
      measure: 'dollars',
      limit_amount: 60,
      spent_amount: 61.2,
      at: 1000,
      resets_at: 2000,
    },
  ]);
});

test('it replaces the stop row with a later trip, and a lost trip holds no period', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({
    kind: 'spend.stop_tripped',
    definitions: ctx.definitions,
    payload: spendStopTrippedCodec.encode({ reason: 'unreachable', at: 1000 }),
  });

  await ctx.writeRecord({
    kind: 'spend.stop_tripped',
    definitions: ctx.definitions,
    payload: spendStopTrippedCodec.encode({ reason: 'lost', at: 3000 }),
  });

  const rows = await ctx.readRows('spend_stop');

  expect(rows).toMatchObject([{ reason: 'lost', period: null, measure: null, at: 3000 }]);
});

test('it removes the stop row at a clear', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({
    kind: 'spend.stop_tripped',
    definitions: ctx.definitions,
    payload: spendStopTrippedCodec.encode({ reason: 'lost', at: 1000 }),
  });

  await ctx.writeRecord({
    kind: 'spend.stop_cleared',
    definitions: ctx.definitions,
    payload: spendStopClearedCodec.encode({ reason: 'lost_cleared' }),
  });

  const rows = await ctx.readRows('spend_stop');

  expect(rows).toStrictEqual([]);
});

test('it keeps the later raise of a day in place of the earlier one', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({
    kind: 'spend.limit_raised',
    definitions: ctx.definitions,
    payload: spendLimitRaisedCodec.encode({
      start: '2026-10-16',
      dollars: 90,
      tokens: 120_000_000,
      turns: 1500,
      by: 'session-a',
    }),
  });

  await ctx.writeRecord({
    kind: 'spend.limit_raised',
    definitions: ctx.definitions,
    payload: spendLimitRaisedCodec.encode({
      start: '2026-10-16',
      dollars: 100,
      tokens: 130_000_000,
      turns: 3000,
      by: 'host',
    }),
  });

  const rows = await ctx.readRows('spend_raises');

  expect(rows).toMatchObject([
    { start: '2026-10-16', dollars: 100, tokens: 130_000_000, turns: 3000, raised_by: 'host' },
  ]);
});

test('it counts each model turn record and each worker turn record once, in its 15-minute bucket', async () => {
  const ctx = await setupTest();

  const first = ctx.clock.now();

  await ctx.writeTurn('model.turn_ended');
  await ctx.writeTurn('worker.turn_ended');

  ctx.clock.advance(20 * 60 * 1000);

  await ctx.writeTurn('model.turn_ended');

  const rows = await ctx.readRows('spend_turns');

  expect(rows).toStrictEqual([
    { bucket_start: first, turns: 2 },
    { bucket_start: first + 15 * 60 * 1000, turns: 1 },
  ]);
});

test('it counts no other record', async () => {
  const ctx = await setupTest();

  await ctx.writeRecord({
    kind: 'spend.stop_cleared',
    definitions: ctx.definitions,
    payload: spendStopClearedCodec.encode({ reason: 'reset' }),
  });

  const rows = await ctx.readRows('spend_turns');

  expect(rows).toStrictEqual([]);
});
