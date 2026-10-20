import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { memoryConsolidationCommentsMigration } from './memory-consolidation-comments-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-change-comments-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  // the schema the release before leaves, which the migration starts from
  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryConsolidationCommentsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  // a record and a diff for the changes to hang under, which their foreign keys need
  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.consolidation_proposed', 'snapshot-a', '{}')`.execute(db);

  await sql`insert into memory_consolidations (diff_id, model, changes, shown_items, sequence,
    created_at) values ('diff-1', 'claude-test-1', 2, 2, 1, 1767225600000)`.execute(db);

  return { db };
}

test('it moves the schema to version 13', () => {
  expect(nixieSchema.migrations.indexOf(memoryConsolidationCommentsMigration) + 1).toBe(13);
});

test('it backfills each existing change with the short ID its UUID gives and no comment', async () => {
  const ctx = await setupTest();

  await sql`insert into memory_consolidation_changes (change_id, diff_id, position, kind, item_id,
    inputs, source, status, action_hash, sealed, model, created_sequence, created_at, lapse_at)
    values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 'diff-1', 0, 'retire', 'item-1', '[]', 'owner',
      'pending', 'sha256:a', 'c2VhbGVk', 'claude-test-1', 1, 1767225600000, 1767830400000),
    ('b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94', 'diff-1', 1, 'retire', 'item-2', '[]', 'owner',
      'rejected', 'sha256:b', 'c2VhbGVk', 'claude-test-1', 1, 1767225600000, 1767830400000)`.execute(
    ctx.db,
  );

  await ctx.db.transaction().execute((tx) => memoryConsolidationCommentsMigration.up(tx));

  const rows = await sql`select change_id, short_id, comment, comment_sequence
    from memory_consolidation_changes order by change_id`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    {
      change_id: '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13',
      short_id: 'as2nducz6x',
      comment: null,
      comment_sequence: null,
    },
    {
      change_id: 'b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94',
      short_id: 'fhtocv6232',
      comment: null,
      comment_sequence: null,
    },
  ]);
});

test('it leaves the short IDs as they are when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into memory_consolidation_changes (change_id, diff_id, position, kind, item_id,
    inputs, source, status, action_hash, sealed, model, created_sequence, created_at, lapse_at)
    values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 'diff-1', 0, 'retire', 'item-1', '[]', 'owner',
      'pending', 'sha256:a', 'c2VhbGVk', 'claude-test-1', 1, 1767225600000, 1767830400000)`.execute(
    ctx.db,
  );

  await ctx.db.transaction().execute((tx) => memoryConsolidationCommentsMigration.up(tx));

  await sql`insert into memory_consolidation_changes (change_id, diff_id, position, kind, item_id,
    inputs, source, status, action_hash, sealed, model, created_sequence, created_at, lapse_at,
    short_id) values
    ('b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94', 'diff-1', 1, 'retire', 'item-2', '[]', 'owner',
      'pending', 'sha256:b', 'c2VhbGVk', 'claude-test-1', 1, 1767225600000, 1767830400000,
      'k3x9m2p7qa')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryConsolidationCommentsMigration.up(tx));

  const rows = await sql`select change_id, short_id from memory_consolidation_changes
    order by change_id`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { change_id: '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', short_id: 'as2nducz6x' },
    { change_id: 'b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94', short_id: 'k3x9m2p7qa' },
  ]);
});
