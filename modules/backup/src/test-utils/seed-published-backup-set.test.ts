import { expect, test } from 'bun:test';
import { localDataStorage } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { seedPublishedBackupSet } from './seed-published-backup-set';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, context: { writer: log.writer, storage: localDataStorage } };
}

test('it writes a published set and answers its sequence', async () => {
  const ctx = await setupTest();
  const sequence = await seedPublishedBackupSet(ctx.context);
  const sets = await sql`select sequence, kind, state from backup_sets`.execute(ctx.writer.db);

  expect(sequence).toBe(1);
  expect(sets.rows).toStrictEqual([{ sequence: 1, kind: 'scheduled', state: 'published' }]);
});
