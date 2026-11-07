import { expect, test } from 'bun:test';
import { localDataStorage } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { readBackupHealth } from '../read-backup-health';
import { seedFailedBackupNotice } from './seed-failed-backup-notice';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, context: { writer: log.writer, storage: localDataStorage } };
}

test('it raises the failed notice that the backup health reads', async () => {
  const ctx = await setupTest();
  const notice = await seedFailedBackupNotice(ctx.context, { failure: 'data: backup exited 1' });
  const health = await readBackupHealth(ctx.writer);

  expect(health.notice).toStrictEqual(notice);
});
