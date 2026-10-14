import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import { memoryShortIDsMigration } from './memory-short-ids-migration';
import { nixieSchema } from './nixie-schema';
import { runMigrations } from './run-migrations';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-short-ids-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const statements: string[] = [];
  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(dir, 'nixie.db')),
    log: (event) => {
      statements.push(event.query.sql);
    },
  });

  stack.defer(() => db.destroy());

  // the schema the release before leaves, which the migration starts from
  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryShortIDsMigration),
      ),
      oldestReader: 0,
    },
    copyDir: dir,
  });

  return { db, statements };
}

test('it moves the schema to version 11', () => {
  expect(nixieSchema.migrations.indexOf(memoryShortIDsMigration) + 1).toBe(11);
});

test('it backfills each existing item with the short ID its UUID gives', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);
  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1),
    ('b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94', 1, 'retired', 0, 1, 1)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryShortIDsMigration.up(tx));

  const rows = await sql`select item_id, short_id from memory_items order by item_id`.execute(
    ctx.db,
  );

  expect(rows.rows).toStrictEqual([
    { item_id: '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', short_id: 'as2nducz6x' },
    { item_id: 'b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94', short_id: 'fhtocv6232' },
  ]);
});

test('it leaves the short IDs as they are when it runs again', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);
  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1)`.execute(ctx.db);
  await ctx.db.transaction().execute((tx) => memoryShortIDsMigration.up(tx));
  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence, short_id) values
    ('b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94', 1, 'active', 0, 1, 1, 'k3x9m2p7qa')`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryShortIDsMigration.up(tx));

  const rows = await sql`select item_id, short_id from memory_items order by item_id`.execute(
    ctx.db,
  );

  expect(rows.rows).toStrictEqual([
    { item_id: '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', short_id: 'as2nducz6x' },
    { item_id: 'b81d4e07-2c9f-4a63-8e15-0f7a2d6c3b94', short_id: 'k3x9m2p7qa' },
  ]);
});

test('it leaves every version and its sealed text untouched', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);
  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1)`.execute(ctx.db);
  await sql`insert into memory_versions (version_key, item_id, version, change, state, sealed,
    origin, source, sequence, snapshot_hash, recorded_at) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13@1', '3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1,
    'created', 'active', 'c2VhbGVkIHRleHQ=', 'owner', 'owner', 1, 'snapshot-a', 1767225600000)`.execute(
    ctx.db,
  );
  const before = await sql`select * from memory_versions`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryShortIDsMigration.up(tx));

  const after = await sql`select * from memory_versions`.execute(ctx.db);

  expect(after.rows).toStrictEqual(before.rows);
});

test('it reads no version, so it never reads an item text', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);
  await sql`insert into memory_items (item_id, version, state, is_pinned, created_sequence,
    updated_sequence) values
    ('3f6c1a52-8e0b-4d7a-9c21-5b7e4f0d9a13', 1, 'active', 0, 1, 1)`.execute(ctx.db);
  ctx.statements.splice(0);

  await ctx.db.transaction().execute((tx) => memoryShortIDsMigration.up(tx));

  expect(ctx.statements).toSatisfyAny((statement: string) => statement.startsWith('update'));
  expect(ctx.statements).toSatisfyAll(
    (statement: string) => !statement.includes('memory_versions'),
  );
});
