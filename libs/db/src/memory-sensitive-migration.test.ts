import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { z } from 'zod';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { memorySensitiveMigration } from './memory-sensitive-migration';
import { nixieSchema } from './nixie-schema';
import { readQueryRows } from './read-query-rows';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-memory-sensitive-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memorySensitiveMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db };
}

test('it moves the schema to version 29, which the release before can still read', () => {
  expect(nixieSchema.migrations.indexOf(memorySensitiveMigration) + 1).toBe(29);
  expect(nixieSchema.oldestReader).toBeLessThan(29);
});

test('it marks every item not sensitive and leaves its other fields and the count unchanged', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}'),
      (2, 1767225660000, 'memory.pinned', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_items (item_id, version, state, is_pinned, pinned_sequence,
    created_sequence, updated_sequence, forgotten_sequence, short_id, kind, subject, until) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 1, 2, 1, 2, null, 'b7kq2m9xza', 'fact',
      'owner', 1769904000000),
    ('8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 3, 'retired', 0, null, 1, 1, null, 'q4wz8n3vtc',
      'self', 'self', null),
    ('c91f3e06-7a2b-4d58-8e14-6b0d2f9a7c35', 2, 'forgotten', 0, null, 1, 2, 2, 'm2hx6p9rke',
      'fact', 'shared', null)`.execute(ctx.db);

  const before = await readQueryRows(
    sql`select * from memory_items order by item_id`,
    ctx.db,
    z.record(z.string(), z.unknown()),
  );

  await ctx.db.transaction().execute((tx) => memorySensitiveMigration.up(tx));

  const after = await sql`select * from memory_items order by item_id`.execute(ctx.db);
  const flags = await sql`select is_sensitive from memory_items`.execute(ctx.db);

  expect(after.rows).toStrictEqual(before.map((row) => expect.objectContaining(row)));
  expect(flags.rows).toStrictEqual([{ is_sensitive: 0 }, { is_sensitive: 0 }, { is_sensitive: 0 }]);
});

test('it marks every proposal not sensitive and leaves its other fields and the count unchanged', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.proposed', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation,
    target_version, is_pinned, review_reason, status, action_hash, sealed, origin, source, cap_group,
    created_sequence, created_at, lapse_at, kind, subject) values
    ('5a0e7c3d-2b9f-4f61-a8d4-3c6e1b7f0a92', '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 1, 'remember',
      null, 0, 'self_note', 'pending', 'hash-a', 'sealed-a', 'conversation', 'owner', 'group-a', 1,
      1767225600000, 1767830400000, 'self', 'self'),
    ('e4b8a1f5-9c3d-4a27-b6e0-7d2f5c8a1b43', '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 0, 'pin',
      2, 1, 'pinned', 'rejected', 'hash-b', 'sealed-b', 'memory_writer', 'untrusted', 'group-b', 1,
      1767225600000, 1767830400000, 'fact', 'owner')`.execute(ctx.db);

  const before = await readQueryRows(
    sql`select * from memory_proposals order by proposal_id`,
    ctx.db,
    z.record(z.string(), z.unknown()),
  );

  await ctx.db.transaction().execute((tx) => memorySensitiveMigration.up(tx));

  const after = await sql`select * from memory_proposals order by proposal_id`.execute(ctx.db);
  const flags = await sql`select is_sensitive from memory_proposals`.execute(ctx.db);

  expect(after.rows).toStrictEqual(before.map((row) => expect.objectContaining(row)));
  expect(flags.rows).toStrictEqual([{ is_sensitive: 0 }, { is_sensitive: 0 }]);
});

test('it keeps a sensitive item sensitive when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memorySensitiveMigration.up(tx));

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, kind, subject, is_sensitive) values
    ('c91f3e06-7a2b-4d58-8e14-6b0d2f9a7c35', 1, 'active', 0, 1, 1, 'm2hx6p9rke', 'fact', 'owner',
      1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memorySensitiveMigration.up(tx));

  const rows = await sql`select is_sensitive from memory_items`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ is_sensitive: 1 }]);
});

test('it marks a row that the release before inserts afterwards not sensitive', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memorySensitiveMigration.up(tx));

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, kind, subject) values
    ('c91f3e06-7a2b-4d58-8e14-6b0d2f9a7c35', 1, 'active', 0, 1, 1, 'm2hx6p9rke', 'fact',
      'owner')`.execute(ctx.db);

  const rows = await sql`select is_sensitive from memory_items`.execute(ctx.db);

  expect(rows.rows).toStrictEqual([{ is_sensitive: 0 }]);
});
