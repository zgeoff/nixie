import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import { sql } from 'kysely';
import { writeRecords } from '../write-records';
import { startTestLog } from './start-test-log';
import { withReadSnapshot } from './with-read-snapshot';

async function setupTest() {
  const started = await startTestLog();

  const readerDB = startDatabase(join(started.dataDir, 'nixie.db'));

  onTestFinished(() => readerDB.destroy());

  return { log: started.log, readerDB };
}

test('it hides a commit from another connection until the callback settles', async () => {
  const ctx = await setupTest();

  const countInside = await withReadSnapshot(ctx.readerDB, async () => {
    await writeRecords(ctx.log, [
      { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
    ]);

    return sql<{ n: number }>`select count(*) as n from records`.execute(ctx.readerDB);
  });

  const countAfter = await sql<{ n: number }>`select count(*) as n from records`.execute(
    ctx.readerDB,
  );

  expect(countInside.rows).toStrictEqual([{ n: 0 }]);
  expect(countAfter.rows).toStrictEqual([{ n: 1 }]);
});

test('it ends the snapshot when the callback throws', async () => {
  const ctx = await setupTest();

  const failed = withReadSnapshot(ctx.readerDB, () => Promise.reject(new Error('callback failed')));

  await expect(failed).toReject();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  const countAfter = await sql<{ n: number }>`select count(*) as n from records`.execute(
    ctx.readerDB,
  );

  expect(countAfter.rows).toStrictEqual([{ n: 1 }]);
});
