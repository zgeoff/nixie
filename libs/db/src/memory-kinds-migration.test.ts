import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { memoryKindsMigration } from './memory-kinds-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-memory-kinds-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryKindsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db };
}

test('it moves the schema to version 16', () => {
  expect(nixieSchema.migrations.indexOf(memoryKindsMigration) + 1).toBe(16);
});

test('it gives every existing item the fact kind, and runs again without a change', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1, 'b7kq2m9xza')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryKindsMigration.up(tx));
  await ctx.db.transaction().execute((tx) => memoryKindsMigration.up(tx));

  const rows = await sql`select item_id, kind from memory_items`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { item_id: '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', kind: 'fact' },
  ]);
});

test('it adds the kind to memory proposals', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1, 'b7kq2m9xza')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryKindsMigration.up(tx));

  const columns = await sql`select name, dflt_value from pragma_table_info('memory_proposals')
    where name = 'kind'`.execute(ctx.db);

  expect(columns.rows).toStrictEqual([{ name: 'kind', dflt_value: "'fact'" }]);
});
