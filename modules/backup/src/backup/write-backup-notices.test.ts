import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localDataStorage, subscribeToChanged } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { backupSetLayout, getBackupSetDir } from '@heynixie/wire';
import { getBackupStagingDir } from './get-backup-staging-dir';
import { writeBackupNotices } from './write-backup-notices';
import { writeReceivedReceipts } from './write-received-receipts';
import { writeSnapshotSet } from './write-snapshot-set';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, context: { writer: log.writer, storage: localDataStorage } };
}

test('it raises a failed notice for a set whose receipt nixie refused', async () => {
  const ctx = await setupTest();

  await writeSnapshotSet(ctx.context, 'scheduled');

  const setDir = getBackupSetDir(getBackupStagingDir(ctx.dataDir), 1);

  await writeFile(join(setDir, backupSetLayout.receipt), '{"format": 1, "sequence": 9}');
  await writeReceivedReceipts(ctx.context);

  const notices = await writeBackupNotices(ctx.context, 3_600_000);

  expect(notices).toStrictEqual([{ sequence: 1, cause: 'failed', raisedAt: ctx.clock.now() }]);
});

test('it names the backups topic when it raises a notice', async () => {
  const ctx = await setupTest();

  const changes: (readonly string[])[] = [];

  await writeSnapshotSet(ctx.context, 'scheduled');

  const setDir = getBackupSetDir(getBackupStagingDir(ctx.dataDir), 1);

  await writeFile(join(setDir, backupSetLayout.receipt), '{"format": 1, "sequence": 9}');
  await writeReceivedReceipts(ctx.context);

  subscribeToChanged(ctx.writer, (topics) => {
    changes.push(topics);
  });

  await writeBackupNotices(ctx.context, 3_600_000);

  expect(changes.filter((topics) => topics.includes('backups'))).toStrictEqual([['backups']]);
});

test('it names no topic when it raises no notice', async () => {
  const ctx = await setupTest();

  const changes: (readonly string[])[] = [];

  subscribeToChanged(ctx.writer, (topics) => {
    changes.push(topics);
  });

  await writeBackupNotices(ctx.context, 3_600_000);

  expect(changes).toStrictEqual([]);
});
