import { expect, test } from 'bun:test';
import { readQueryRows } from '@heynixie/db';
import { sql } from 'kysely';
import { z } from 'zod';
import { startTestLog } from '../test-utils/start-test-log';
import { createRecordKey } from './create-record-key';
import { removeRecordKeyFamily } from './remove-record-key-family';

async function setupTest() {
  const ctx = await startTestLog();

  return {
    ...ctx,
    readKeyIDs: async () => {
      const rows = await readQueryRows(
        sql`select key_id from record_keys order by key_id`,
        ctx.writer.keys,
        z.object({ key_id: z.string() }),
      );

      return rows.map((row) => row.key_id);
    },
  };
}

test('it removes the root key and every key under its slash and keeps the rest', async () => {
  const ctx = await setupTest();

  const root = 'c1f0aa00-0000-4000-8000-000000000001';
  const other = 'c1f0aa00-0000-4000-8000-000000000002';

  for (const keyID of [root, `${root}/a`, `${root}/b`, `${root}x`, `${root}-y`, `${other}/a`]) {
    await createRecordKey(ctx.log, keyID);
  }

  await removeRecordKeyFamily(ctx.log, root);

  const keyIDs = await ctx.readKeyIDs();

  expect(keyIDs).toStrictEqual([`${root}-y`, `${root}x`, `${other}/a`].toSorted());
});

test('it removes a family whose root has no key of its own', async () => {
  const ctx = await setupTest();

  const root = 'c1f0aa00-0000-4000-8000-000000000003';

  await createRecordKey(ctx.log, `${root}/a`);
  await removeRecordKeyFamily(ctx.log, root);

  const keyIDs = await ctx.readKeyIDs();

  expect(keyIDs).toStrictEqual([]);
});

test('it treats percent and underscore in the root as plain characters', async () => {
  const ctx = await setupTest();

  await createRecordKey(ctx.log, 'a_b/1');
  await createRecordKey(ctx.log, 'axb/1');
  await removeRecordKeyFamily(ctx.log, 'a_b');

  const keyIDs = await ctx.readKeyIDs();

  expect(keyIDs).toStrictEqual(['axb/1']);
});

test('it refuses under a stale writer epoch and keeps every key', async () => {
  const ctx = await setupTest();

  const root = 'c1f0aa00-0000-4000-8000-000000000004';

  await createRecordKey(ctx.log, root);
  await createRecordKey(ctx.log, `${root}/a`);

  await sql`update writer_epoch set epoch = epoch + 1`.execute(ctx.writer.db);

  const remove = removeRecordKeyFamily(ctx.log, root);

  await remove.catch(() => {});

  expect(remove).rejects.toMatchObject({ name: 'StaleWriterError' });

  const keyIDs = await ctx.readKeyIDs();

  expect(keyIDs).toStrictEqual([root, `${root}/a`]);
});
