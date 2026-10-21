import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { memorySubjectsMigration } from './memory-subjects-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-memory-subjects-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memorySubjectsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(db);

  return { db };
}

test('it moves the schema to version 18', () => {
  expect(nixieSchema.migrations.indexOf(memorySubjectsMigration) + 1).toBe(18);
});

test('it maps each self-note item to the self subject and every other item to owner', async () => {
  const ctx = await setupTest();

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, kind) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1, 'b7kq2m9xza', 'fact'),
    ('8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 1, 'active', 0, 1, 1, 'q4wz8n3vtc', 'self'),
    ('c91f3e06-7a2b-4d58-8e14-6b0d2f9a7c35', 2, 'retired', 0, 1, 1, 'm2hx6p9rke', 'fact')`.execute(
    ctx.db,
  );

  await ctx.db.transaction().execute((tx) => memorySubjectsMigration.up(tx));

  const rows = await sql`select item_id, kind, subject from memory_items order by item_id`.execute(
    ctx.db,
  );

  expect(rows.rows).toStrictEqual([
    { item_id: '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', kind: 'fact', subject: 'owner' },
    { item_id: '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', kind: 'self', subject: 'self' },
    { item_id: 'c91f3e06-7a2b-4d58-8e14-6b0d2f9a7c35', kind: 'fact', subject: 'owner' },
  ]);
});

test('it maps a self-note proposal to the self subject and a fact proposal to owner', async () => {
  const ctx = await setupTest();

  await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation,
    target_version, is_pinned, review_reason, status, action_hash, sealed, origin, source, cap_group,
    created_sequence, created_at, lapse_at, kind) values
    ('5a0e7c3d-2b9f-4f61-a8d4-3c6e1b7f0a92', '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 1, 'remember',
      null, 0, 'self_note', 'pending', 'hash-a', 'sealed-a', 'conversation', 'owner', 'group-a', 1,
      1767225600000, 1767830400000, 'self'),
    ('e4b8a1f5-9c3d-4a27-b6e0-7d2f5c8a1b43', '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'remember',
      null, 0, 'checker_unsure', 'pending', 'hash-b', 'sealed-b', 'memory_writer', 'owner',
      'group-b', 1, 1767225600000, 1767830400000, 'fact')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memorySubjectsMigration.up(tx));

  const rows = await sql`select proposal_id, subject from memory_proposals
    order by proposal_id`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([
    { proposal_id: '5a0e7c3d-2b9f-4f61-a8d4-3c6e1b7f0a92', subject: 'self' },
    { proposal_id: 'e4b8a1f5-9c3d-4a27-b6e0-7d2f5c8a1b43', subject: 'owner' },
  ]);
});

test('it runs again without a change', async () => {
  const ctx = await setupTest();

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, kind) values
    ('8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 1, 'active', 0, 1, 1, 'q4wz8n3vtc', 'self')`.execute(
    ctx.db,
  );

  await ctx.db.transaction().execute((tx) => memorySubjectsMigration.up(tx));
  await ctx.db.transaction().execute((tx) => memorySubjectsMigration.up(tx));

  const rows = await sql`select kind, subject from memory_items`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ kind: 'self', subject: 'self' }]);
});

test('it keeps the shared subject of an item and a proposal when it runs again', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => memorySubjectsMigration.up(tx));

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, kind, subject) values
    ('c91f3e06-7a2b-4d58-8e14-6b0d2f9a7c35', 1, 'active', 0, 1, 1, 'm2hx6p9rke', 'fact',
      'shared')`.execute(ctx.db);

  await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation,
    target_version, is_pinned, review_reason, status, action_hash, sealed, origin, source, cap_group,
    created_sequence, created_at, lapse_at, kind, subject) values
    ('e4b8a1f5-9c3d-4a27-b6e0-7d2f5c8a1b43', 'c91f3e06-7a2b-4d58-8e14-6b0d2f9a7c35', 1, 'remember',
      null, 0, 'no_quote', 'pending', 'hash-b', 'sealed-b', 'conversation', 'owner', 'group-b', 1,
      1767225600000, 1767830400000, 'fact', 'shared')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memorySubjectsMigration.up(tx));

  const [items, proposals] = await Promise.all([
    sql`select subject from memory_items`.execute(ctx.db),
    sql`select subject from memory_proposals`.execute(ctx.db),
  ]);

  expect(items.rows).toStrictEqual([{ subject: 'shared' }]);
  expect(proposals.rows).toStrictEqual([{ subject: 'shared' }]);
});

test('it leaves a row that the release before inserts afterwards with no subject', async () => {
  const ctx = await setupTest();

  await ctx.db.transaction().execute((tx) => memorySubjectsMigration.up(tx));

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, kind) values
    ('8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 1, 'active', 0, 1, 1, 'q4wz8n3vtc', 'self')`.execute(
    ctx.db,
  );

  const rows = await sql`select kind, subject from memory_items`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ kind: 'self', subject: null }]);
});
