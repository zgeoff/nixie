import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { memorySubjectChangesMigration } from './memory-subject-changes-migration';
import { nixieSchema } from './nixie-schema';
import { readQueryRows } from './read-query-rows';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-memory-subject-changes-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memorySubjectChangesMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db };
}

test('it moves the schema to version 31, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(memorySubjectChangesMigration) + 1).toBe(31);
  expect(nixieSchema.oldestReader).toBeLessThan(31);
});

test('it gives every proposal no subject change and leaves its other fields and the count unchanged', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.proposed', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation,
    target_version, is_pinned, review_reason, status, action_hash, sealed, origin, source, cap_group,
    created_sequence, created_at, lapse_at, kind, subject) values
    ('6b1f8d4e-3c0a-4e72-b9e5-4d7f2c9b1a03', '2e7a9c15-6d3b-4f80-a1c4-8b5e0d3f7a26', 0, 'remember',
      3, 0, 'no_quote', 'pending', 'hash-c', 'sealed-c', 'task', 'untrusted', 'group-c', 1,
      1767225600000, 1767830400000, 'fact', 'shared'),
    ('f5c9b2a6-0d4e-4b38-8f17-9e3a6d1c4b52', '7c4d1e93-5a8f-4b26-9d0e-2f6b8a3c5e71', 1, 'remember',
      null, 0, 'self_note', 'consumed', 'hash-d', 'sealed-d', 'conversation', 'owner', 'group-d', 1,
      1767225600000, 1767830400000, 'self', 'self')`.execute(ctx.db);

  const before = await readQueryRows(
    sql`select * from memory_proposals order by proposal_id`,
    ctx.db,
    z.record(z.string(), z.unknown()),
  );

  await ctx.db.transaction().execute((tx) => memorySubjectChangesMigration.up(tx));

  const after = await sql`select * from memory_proposals order by proposal_id`.execute(ctx.db);
  const changes = await sql`select new_subject from memory_proposals`.execute(ctx.db);

  expect(after.rows).toStrictEqual(before.map((row) => expect.objectContaining(row)));
  expect(changes.rows).toStrictEqual([{ new_subject: null }, { new_subject: null }]);
});

test('it keeps a subject change when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.proposed', 'snapshot-a', '{}')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memorySubjectChangesMigration.up(tx));

  await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation,
    target_version, is_pinned, review_reason, status, action_hash, sealed, origin, source, cap_group,
    created_sequence, created_at, lapse_at, kind, subject, new_subject) values
    ('6b1f8d4e-3c0a-4e72-b9e5-4d7f2c9b1a03', '2e7a9c15-6d3b-4f80-a1c4-8b5e0d3f7a26', 0, 'remember',
      3, 0, 'subject_change', 'pending', 'hash-c', 'sealed-c', 'conversation', 'owner', 'group-c', 1,
      1767225600000, 1767830400000, 'fact', 'owner', 'shared')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memorySubjectChangesMigration.up(tx));

  const rows = await sql`select new_subject from memory_proposals`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ new_subject: 'shared' }]);
});
