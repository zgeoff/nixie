import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { countMemorySubjects } from './count-memory-subjects';
import { nixieSchema } from './nixie-schema';
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

test('it counts the items and proposals of each subject', async () => {
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

  const counts = await countMemorySubjects(ctx.db);

  expect(counts).toStrictEqual({
    items: { owner: 1, shared: 2, self: 0 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});

test('it counts nothing in a database from before memory', async () => {
  const ctx = await setupTest();
  const counts = await countMemorySubjects(ctx.db);

  expect(counts).toStrictEqual({
    items: { owner: 0, shared: 0, self: 0 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});
