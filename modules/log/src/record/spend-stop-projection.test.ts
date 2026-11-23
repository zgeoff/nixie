import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { spendStopClearedCodec } from '../pause/spend-stop-cleared-codec';
import { spendStopTrippedCodec } from '../pause/spend-stop-tripped-codec';
import { startTestLog } from '../test-utils/start-test-log';
import { writeRecords } from './write-records';

async function setupTest() {
  const log = await startTestLog();

  const definitions = { snapshotHash: 'sha256:aa11' };

  return {
    ...log,
    writeTrip: (payload: Parameters<typeof spendStopTrippedCodec.encode>[0]) =>
      writeRecords(log.log, [
        { kind: 'spend.stop_tripped', definitions, payload: spendStopTrippedCodec.encode(payload) },
      ]),
    writeClear: () =>
      writeRecords(log.log, [
        {
          kind: 'spend.stop_cleared',
          definitions,
          payload: spendStopClearedCodec.encode({ reason: 'lost_cleared' }),
        },
      ]),
    readRows: async () => {
      const result = await sql`select * from spend_stop order by 1`.execute(log.writer.db);

      return result.rows;
    },
  };
}

test('it folds a trip by a limit into the one stop row', async () => {
  const ctx = await setupTest();

  await ctx.writeTrip({
    reason: 'limit',
    period: 'day',
    measure: 'dollars',
    limit: 60,
    spent: 61.2,
    at: 1000,
    resetsAt: 2000,
  });

  const rows = await ctx.readRows();

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

  await ctx.writeTrip({ reason: 'unreachable', at: 1000 });
  await ctx.writeTrip({ reason: 'lost', at: 3000 });

  const rows = await ctx.readRows();

  expect(rows).toMatchObject([{ reason: 'lost', period: null, measure: null, at: 3000 }]);
});

test('it removes the stop row at a clear', async () => {
  const ctx = await setupTest();

  await ctx.writeTrip({ reason: 'lost', at: 1000 });
  await ctx.writeClear();

  const rows = await ctx.readRows();

  expect(rows).toStrictEqual([]);
});
