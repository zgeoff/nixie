import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { memoryItemKeysMigration } from './0066-memory-item-keys-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-item-keys-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, { schema: nixieSchema, copyDir: directory });

  return { db };
}

test('it is the migration of version 66', () => {
  expect(nixieSchema.migrations.indexOf(memoryItemKeysMigration) + 1).toBe(66);
});

test('it creates the 2 tables and their item indexes empty', async () => {
  const ctx = await setupTest();

  const names = await sql`select name from sqlite_master
    where name in ('memory_item_keys', 'memory_evidence_purges')
      or name in ('memory_item_keys_by_item', 'memory_evidence_purges_by_item')
    order by name`.execute(ctx.db);

  expect(names.rows).toStrictEqual([
    { name: 'memory_evidence_purges' },
    { name: 'memory_evidence_purges_by_item' },
    { name: 'memory_item_keys' },
    { name: 'memory_item_keys_by_item' },
  ]);
});

test('it keeps the rows when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into memory_item_keys (key_id, item_id, kind, from_sequence)
    values ('a/b', 'a', 'generation', 4)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryItemKeysMigration.up(tx));

  const rows = await sql`select key_id from memory_item_keys`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ key_id: 'a/b' }]);
});
