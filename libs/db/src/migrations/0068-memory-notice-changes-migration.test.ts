import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Kysely, sql } from 'kysely';
import { runMigrations } from '../migration/run-migrations';
import { nixieSchema } from '../schema/nixie-schema';
import { buildSqliteWorkerDialect } from '../sqlite/build-sqlite-worker-dialect';
import { readRunPrefix } from '../test-utils/read-run-prefix';
import { memoryNoticeChangesMigration } from './0068-memory-notice-changes-migration';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const prefix = await readRunPrefix();
  const directory = await mkdtemp(join(tmpdir(), `${prefix}nixie-notice-changes-`));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const db = new Kysely<unknown>({
    dialect: buildSqliteWorkerDialect(join(directory, 'nixie.db')),
  });

  stack.defer(() => db.destroy());

  await runMigrations(db, {
    schema: {
      migrations: nixieSchema.migrations.slice(
        0,
        nixieSchema.migrations.indexOf(memoryNoticeChangesMigration),
      ),
      oldestReader: 0,
    },
    copyDir: directory,
  });

  return { db, directory };
}

test('it is the migration of version 68', () => {
  expect(nixieSchema.migrations.indexOf(memoryNoticeChangesMigration) + 1).toBe(68);
});

test('it keeps each notice entry of a database it upgrades', async () => {
  const ctx = await setupTest();

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.version_added', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_notice_entries (entry_key, notice_key, thread, item_id, version,
    change, proposal_id, sequence, recorded_at) values
    ('version/a', 'run/run-4', 'conversation', 'f3a7c1d2-5e8b-4a90-b6d4-2c1e9f0a7b58', 2,
      'edited', null, 1, 1767225600000)`.execute(ctx.db);

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  const entries = await sql`select * from memory_notice_entries`.execute(ctx.db);
  const broken = await sql`select * from pragma_foreign_key_check`.execute(ctx.db);

  expect(entries.rows).toStrictEqual([
    {
      entry_key: 'version/a',
      notice_key: 'run/run-4',
      thread: 'conversation',
      item_id: 'f3a7c1d2-5e8b-4a90-b6d4-2c1e9f0a7b58',
      version: 2,
      change: 'edited',
      proposal_id: null,
      sequence: 1,
      recorded_at: 1_767_225_600_000,
    },
  ]);

  expect(broken.rows).toStrictEqual([]);
});

test.each(['labelled', 'pinned', 'unpinned'])(
  'it stores a notice entry whose change is %s, and keeps the index by thread',
  async (change) => {
    const ctx = await setupTest();

    await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (1, 1767225600000, 'memory.labelled', 'snapshot-a', '{}')`.execute(ctx.db);

    await sql`insert into memory_notice_entries (entry_key, notice_key, thread, item_id, version,
      change, proposal_id, sequence, recorded_at) values
      ('entry/a', 'run/run-4', 'conversation', 'f3a7c1d2-5e8b-4a90-b6d4-2c1e9f0a7b58',
        null, ${change}, null, 1, 1767225600000)`.execute(ctx.db);

    const entries = await sql`select change from memory_notice_entries`.execute(ctx.db);

    const indexes = await sql`select name from pragma_index_list('memory_notice_entries')
      where origin = 'c'`.execute(ctx.db);

    expect(entries.rows).toStrictEqual([{ change }]);
    expect(indexes.rows).toStrictEqual([{ name: 'memory_notice_entries_by_thread' }]);
  },
);

test('it refuses a notice entry whose change it does not know', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.labelled', 'snapshot-a', '{}')`.execute(ctx.db);

  const insert = sql`insert into memory_notice_entries (entry_key, notice_key, thread, item_id,
    version, change, proposal_id, sequence, recorded_at) values
    ('entry/a', 'run/run-4', 'conversation', 'f3a7c1d2-5e8b-4a90-b6d4-2c1e9f0a7b58', null,
      'renamed', null, 1, 1767225600000)`.execute(ctx.db);

  await Promise.allSettled([insert]);

  expect(insert).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_CHECK' });
});

test('it keeps each notice entry when it runs again', async () => {
  const ctx = await setupTest();

  await runMigrations(ctx.db, { schema: nixieSchema, copyDir: ctx.directory });

  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (1, 1767225600000, 'memory.pinned', 'snapshot-a', '{}')`.execute(ctx.db);

  await sql`insert into memory_notice_entries (entry_key, notice_key, thread, item_id, version,
    change, proposal_id, sequence, recorded_at) values
    ('pin/1', 'run/run-4', 'conversation', 'f3a7c1d2-5e8b-4a90-b6d4-2c1e9f0a7b58', null,
      'pinned', null, 1, 1767225600000)`.execute(ctx.db);

  await ctx.db.transaction().execute((tx) => memoryNoticeChangesMigration.up(tx));

  const entries = await sql`select entry_key from memory_notice_entries`.execute(ctx.db);

  expect(entries.rows).toStrictEqual([{ entry_key: 'pin/1' }]);
});
