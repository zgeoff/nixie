import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { nixieSchema } from './nixie-schema';
import { readMemorySubjectCounts } from './read-memory-subject-counts';
import { runMigrations } from './run-migrations';
import { startDatabase } from './start-database';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-count-subjects-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const db = startDatabase(join(dir, 'nixie.db'));

  stack.defer(() => db.destroy());

  return { db, dir };
}

test('it counts the items of each subject', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.dir });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, subject) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1, 'b7kq2m9xza', 'owner'),
    ('c91f3e06-7a2b-4d58-8e14-6b0d2f9a7c35', 1, 'active', 0, 1, 1, 'm2hx6p9rke', 'shared'),
    ('8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 1, 'active', 0, 1, 1, 'q4wz8n3vtc', 'shared')`.execute(
    ctx.db,
  );

  const counts = await readMemorySubjectCounts(ctx.db);

  expect(counts).toStrictEqual({
    items: { owner: 1, shared: 2, self: 0 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});

test('it counts the proposals of each subject', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.dir });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.proposal_created', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_proposals (proposal_id, item_id, is_new_item, operation, is_pinned,
    review_reason, status, action_hash, sealed, origin, source, cap_group, created_sequence,
    created_at, lapse_at, subject) values
    ('5b1d7e3a-2c9f-4a60-8d4e-7f2a1c6b9e05', '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'remember',
      0, 'no_quote', 'pending', 'sha256:a1', 'sealed-a', 'conversation', 'untrusted', 'group-a', 1,
      1767225600000, 1767312000000, 'owner'),
    ('e4a9c2f6-7d1b-4e38-9a05-3c8f6b2d1e74', 'c91f3e06-7a2b-4d58-8e14-6b0d2f9a7c35', 1, 'remember',
      0, 'no_quote', 'pending', 'sha256:b2', 'sealed-b', 'conversation', 'untrusted', 'group-a', 1,
      1767225600000, 1767312000000, 'shared'),
    ('0f6b3d8e-9a2c-4b71-a5e4-1d7c9f2b6a38', '8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 1, 'remember',
      0, 'self_note', 'pending', 'sha256:c3', 'sealed-c', 'conversation', 'untrusted', 'group-a',
      1, 1767225600000, 1767312000000, 'self')`.execute(ctx.db);

  const counts = await readMemorySubjectCounts(ctx.db);

  expect(counts).toStrictEqual({
    items: { owner: 0, shared: 0, self: 0 },
    proposals: { owner: 1, shared: 1, self: 1 },
  });
});

test('it counts a row the release before wrote with no subject by its kind', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.dir });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, kind, subject) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1, 'b7kq2m9xza', 'fact', null),
    ('8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 1, 'active', 0, 1, 1, 'q4wz8n3vtc', 'self', null)`.execute(
    ctx.db,
  );

  const counts = await readMemorySubjectCounts(ctx.db);

  expect(counts).toStrictEqual({
    items: { owner: 1, shared: 0, self: 1 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});

test('it counts nothing in a database from before memory', async () => {
  const ctx = await setupTest();
  const counts = await readMemorySubjectCounts(ctx.db);

  expect(counts).toStrictEqual({
    items: { owner: 0, shared: 0, self: 0 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});
