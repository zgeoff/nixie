import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { memorySubjectsMigration } from './memory-subjects-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';
import { runSubjectMigrationDryRun } from './run-subject-migration-dry-run';
import { startDatabase } from './start-database';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-subjects-dry-run-test-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const path = join(directory, 'nixie.db');
  const db = startDatabase(path);

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

  return { db, path };
}

test('it reports the subject counts before and after the migration that a copy of the database takes', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, kind) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1, 'b7kq2m9xza', 'fact'),
    ('c91f3e06-7a2b-4d58-8e14-6b0d2f9a7c35', 1, 'retired', 0, 1, 1, 'm2hx6p9rke', 'fact'),
    ('8d2e4b71-0c5f-4e9a-b3d6-1f7a9c2e5b80', 1, 'active', 0, 1, 1, 'q4wz8n3vtc', 'self')`.execute(
    ctx.db,
  );

  const report = await runSubjectMigrationDryRun(ctx.path);

  expect(report).toStrictEqual({
    from: 17,
    to: 24,
    before: {
      items: { owner: 2, shared: 0, self: 1 },
      proposals: { owner: 0, shared: 0, self: 0 },
    },
    after: { items: { owner: 2, shared: 0, self: 1 }, proposals: { owner: 0, shared: 0, self: 0 } },
  });
});

test('it leaves the database it reads at the schema it found', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await runSubjectMigrationDryRun(ctx.path);

  const version = await sql`select version from schema_version`.execute(ctx.db);

  const columns = await sql`select name from pragma_table_info('memory_items')
    where name = 'subject'`.execute(ctx.db);

  expect(version.rows).toStrictEqual([{ version: 17 }]);
  expect(columns.rows).toStrictEqual([]);
});

test('it refuses a path that holds no database', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  expect(runSubjectMigrationDryRun(`${ctx.path}.missing`)).rejects.toMatchObject({
    code: 'SQLITE_CANTOPEN',
  });
});

test('it counts the rows a database still holds only in its write-ahead log, while its writer stays open', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`pragma wal_autocheckpoint = 0`.execute(ctx.db);

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, kind) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1, 'b7kq2m9xza', 'self')`.execute(
    ctx.db,
  );

  const report = await runSubjectMigrationDryRun(ctx.path);

  expect(report.before.items).toStrictEqual({ owner: 0, shared: 0, self: 1 });
});
