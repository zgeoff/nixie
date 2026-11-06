import { expect, test } from 'bun:test';
import { localDataStorage } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { writeSnapshotSet } from '../write-snapshot-set';
import { readTestBackupSets } from './read-test-backup-sets';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, context: { writer: log.writer, storage: localDataStorage } };
}

test('it reads each backup set with its kind and state, in sequence order', async () => {
  const ctx = await setupTest();

  await writeSnapshotSet(ctx.context, 'scheduled');
  await writeSnapshotSet(ctx.context, 'forget');

  const sets = await readTestBackupSets(ctx.writer);

  expect(sets).toStrictEqual([
    { sequence: 1, kind: 'scheduled', state: 'staged' },
    { sequence: 2, kind: 'forget', state: 'staged' },
  ]);
});
