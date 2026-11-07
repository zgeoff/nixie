import { expect, test } from 'bun:test';
import { localDataStorage } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { seedFailedBackupNotice } from './seed-failed-backup-notice';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, context: { writer: log.writer, storage: localDataStorage } };
}

test('it writes a failed set whose receipt holds the failure it is given', async () => {
  const ctx = await setupTest();

  await seedFailedBackupNotice(ctx.context, { failure: 'data: backup exited 1' });

  const sets = await sql`select * from backup_sets`.execute(ctx.writer.db);

  expect(sets.rows).toMatchObject([
    {
      sequence: 1,
      kind: 'scheduled',
      state: 'failed',
      receipt: expect.stringMatching(/"failure": ?"data: backup exited 1"/u),
    },
  ]);
});

test('it writes the failed notice of that set', async () => {
  const ctx = await setupTest();

  await seedFailedBackupNotice(ctx.context, { failure: 'keys: prune exited 1' });

  const notices = await sql`select * from backup_notices`.execute(ctx.writer.db);

  expect(notices.rows).toMatchObject([
    { sequence: 1, cause: 'failed', raised_at: ctx.clock.now() },
  ]);
});
