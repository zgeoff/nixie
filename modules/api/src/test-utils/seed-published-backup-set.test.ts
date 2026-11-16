import { expect, test } from 'bun:test';
import { readTestBackupSets } from '@heynixie/backup/test-utils';
import { seedPublishedBackupSet } from './seed-published-backup-set';
import { startTestAPI } from './start-test-api';

function setupTest() {
  return startTestAPI();
}

test('it seeds a published set', async () => {
  const ctx = await setupTest();

  await seedPublishedBackupSet(ctx.writer, { sequence: 1, logHead: 12 });

  const sets = await readTestBackupSets(ctx.writer);

  expect(sets).toStrictEqual([{ sequence: 1, kind: 'scheduled', state: 'published' }]);
});
