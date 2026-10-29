import { expect, test } from 'bun:test';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localDataStorage, withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { removeAbandonedSets } from './remove-abandoned-sets';

async function setupTest() {
  const log = await startTestLog();

  await mkdir(join(log.dataDir, 'backup'));

  return { ...log, context: { writer: log.writer, storage: localDataStorage } };
}

test('it removes a set whose copy stopped before its marker, and abandons its row', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (4, 'scheduled', 'staging', 0, 1798761600000)`.execute(tx);
  });

  await mkdir(join(ctx.dataDir, 'backup', '000000000004'));
  await writeFile(join(ctx.dataDir, 'backup', '000000000004', 'nixie.db'), 'a part copy');

  const abandoned = await removeAbandonedSets(ctx.context);
  const names = await readdir(join(ctx.dataDir, 'backup'));
  const rows = await sql`select sequence, state from backup_sets`.execute(ctx.writer.db);

  expect(abandoned).toStrictEqual({ sequences: [4] });
  expect(names).toStrictEqual([]);
  expect(rows.rows).toStrictEqual([{ sequence: 4, state: 'abandoned' }]);
});

test('it keeps a set that holds its marker, and stages the row of one whose start crashed after the marker', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (5, 'forget', 'staging', 0, 1798761600000)`.execute(tx);
  });

  await mkdir(join(ctx.dataDir, 'backup', '000000000005'));
  await writeFile(join(ctx.dataDir, 'backup', '000000000005', 'complete'), '');

  const abandoned = await removeAbandonedSets(ctx.context);
  const names = await readdir(join(ctx.dataDir, 'backup'));
  const rows = await sql`select sequence, state from backup_sets`.execute(ctx.writer.db);

  expect(abandoned).toStrictEqual({ sequences: [] });
  expect(names).toStrictEqual(['000000000005']);
  expect(rows.rows).toStrictEqual([{ sequence: 5, state: 'staged' }]);
});

test('it abandons a staged set whose directory is gone, so no receipt can answer it', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (6, 'scheduled', 'staged', 0, 1798761600000)`.execute(tx);
  });

  const abandoned = await removeAbandonedSets(ctx.context);

  expect(abandoned).toStrictEqual({ sequences: [6] });
});

test('it never removes a file in staging that is no set', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'backup', 'notes.txt'), 'kept by the operator');
  await removeAbandonedSets(ctx.context);

  const names = await readdir(join(ctx.dataDir, 'backup'));

  expect(names).toStrictEqual(['notes.txt']);
});
