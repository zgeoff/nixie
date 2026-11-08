import { expect, test } from 'bun:test';
import { localDataStorage } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { writeReceivedReceipts } from '../write-received-receipts';
import { writeSnapshotSet } from '../write-snapshot-set';
import { writeTestBackupReceipt } from './write-test-backup-receipt';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, context: { writer: log.writer, storage: localDataStorage } };
}

test('it writes a published receipt that nixie records for its set', async () => {
  const ctx = await setupTest();

  await writeSnapshotSet(ctx.context, 'scheduled');
  await writeTestBackupReceipt(ctx.dataDir, { sequence: 1, status: 'published' });

  const received = await writeReceivedReceipts(ctx.context);

  expect(received).toStrictEqual([{ sequence: 1, status: 'published', failure: null }]);
});

test('it writes a failed receipt that nixie records with its failure', async () => {
  const ctx = await setupTest();

  await writeSnapshotSet(ctx.context, 'forget');

  await writeTestBackupReceipt(ctx.dataDir, {
    sequence: 1,
    status: 'failed',
    failure: 'keys: prune exited 1',
  });

  const received = await writeReceivedReceipts(ctx.context);

  expect(received).toStrictEqual([
    { sequence: 1, status: 'failed', failure: 'keys: prune exited 1' },
  ]);
});
