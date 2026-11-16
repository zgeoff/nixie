import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { memoryLabelsMigration } from './0059-memory-labels-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-memory-labels-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryLabelsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 59', () => {
  expect(nixieSchema.migrations.indexOf(memoryLabelsMigration) + 1).toBe(59);
});

test('it keeps an item row in the shape of version 58 and gives it no label edits', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence) values ('c2hd81mmqa', 1, 'active', 0, 1, 1)`.execute(ctx.db);

  const rows = await sql`select item_id, version, label_edits from memory_items`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ item_id: 'c2hd81mmqa', version: 1, label_edits: 0 }]);
});

test('it adds the label columns of a proposal with their defaults', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const columns = await sql`select name, "notnull" as is_required, dflt_value
    from pragma_table_info('memory_proposals')
    where name in ('sealed_labels', 'target_revision', 'is_label_only') order by name`.execute(
    ctx.db,
  );

  expect(columns.rows).toStrictEqual([
    { name: 'is_label_only', is_required: 1, dflt_value: '0' },
    { name: 'sealed_labels', is_required: 0, dflt_value: null },
    { name: 'target_revision', is_required: 0, dflt_value: null },
  ]);
});

test('it runs a second time without error and keeps the label table', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await ctx.db.transaction().execute((tx) => memoryLabelsMigration.up(tx));

  const columns = await sql`select name from pragma_table_info('memory_labels')
    order by cid`.execute(ctx.db);

  expect(columns.rows).toStrictEqual(
    [
      'item_id',
      'revision',
      'version',
      'change',
      'sealed',
      'origin',
      'source',
      'task_id',
      'proposal_id',
      'model',
      'sequence',
      'recorded_at',
    ].map((name) => ({ name })),
  );
});
