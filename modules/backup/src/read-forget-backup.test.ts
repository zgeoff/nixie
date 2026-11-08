import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { readForgetBackup } from './read-forget-backup';

test('it reads a forget as pending while only a set that copied before it published', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'scheduled', 'published', 8, 1798761500000)`.execute(tx);
  });

  const backup = await readForgetBackup(log.writer, 9);

  expect(backup).toStrictEqual({ state: 'pending' });
});

test('it reads a forget as pending while a newer set waits after a failed one', async () => {
  const log = await startTestLog();

  const receipt = JSON.stringify({
    format: 1,
    sequence: 1,
    writtenAt: 1_798_761_660_000,
    status: 'failed',
    dataSnapshotID: null,
    keySnapshotID: null,
    removedKeySnapshotIDs: [],
    prune: 'failed',
    check: 'not-run',
    failure: 'keys: prune exited 1',
  });

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at, received_at, receipt)
      values (1, 'forget', 'failed', 9, 1798761600000, 1798761660000, ${receipt})`.execute(tx);

    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (2, 'scheduled', 'staged', 10, 1798765200000)`.execute(tx);
  });

  const backup = await readForgetBackup(log.writer, 9);

  expect(backup).toStrictEqual({ state: 'pending' });
});

test('it reads a forget as complete once a set that copied at its record published', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'forget', 'published', 9, 1798761600000)`.execute(tx);
  });

  const backup = await readForgetBackup(log.writer, 9);

  expect(backup).toStrictEqual({ state: 'complete' });
});

test('it reads the failure of the newest set that covers the forget', async () => {
  const log = await startTestLog();

  const receipt = JSON.stringify({
    format: 1,
    sequence: 2,
    writtenAt: 1_798_761_660_000,
    status: 'failed',
    dataSnapshotID: null,
    keySnapshotID: null,
    removedKeySnapshotIDs: [],
    prune: 'failed',
    check: 'not-run',
    failure: 'keys: prune exited 1',
  });

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'forget', 'abandoned', 9, 1798761600000)`.execute(tx);

    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at, received_at, receipt)
      values (2, 'forget', 'failed', 9, 1798761600000, 1798761660000, ${receipt})`.execute(tx);
  });

  const backup = await readForgetBackup(log.writer, 9);

  expect(backup).toStrictEqual({ state: 'failed', failure: 'keys: prune exited 1' });
});
