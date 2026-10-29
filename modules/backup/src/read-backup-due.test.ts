import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { readBackupDue } from './read-backup-due';

test('it reads no set and no forget in a new log', async () => {
  const log = await startTestLog();
  const due = await readBackupDue(log.writer);

  expect(due).toStrictEqual({
    isForgetDue: false,
    isSetWaiting: false,
    newestStagedAt: null,
  });
});

test('it reads a forget as due once its record is newer than every set copy', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (9, 1798761600000, 'memory.forgotten', 'snapshot-a', '{}')`.execute(tx);

    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'scheduled', 'published', 8, 1798761500000)`.execute(tx);
  });

  const due = await readBackupDue(log.writer);

  expect(due).toStrictEqual({
    isForgetDue: true,
    isSetWaiting: false,
    newestStagedAt: 1_798_761_500_000,
  });
});

test('it reads a forget as covered by a set whose copy started after it', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (9, 1798761600000, 'memory.forgotten', 'snapshot-a', '{}')`.execute(tx);

    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'forget', 'staged', 9, 1798761600000)`.execute(tx);
  });

  const due = await readBackupDue(log.writer);

  expect(due).toStrictEqual({
    isForgetDue: false,
    isSetWaiting: true,
    newestStagedAt: 1_798_761_600_000,
  });
});

test('it leaves an abandoned set out, so its forget stays due', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (9, 1798761600000, 'memory.forgotten', 'snapshot-a', '{}')`.execute(tx);

    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'forget', 'abandoned', 9, 1798761600000)`.execute(tx);
  });

  const due = await readBackupDue(log.writer);

  expect(due).toStrictEqual({
    isForgetDue: true,
    isSetWaiting: false,
    newestStagedAt: null,
  });
});
