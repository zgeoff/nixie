import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { readBackupHealth } from './read-backup-health';

test('it reads no upload, no set and no notice before the first set stages', async () => {
  const log = await startTestLog();
  const health = await readBackupHealth(log.writer);

  expect(health).toStrictEqual({ lastUploadAt: null, newestSetAt: null, notice: null });
});

test('it reads the last upload from published sets only, and the newest set that is not abandoned', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at, received_at)
      values (1, 'scheduled', 'published', 8, 1798761600000, 1798761660000),
        (2, 'scheduled', 'failed', 9, 1798765200000, 1798765260000),
        (3, 'scheduled', 'staged', 10, 1798768800000, null),
        (4, 'forget', 'abandoned', 11, 1798768900000, null)`.execute(tx);
  });

  const health = await readBackupHealth(log.writer);

  expect(health).toStrictEqual({
    lastUploadAt: 1_798_761_660_000,
    newestSetAt: 1_798_768_800_000,
    notice: null,
  });
});

test('it reads the newest notice since the last published set', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at, received_at)
      values (1, 'scheduled', 'failed', 8, 1798761600000, 1798761660000),
        (2, 'scheduled', 'staged', 9, 1798765200000, null)`.execute(tx);

    await sql`insert into backup_notices (sequence, cause, raised_at)
      values (1, 'failed', 1798761660000), (2, 'missing', 1798768800000)`.execute(tx);
  });

  const health = await readBackupHealth(log.writer);

  expect(health.notice).toStrictEqual({
    sequence: 2,
    cause: 'missing',
    raisedAt: 1_798_768_800_000,
  });
});

test('it reads no notice once a newer set published', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at, received_at)
      values (1, 'scheduled', 'failed', 8, 1798761600000, 1798761660000),
        (2, 'scheduled', 'published', 9, 1798765200000, 1798765260000)`.execute(tx);

    await sql`insert into backup_notices (sequence, cause, raised_at)
      values (1, 'failed', 1798761660000)`.execute(tx);
  });

  const health = await readBackupHealth(log.writer);

  expect(health.notice).toBeNull();
});
