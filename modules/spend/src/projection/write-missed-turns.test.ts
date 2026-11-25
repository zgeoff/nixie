import { expect, test } from 'bun:test';
import { logProjections, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { TriggersRecordKind } from '@heynixie/triggers';
import { sql } from 'kysely';
import { startTestSpend } from '../test-utils';
import { writeMissedTurns } from './write-missed-turns';

async function setupTest() {
  const spend = await startTestSpend();

  // the release before folds no spend table
  const olderLog = { ...spend.log, projections: logProjections };

  return {
    ...spend,
    writeOlderRecord: (
      kind: 'model.turn_ended' | 'worker.turn_ended' | 'task.created' | TriggersRecordKind,
    ) =>
      withWriteTransaction(spend.writer, (tx) =>
        writeRecordsInTransaction(tx, olderLog, [
          { kind, definitions: { snapshotHash: 'sha256:aa11' }, thread: 'task-a', payload: {} },
        ]),
      ),
    writeMissedTurns: () => writeMissedTurns(spend.writer),
    readBuckets: async () => {
      const result = await sql`select bucket_start, turns from spend_turns
        order by bucket_start`.execute(spend.writer.db);

      return result.rows;
    },
  };
}

test('it counts the turn records that no fold counted into their 15-minute buckets', async () => {
  const ctx = await setupTest();

  const startMs = ctx.clock.now();

  await ctx.writeOlderRecord('model.turn_ended');
  await ctx.writeOlderRecord('task.created');

  ctx.clock.advance(15 * 60 * 1000);

  await ctx.writeOlderRecord('worker.turn_ended');

  const counted = await ctx.writeMissedTurns();
  const buckets = await ctx.readBuckets();

  expect(counted).toBe(2);

  expect(buckets).toStrictEqual([
    { bucket_start: startMs, turns: 1 },
    { bucket_start: startMs + 15 * 60 * 1000, turns: 1 },
  ]);
});

test('it counts only the turns written after the last turn a fold counted', async () => {
  const ctx = await setupTest();

  const startMs = ctx.clock.now();

  await ctx.writeTurn();
  await ctx.writeOlderRecord('model.turn_ended');

  const counted = await ctx.writeMissedTurns();
  const buckets = await ctx.readBuckets();

  expect(counted).toBe(1);
  expect(buckets).toStrictEqual([{ bucket_start: startMs, turns: 2 }]);
});

test('it counts nothing on a second start', async () => {
  const ctx = await setupTest();

  await ctx.writeOlderRecord('model.turn_ended');
  await ctx.writeMissedTurns();

  const counted = await ctx.writeMissedTurns();

  expect(counted).toBe(0);
});
