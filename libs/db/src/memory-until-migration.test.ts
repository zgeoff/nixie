import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { memoryUntilMigration } from './memory-until-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-memory-until-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryUntilMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it moves the schema to version 23, which the release before cannot read', () => {
  expect(nixieSchema.migrations.indexOf(memoryUntilMigration) + 1).toBe(23);
  expect(nixieSchema.oldestReader).toBeGreaterThanOrEqual(23);
});

test('it keeps each version of a database it upgrades, with no end time', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id) values
    ('6d1e0b47-2c9a-4f83-b5e6-0a7c3d9f1b24', 1, 'active', 0, 1, 1, 'q4hz8n2tcw')`.execute(ctx.db);

  await sql`insert into memory_versions (version_key, item_id, version, change, state, sealed,
    origin, source, sequence, snapshot_hash, recorded_at, model) values
    ('version-a', '6d1e0b47-2c9a-4f83-b5e6-0a7c3d9f1b24', 1, 'created', 'active', 'c2VhbGVk',
    'owner', 'owner', 1, 'snapshot-a', 1767225600000, null)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const versions = await sql`select version_key, origin, model, until
    from memory_versions`.execute(ctx.db);

  const items = await sql`select item_id, until from memory_items`.execute(ctx.db);

  expect(versions.rows).toStrictEqual([
    { version_key: 'version-a', origin: 'owner', model: null, until: null },
  ]);

  expect(items.rows).toStrictEqual([
    { item_id: '6d1e0b47-2c9a-4f83-b5e6-0a7c3d9f1b24', until: null },
  ]);
});

test('it stores a version with the lapse origin and an end time', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, until) values
    ('6d1e0b47-2c9a-4f83-b5e6-0a7c3d9f1b24', 1, 'retired', 0, 1, 1, 'q4hz8n2tcw',
    1767312000000)`.execute(ctx.db);

  await sql`insert into memory_versions (version_key, item_id, version, change, state, sealed,
    origin, source, sequence, snapshot_hash, recorded_at, until) values
    ('version-a', '6d1e0b47-2c9a-4f83-b5e6-0a7c3d9f1b24', 1, 'retired', 'retired', 'c2VhbGVk',
    'lapse', 'owner', 1, 'snapshot-a', 1767225600000, 1767312000000)`.execute(ctx.db);

  const versions = await sql`select origin, until from memory_versions`.execute(ctx.db);

  expect(versions.rows).toStrictEqual([{ origin: 'lapse', until: 1_767_312_000_000 }]);
});

test('it keeps each version when it runs again', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id, until) values
    ('6d1e0b47-2c9a-4f83-b5e6-0a7c3d9f1b24', 1, 'active', 0, 1, 1, 'q4hz8n2tcw',
    1767312000000)`.execute(ctx.db);

  await sql`insert into memory_versions (version_key, item_id, version, change, state, sealed,
    origin, source, sequence, snapshot_hash, recorded_at, until) values
    ('version-a', '6d1e0b47-2c9a-4f83-b5e6-0a7c3d9f1b24', 1, 'created', 'active', 'c2VhbGVk',
    'owner', 'owner', 1, 'snapshot-a', 1767225600000, 1767312000000)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryUntilMigration.up(tx));

  const versions = await sql`select version_key, until from memory_versions`.execute(ctx.db);

  expect(versions.rows).toStrictEqual([{ version_key: 'version-a', until: 1_767_312_000_000 }]);
});
