import { expect, test } from 'bun:test';
import { pauseNixieInTransaction } from '../pause/pause-nixie-in-transaction';
import { buildLogSeeder } from '../test-utils/build-log-seeder';
import { startTestLog } from '../test-utils/start-test-log';
import { subscribeToChanged } from './subscribe-to-changed';
import { withWriteTransaction } from './with-write-transaction';

async function setupTest() {
  const testLog = await startTestLog();

  const changes: (readonly string[])[] = [];

  subscribeToChanged(testLog.writer, (topics) => {
    changes.push(topics);
  });

  return { ...testLog, changes, seed: buildLogSeeder(testLog) };
}

test('it marks the tasks topic for a log reset on the started writer', async () => {
  const ctx = await setupTest();

  await ctx.seed.record({ kind: 'log_reset' });

  expect(ctx.changes).toStrictEqual([['tasks']]);
});

test('it marks the topics of a spend stop on the started writer', async () => {
  const ctx = await setupTest();

  await ctx.seed.spendStop();

  expect(ctx.changes).toStrictEqual([['spend', 'nixie', 'tasks']]);
});

test('it marks the topics of a pause on the started writer', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'session-a',
      definitions: { snapshotHash: 'sha256:aa11' },
    }),
  );

  expect(ctx.changes).toStrictEqual([['nixie', 'tasks']]);
});
