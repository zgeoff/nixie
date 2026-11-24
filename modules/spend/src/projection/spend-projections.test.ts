import { expect, test } from 'bun:test';
import {
  spendStopClearedCodec,
  withWriteTransaction,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { sql } from 'kysely';
import { spendLimitRaisedCodec } from '../record/spend-limit-raised-codec';
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

test('it lists the 2 projections by their tables', () => {
  expect(spendProjections.map((projection) => projection.table)).toStrictEqual([
    'spend_raises',
    'spend_turns',
  ]);
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
