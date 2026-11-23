import { expect, test } from 'bun:test';
import { withWriteTransaction } from '../record/with-write-transaction';
import { writeRecordsInTransaction } from '../record/write-records-in-transaction';
import { buildLogSeeder } from '../test-utils/build-log-seeder';
import { startTestLog } from '../test-utils/start-test-log';
import { readSpendStopSince } from './read-spend-stop-since';
import { spendStopClearedCodec } from './spend-stop-cleared-codec';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, seed: buildLogSeeder(log) };
}

test('it reads null while no stop stands', async () => {
  const ctx = await setupTest();
  const since = await readSpendStopSince(ctx.writer.db);

  expect(since).toBeNull();
});

test('it reads the time of the record that set the stop, and the time of a later trip that replaces it', async () => {
  const ctx = await setupTest();

  await ctx.seed.spendStop();

  ctx.clock.advance(60_000);

  const replacedAt = ctx.clock.now();

  await ctx.seed.spendStop();

  const since = await readSpendStopSince(ctx.writer.db);

  expect(since).toBe(replacedAt);
});

test('it reads null after the stop clears', async () => {
  const ctx = await setupTest();

  await ctx.seed.spendStop();

  await withWriteTransaction(ctx.writer, (tx) =>
    writeRecordsInTransaction(tx, ctx.log, [
      {
        kind: 'spend.stop_cleared',
        definitions: { snapshotHash: 'sha256:test' },
        payload: spendStopClearedCodec.encode({ reason: 'reset' }),
      },
    ]),
  );

  const since = await readSpendStopSince(ctx.writer.db);

  expect(since).toBeNull();
});
